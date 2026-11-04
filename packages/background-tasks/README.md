---
description: "后台任务：让 Bash 命令在后台运行，登记状态、保留日志，并把结果通知给模型。"
kind: "package-group"
---

# background-tasks

后台任务现在只有一种来源：转后台的 Bash 命令（`bash`）。子智能体不在这里，有自己的管理器、工具和通知（见 [`subagent/`](../subagent/README.md)）。登记表记录每个任务的状态与输出，并保证每个结果只送达模型一次；模型通过工具查看、等待和停止任务。命令进程归 `tool-shell` 持有，日志写在会话目录 `sessions-v2/<id>/bash-log/` 下随会话保留（单会话超 50MB 时清理最早已结束的），这里只管登记与通知。同一会话最多 5 个后台 Bash。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `background-tasks` | 接口 | 库 | — | 登记表（`registry.ts`）、任务类型与状态（`types.ts`）、完成与输出匹配通知的渲染（`notification.ts`）；以 Host 端口 `actspace.host.background-tasks` 提供 |
| `tool-background-tasks` | 工具 | 会话 | 开 | `task_list`、`task_output`（支持 `since` 增量读）、`task_stop`、`task_wait`；只管 Bash；提供 `tools.background-tasks` |

## 包之间怎么连

- `background-tasks` 没有插件入口，是库。登记表由 `core/runtime` 的 `agent-runtime` 插件创建，启动时（`runtime/src/startup/boot.ts`）以 `actspace.host.background-tasks` 端口暴露给使用它的插件。
- 注入这个端口的插件：`tool-background-tasks`（查询与停止）、`tool-shell`（登记转后台的命令）、`context-background-tasks`（把任务状态告诉模型，在 [`context/`](../context/README.md)）。
- 登记表把任务起止写进会话 Journal，并通过主 Agent 的收件箱投递完成通知，依赖 `agent`、`session-persistence`；通知投递到空闲会话时会唤醒调度。
- `tool-background-tasks` 另 inject `tools.runtime`。

## 入口与测试

- `background-tasks/src/registry.ts`、`notification.ts`、`types.ts`；`tool-background-tasks/src/tools.ts`、`plugin.ts`。
- 测试在各包 `src/test/`：`pnpm --filter @actspace/background-tasks test`、`pnpm --filter @actspace/tool-background-tasks test`。
- 设计见[后台任务](../../docs/design-docs/collaboration/agent-background-tasks.md)。

## 怎么扩展

新增一种后台任务来源：在来源包里 inject `actspace.host.background-tasks`，通过登记表注册任务；需要新的任务种类时，改 `background-tasks/src/types.ts` 的 `BackgroundTaskKind`（现在只有 `bash`）并更新通知渲染。通用步骤见[总地图](../README.md)。
