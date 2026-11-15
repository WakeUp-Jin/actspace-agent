---
description: "会话的事实源与读写：日志、持久化接口、JSONL 物理存储、视图、检查点和会话记录 Markdown。"
kind: "package-group"
---

# session

会话的事实源是 `sessions-v2/<id>/journal.jsonl`。日志语义、持久化协调、物理存储和视图是四个可以单独替换的边界，任何一层都不能复制一份可变的对话状态。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `session-journal` | 接口 | 全局 | 开 | 日志语义：事件信封、Codec 注册表、校验、Surface、分叉、压缩事件；提供 `session.journal` |
| `session-persistence` | 接口 | 全局 | 开 | 在日志与存储之间做业务协调：创建、打开、写入、恢复；提供 `session.store` |
| `session-persistence-jsonl` | 实现 | 全局 | 开 | 把会话保存为本机 JSONL 文件（含写入租约、修复、查询读取）；提供 `session.storage` |
| `session-projection` | 接口 | 全局 | 开 | 把日志事件整理成界面和 Agent 能读的状态（投影注册表）；提供 `session.projection` |
| `session-projection-cache` | 库 | 库 | — | 可丢弃的派生缓存：单会话日志缓存和跨会话摘要索引，丢了可从日志重建；轮次、请求、工具调用在日志里的位置索引（`history-index.ts`）也在这里，冷会话缓存和 `core/runtime` 里打开中的会话共用 |
| `session-storage` | 接口 | 库 | — | 中立的物理存储端口（`SessionStorage` 等类型），不含实现 |
| `session-checkpoint-policy` | 实现 | 全局 | 开 | 决定什么时候给会话存检查点（flush）；提供 `session.checkpoint` |
| `session-transcript` | 实现 | 全局 | 开 | 每轮结束从日志重写 `sessions-v2/<id>/transcript.md`（派生视图，可删除重建），并在主会话提示词里告诉 Agent 怎么读历史会话；提供 `session.transcript` |

## 包之间怎么连

```
session-journal ──→ session-persistence ──→ session-storage（端口）
       │                    ↑                        ↑
       │         session.storage 由 ──────── session-persistence-jsonl 实现
       └──→ session-projection        session-runtime（core/runtime）把四者接成 session.runtime
                                             └──→ session-checkpoint-policy（session.checkpoint）
```

- `session-journal` 提供 `session.journal`，inject `actspace.host.session.codecs`，Codec 通过 `./codec` 导出。
- `session-persistence-jsonl` 提供 `session.storage`，inject `actspace.host.session`、`session.journal`；`session-persistence` 提供 `session.store`，inject `session.journal`、`session.storage`。
- `session-projection` 提供 `session.projection`；`todo-projection`（`todo/tool-todo`）等投影插件 inject 它来注册自己的投影。
- `session-runtime`（在 [`core/runtime`](../core/README.md)）inject 以上四项，提供 `session.runtime`；`session-checkpoint-policy` inject `session.runtime`。
- `session-projection-cache` 没有插件入口，由 `core/runtime` 直接使用。
- `session-transcript` inject `actspace.host.session`、`session.runtime`、`session.storage`，在每轮结束时读日志、写 `transcript.md`；读 transcript 不弹审批由 `core/runtime` 的 `isHostReadablePath` 放行。

## 入口与测试

- 日志：`session-journal/src/journal.ts`、`codec-registry.ts`、`surface.ts`；持久化：`session-persistence/src/session-persistence.ts`、`coordinator.ts`、`recovery.ts`；JSONL：`session-persistence-jsonl/src/storage.ts`、`jsonl-writer.ts`、`writer-lease.ts`；投影：`session-projection/src/registry.ts`。
- 测试在各包 `src/test/`：`pnpm --filter @actspace/session-journal test`，其他包同理。

## 怎么扩展

- **换一种物理存储**（例如 SQLite）：新建 `session/session-persistence-<名>`，实现 `session-storage` 里的 `SessionStorage`，provides `session.storage`；在 `core/runtime/src/plugin-catalog.ts` 用新包替换 `session-jsonl` 那一行（同名服务只能有一个提供者），并更新 `core/runtime/package.json`。日志语义和持久化协调不用改。
- **给物理存储加一种能力**（`refresh`、`rewritePrefix` 这类可选方法）：加到 `session-storage` 的 `SessionStorage` 接口，在 `session-persistence-jsonl/src/storage.ts` 实现，再在同包 `plugin.ts` 的包装服务里转发。注册在 `session.storage` 下的是这个包装服务，消费方按「有没有这个方法」判断后端支不支持，漏转发不报错、只表现为不支持；包装类用 `implements` 约束了存储的全部公开成员，漏了编译不过。
- **新增一种会话事件**：在拥有它的插件里写 Codec（`./codec`），登记到清单的 `codec` 字段；Host 在恢复会话前加载 Codec。
- **给 core 名下的事件加一种或加字段**（`turn/*`、`step/*`、`tool/*`、`permission/*` 这些来源是 `@actspace/core` 的事件）：先改 `util/shared/src/runtime-v2/core-events.ts` 的 `CoreEventDataMap`，再改 `session-journal/src/core-codecs.ts`（新事件名登记进 `CORE_EVENT_TYPES` 或 `PERSISTED_EXTENSION_EVENT_TYPES`，运行时校验也写在这里），写入处用 `coreEvent(type, data)`。只改表不登记，`session-journal` 编译不过；绕过 `coreEvent` 手拼事件对象会被 `pnpm check:core-events` 拦下。
- 通用步骤见[总地图](../README.md)。
