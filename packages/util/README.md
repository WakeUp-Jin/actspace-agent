---
description: "公共的小库：跨进程共享的协议与类型、启动诊断。"
kind: "package-group"
---

# util

两个库包，被很多包依赖，自己几乎不依赖别人。`shared` 是桌面端、Host 和界面共用的协议与数据类型；`diagnostics` 记录启动诊断并脱敏。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `shared` | 库 | 库 | — | 跨进程协议与类型：IPC、Host 协议、会话与上下文投影类型、模型配置与目录、浏览器桥接、英语学习协议；外加几个到处要用的纯函数（数据目录、子进程环境变量、路径包含判断）；几乎所有能力包都依赖它 |
| `diagnostics` | 库 | 库 | — | `BootDiagnostics`：记录启动诊断，对授权、密钥、令牌等字段做 `[REDACTED]` 脱敏 |

## 包之间怎么连

- `shared` 是被依赖最多的包（几乎每个能力目录都有包依赖它），它不依赖任何插件。
- `diagnostics` 依赖 `cordis-adapter` 的 JSON 类型；被 `boot`、`composition`、`core/runtime` 依赖。
- 两个包都不在插件清单里。

## 入口与测试

- `shared/src/index.ts`（按主题分文件，如 `model-config.ts`、`host-protocol/`、`desktop-bridge/`）；`diagnostics/src/index.ts`。
- `shared` 里两组体量最大的类型各占一个目录，目录内再按主题分文件，`index.ts` 只做转出：
  - `shared/src/ipc/`：桌面 renderer ⇄ main 的 IPC 契约，按通道分 `bootstrap`、`models`、`composer`、`approvals`、`sessions`、`workspace-git`、`workspace-files`、`artifacts`、`usage`、`local-update`、`plugins`。**只有客户端表面能引用**（`apps/*`、`packages/client/*`、`packages/host/*`），`pnpm check:packages` 会检查其他能力包有没有从 `@actspace/shared` 拿这里的名字。
  - `shared/src/session/`：前后端共用的会话领域模型，分 `primitives`（id 别名、错误、费用）、`attachments`、`events`（持久化事件与 payload、`SessionMeta`、`AgentRunResult`）、`stream-events`（`RuntimeStreamEvent`）、`tool-preview`（工具与子 Agent 的 UI 预览）、`context`（上下文用量与状态）、`message-block`（聊天渲染块、diff 汇总）。
- `shared/src/path-containment.ts`：「一个路径是不是在某个目录里面」只在这里实现一次。`isLexicallyInside(rules, root, candidate, { includeRoot })` 回答是或否，路径就是根目录本身时算不算必须写明；`relativePathInside(rules, root, candidate)` 在里面时返回相对路径，不在里面返回 `null`。`shared` 自己不引 `node:path`，路径规则由调用方传：Node 里传 `node:path`，界面里传 `pathe`。两个函数只比较字面，不解析符号链接，要防符号链接指到外面，先对两边做 realpath。别处不要再手写 `relative(...).startsWith("..")` 这类判断：`pnpm check:path-containment`（`scripts/check-path-containment.mjs`，CI 里随 `pnpm test:scripts` 跑）会报出来；确实要保留的文件记在那个脚本的 `ALLOWED` 里，写明理由和处数。
- `shared/src/runtime-v2/core-events.ts`：归 core 所有的 Session 事件（来源是 `@actspace/core`）每种的 `data` 长什么样，记在 `CoreEventDataMap` 一张表里。写这些事件只用 `coreEvent(type, data, { surface?, provenance? })`：事件名不在表里、字段名写错、少了必填字段，编译不过。加事件或加字段先改这张表，再改 `packages/session/session-journal/src/core-codecs.ts`（事件名登记进那里的名单，运行时校验也在那里）；表里有而那边没登记的事件名，`session-journal` 编译不过。别处不要自己拼带 core 来源的事件对象：`pnpm check:core-events`（`scripts/check-core-event-writes.mjs`）会拦，例外记在脚本的 `ALLOWED` 里并写明理由。别的插件写自己名下的事件不受这条约束，仍然直接交给 `session.append`。
- 测试：`pnpm --filter @actspace/shared test`、`pnpm --filter @actspace/diagnostics test`。

## 怎么扩展

新类型先判断归属：只有一个能力用，就放在那个能力的包里；多个能力或界面共用，才放进 `shared`。进了 `shared` 再分两层：只有桌面 renderer ⇄ main 用到的放 `ipc/` 对应通道文件；后端包也要读写的放 `session/` 或其他主题文件，不要让 Runtime 包依赖 IPC 的输入输出形状。像 `assertNever` 这样的单函数小工具直接写在用到它的文件里，至少两个包要用时再考虑进 `shared`。通用步骤见[总地图](../README.md)。
