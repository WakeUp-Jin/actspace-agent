---
description: "后台任务：登记转后台的 Bash 命令和后台子智能体，记录状态，并把结果通知给模型。"
kind: "package-group"
---

# background-tasks

后台任务有两种来源：转后台的 Bash 命令（`bash`）和后台子智能体（`agent`，`taskId` 就是 `agent_id`，见 [`subagent/`](../subagent/README.md)）。登记表记录每个任务的状态与输出，统一发完成通知，重启后把没收尾的任务标 `lost`；模型通过 `task_list`、`task_output`、`task_stop` 查看和停止任务。命令进程归 `tool-shell` 持有，子智能体由 `SubagentManager` 运行，登记时给出 transcript 路径、结束信号和停止方法。

日志、通知与唤醒、并发上限等规则只写在[后台任务](../../docs/design-docs/collaboration/agent-background-tasks.md)，这里只写包怎么分、怎么连。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `background-tasks` | 接口 | 库 | — | 登记表（`registry.ts`）、任务类型与状态（`types.ts`）、完成与输出匹配通知的渲染（`notification.ts`）；以 Host 端口 `actspace.host.background-tasks` 提供 |
| `tool-background-tasks` | 工具 | 会话 | 开 | `task_list`、`task_output`（支持 `since` 增量读；子智能体返回 transcript 尾部）、`task_stop`；提供 `tools.background-tasks` |

## 包之间怎么连

- `background-tasks` 没有插件入口，是库。登记表由 `core/runtime` 的 `agent-runtime` 插件创建，启动时（`runtime/src/startup/boot.ts`）以 `actspace.host.background-tasks` 端口暴露给使用它的插件。
- 使用登记表的：`tool-background-tasks`（查询与停止）、`tool-shell`（登记转后台的命令）、`context-background-tasks`（把任务状态告诉模型，在 [`context/`](../context/README.md)），以及 `agent-runtime` 创建 `SubagentManager` 时直接传入登记表（登记后台子智能体）。
- 登记表把任务起止写进会话 Journal，并通过主 Agent 的收件箱投递完成通知，依赖 `agent`、`session-persistence`；通知投递到空闲会话时会唤醒调度。
- `tool-background-tasks` 另 inject `tools.runtime`。

## 入口与测试

- `background-tasks/src/registry.ts`、`notification.ts`、`types.ts`；`tool-background-tasks/src/tools.ts`、`plugin.ts`。
- 测试在各包 `src/test/`：`pnpm --filter @actspace/background-tasks test`、`pnpm --filter @actspace/tool-background-tasks test`。

## 怎么扩展

新增一种后台任务来源：在来源包里 inject `actspace.host.background-tasks`，通过登记表注册任务；需要新的任务种类时，改 `background-tasks/src/types.ts` 的 `BackgroundTaskKind`（现在有 `bash`、`agent`）并更新通知渲染。通用步骤见[总地图](../README.md)。
