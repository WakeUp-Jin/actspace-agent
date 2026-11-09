---
description: "公共的小库：跨进程共享的协议与类型、启动诊断。"
kind: "package-group"
---

# util

两个库包，被很多包依赖，自己几乎不依赖别人。`shared` 是桌面端、Host 和界面共用的协议与数据类型；`diagnostics` 记录启动诊断并脱敏。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `shared` | 库 | 库 | — | 跨进程协议与类型：IPC、Host 协议、会话与上下文投影类型、模型配置与目录、浏览器桥接、英语学习协议；几乎所有能力包都依赖它 |
| `diagnostics` | 库 | 库 | — | `BootDiagnostics`：记录启动诊断，对授权、密钥、令牌等字段做 `[REDACTED]` 脱敏 |

## 包之间怎么连

- `shared` 是被依赖最多的包（几乎每个能力目录都有包依赖它），它不依赖任何插件。
- `diagnostics` 依赖 `cordis-adapter` 的 JSON 类型；被 `boot`、`composition`、`core/runtime` 依赖。
- 两个包都不在插件清单里。

## 入口与测试

- `shared/src/index.ts`（按主题分文件，如 `model-config.ts`、`host-protocol/`、`desktop-bridge/`）；`diagnostics/src/index.ts`。
- 测试：`pnpm --filter @actspace/shared test`、`pnpm --filter @actspace/diagnostics test`。

## 怎么扩展

新类型先判断归属：只有一个能力用，就放在那个能力的包里；多个能力或界面共用，才放进 `shared`。像 `assertNever` 这样的单函数小工具直接写在用到它的文件里，至少两个包要用时再考虑进 `shared`。通用步骤见[总地图](../README.md)。
