---
description: "子智能体：把任务交给一个临时的子会话，做完就结束；默认同步，也可以后台跑（登记进后台任务）；也可以交给本机的 Codex / Claude Code。管理器在 Host，工具定义在 Harness。"
kind: "package-group"
---

# subagent

子智能体是主会话派出的临时子会话（`agent_id` 就是子会话 id），只跑一次，结束即关闭。管理器（`SubagentManager`）在 Host，工具定义在每个会话的 Harness 里，两者通过 `actspace.host.subagents` 端口相连；后台子智能体登记进[后台任务](../background-tasks/README.md)登记表。

行为规则（工具、预设与权限、模型、留痕与通知、fork、外部子智能体、生命周期）只写在[子智能体运行规范](../../docs/design-docs/collaboration/agent-subagent-runtime.md)；模型可见的英文只在 `subagent/src/messages.ts`。这里只写包怎么分、怎么连。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `subagent` | 接口 | 不在默认组合 | — | `SubagentManager`、child Session、预设、模型可见文字、四个工具和外部工具的注册函数、外部 CLI 的公共件（`resolveCommand`、`terminate`）；由运行时创建、`tool-subagent` 注册工具 |
| `tool-subagent` | 工具 | 会话 | 开 | `agent`、`agent_fork`、`send_message`、`list_subagent_models` 四个工具的插件；提供 `tools.subagents` |
| `subagent-codex` | 工具 | 会话 | 关 | `agent_codex`：把任务交给本机的 `codex app-server`；提供 `tools.subagent-codex`（含可用性）；可在“插件”页开关 |
| `subagent-claude-code` | 工具 | 会话 | 关 | `agent_claude_code`：把任务交给本机的 `claude -p`；提供 `tools.subagent-claude-code`；可在“插件”页开关 |

## 包之间怎么连

- `core/runtime` 的 `agent-runtime` 创建 `SubagentManager`（子会话的运行租约来自 `harnesses.acquireForScope`，循环来自 `agent-factory` 的 `createSubagentLoop`），并把后台任务登记表传给它；启动时（`runtime/src/startup/boot.ts`）以 Host 端口 `actspace.host.subagents` 暴露给 Harness。打开会话时登记表先 `reconcile`，管理器再 `recoverLost`；退出时先关登记表，再关管理器。
- `tool-subagent` inject `tools.runtime`、`agent.registry`、`actspace.host.subagents`：用 `subagent` 的 `registerSubagentTools` 把四个工具注册到工具运行时；卸载时撤销注册。
- `subagent-codex`、`subagent-claude-code` inject 同样三项：启动时用登录 shell 找命令，找到才用 `registerExternalSubagentTool` 注册工具，调用走端口的 `spawnExternal`。插件设置来自 manifest 的 `config` 默认值，Host 的 `pluginConfig` 覆盖在上面。
- 外部记录不在 Host 可读目录里：`agent-factory` 的文件可读判断额外放行主会话子智能体投影里登记过的记录文件（`isExternalRecordPath`，精确到文件）。
- 状态折叠（`foldSubagentTree`）和事件词汇在 `@actspace/shared/runtime-v2`；运行中的后台子智能体由 `context/context-background-tasks` 写进主会话上下文。
- `subagent` 依赖 `agent-loop`、`scope`、`agent`（收件箱）、`background-tasks`（登记表）、`session-journal`、`session-persistence`（创建子会话）、`tool-runtime`。

## 入口与测试

- `subagent/src/manager.ts`、`tools.ts`、`messages.ts`、`child-session.ts`、`preset.ts`、`fork-boundary.ts`、`external.ts`、`external-cli.ts`；`tool-subagent/src/plugin.ts`；`subagent-codex/src/backend.ts`、`subagent-claude-code/src/backend.ts`。包 README 见 [subagent](subagent/README.md)。
- 测试在各包 `src/test/`：`pnpm --filter @actspace/subagent test`、`pnpm --filter @actspace/tool-subagent test`、`pnpm --filter @actspace/subagent-codex test`、`pnpm --filter @actspace/subagent-claude-code test`（后两个用假 CLI，不调真实命令）。fork 的缓存比对在 `scripts/test/host-subagent-fork-cache-process.test.mjs`。

## 怎么扩展

新增一种预设：在 `subagent/src/preset.ts` 加工具集，在 `@actspace/shared/runtime-v2` 的 `SUBAGENT_PRESETS` 登记，再把 `agent` 工具的 `agent_preset` 枚举、`messages.ts` 里的说明文字和运行规范「能力与权限」的预设表一起改。通用步骤见[总地图](../README.md)。
