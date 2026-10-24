## [2026-10-22 23:10] | Task: 后台任务——后台 Bash、后台子智能体与任务工具

### Execution Context

- Agent ID: `/root`
- Base Model: Claude Opus 5.5
- Runtime: Claude Code

### 用户诉求

给子智能体加 `background` 参数，参考 Kimi Code 与 OpenCode 做后台任务管理工具；后台结果要能自动送达 Agent（叫醒空闲会话），也能由 Agent 主动查询。界面保持简单：卡片只多一个「后台」标签，空闲唤醒的回合以细分隔行开头。

### 变更与动机

- **统一登记表** `@actspace/background-tasks`：Host 服务 `actspace.host.background-tasks`，Bash 与子智能体两种 kind；通知去重（`task_wait` 已报告、`task_stop` 停掉的不再通知）；持久事件 `background/task`（start / settle，带 `delivery`）；重启后未结算的标 `lost`。
- **唤醒**：Loop 回合末收件箱有通知就续一步；中断不丢通知；空闲会话由 `SessionRunManager.wake()` 提交不写 `user/message` 的唤醒任务，`runTurn({ wake: true })` 第一步领取通知并标 `opensTurn`。用户停止后的暂停不唤醒。
- **工具** `@actspace/tools-background-tasks`：`task_list` / `task_output` / `task_stop` / `task_wait`；删除 `bash_output` / `bash_kill`。
- **子智能体后台模式**：`agent` / `explore` 的 `background: true`，`launch()` 后立即返回，与父中断解耦，每会话最多 4 个。
- **上下文插件** `@actspace/context-background-tasks`：每轮开始写一次运行中任务清单，全部结束写收尾文本；轨迹分类「后台任务」。
- **前端**：Bash / 子 Agent 卡片单个「后台」标签，状态取 `background/task settle` 与 `delegation/completed`；唤醒回合开头 `BackgroundNoticeRow`（可展开通知原文）；队列、运行中用户块跳过唤醒任务；删除 `bash_task_update` 链路。修掉了后台 Bash 卡片永远停在「后台运行中」的问题（技术债 2026-07-03 偿还）。

### 关键文件

- `packages/background-tasks/`、`packages/tools/background-tasks/`、`packages/context/background-tasks/`
- `packages/core/agent/src/inbox.ts`、`packages/core/agent-loop/src/loop.ts`、`packages/agent-service/src/{run-manager,task-ledger,service}.ts`
- `packages/tools/shell-tools/src/{plugin,node-ports}.ts`、`packages/subagent/src/{provider,tool-plugin}.ts`
- `packages/client/src/sessions/{chat,tool-card}.ts`、`packages/client/src/live/*`、`apps/desktop/src/renderer/components/messages/{BackgroundNoticeRow,BashRunBlock,AgentRunBlock}.tsx`、`apps/desktop/src/renderer/components/conversation/turns.ts`
- 设计：`docs/design-docs/collaboration/agent-background-tasks.md`

### 验证与边界

- 定向测试与全量 `pnpm typecheck` / `pnpm test` 结果见[执行摘要](../../exec-runs/20261022-background-tasks/execution-summary.md)。
- 浏览器 mock `?mock=background-tasks` 浅 / 深主题截图通过。
- 未验证：Electron 真实唤醒、真实模型调用四个工具、子 Agent 面板里的后台子会话。
