## [2026-11-12 20:40] | Task: 子智能体简化为临时上下文窗口，后台的并入后台任务

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`（文档与读取类子任务用 `claude-sonnet-5-5`）
- **Runtime**: `Claude Code CLI (macOS)`

### 📥 User Query

> 对照我写的《Agent 的子智能体开发详解》检查项目里的子智能体实现，看哪里和我想的不一样、需要调整。开一个 worktree 从 main 拉功能分支来做。（逐项确认 R1–R12 后）执行计划你写，不用我过目，直接把这个功能完成。

### 🛠 Changes Overview

**Scope:** `packages/subagent/*`、`packages/background-tasks/*`、`packages/context/context-background-tasks`、删除 `packages/context/context-subagents`、`packages/core/{runtime,agent-service}`、`packages/session/session-journal`、`packages/util/shared`、`packages/client/client`、`apps/desktop`、`docs/`

**Key Actions:**

- **默认同步**：`agent` / `agent_fork` / 外部子智能体的 `background` 默认 `false`；同步等满 30 分钟转后台。
- **并入后台任务**：后台子智能体登记进后台任务登记表（`kind: "agent"`，`taskId` = `agent_id`）；完成通知统一成 `<task_notification>`，重启后的 `lost` 通知、`task_list` / `task_output` / `task_stop` 都由登记表负责。
- **删工具**：`wait_agent`、`task_wait`、`list_agents`、`interrupt_agent`；子智能体工具只剩 `agent`、`agent_fork`、`send_message`、`list_subagent_models`（外加两个外部子智能体工具）。
- **不续派**：一个子智能体只跑一次，结束即关闭；`send_message` 只有主→运行中的子、子→父两个方向，发给已结束的返回错误。
- **文字**：`send_message` 描述写明只用来补充事实或纠正目标（参考 grok-build）；`model` 参数说明写明检索用便宜模型、编辑用强模型。
- **上下文**：删 `context-subagents`，后台子智能体进「后台任务」清单，带 transcript 路径。
- **界面**：两个面板保留；子 Agent 面板的停止按钮对后台的走登记表、同步的直接中断；「空闲」状态去掉；通知行认新旧两种格式；`task_stop` 停子智能体读作「停止 ‹描述›」。
- **老会话**：`subagent_notification`、`trigger: "message"`、`delivery: "wait"`、多次激活照常只读展示，不迁移。

### 🧠 Design Intent (Why)

- 用户把子智能体看作主智能体的临时上下文窗口：用完就扔，需要再开一个。续派、等待、列出这些生命周期管理让模型多了一套要学的工具，也让管理器自己维护通知和唤醒，和后台 Bash 重复。
- 后台子智能体和后台 Bash 本质相同（在后台跑、结束通知、可停止），交给同一个登记表后，管理器只负责跑子会话，通知、去重、重启收尾只有一份实现；以后的生图、workflow 也按这个方式接入。
- `task_output` 读子智能体只在描述里说明一般不需要，不在代码里拦（用户决定，硬拦太严）。

### 📁 Files Modified

- `packages/subagent/subagent/src/{manager,messages,tools,preset}.ts`
- `packages/background-tasks/background-tasks/src/{registry,types,notification}.ts`
- `packages/background-tasks/tool-background-tasks/src/{tools,manifest}.ts`
- `packages/context/context-background-tasks/src/source.ts`（`packages/context/context-subagents/` 删除）
- `packages/core/runtime/src/harness/agent-runtime-plugin.ts`、`packages/core/runtime/src/startup/boot.ts`
- `packages/core/agent-service/src/application.ts`
- `packages/util/shared/src/{subagent-labels,subagent-projection,runtime-v2/subagents}.ts`
- `packages/client/client/src/sessions/{subagent-list,tool-card}.ts`
- `apps/desktop/src/renderer/components/messages/BackgroundNoticeRow.tsx`、`apps/desktop/src/renderer/mock/scenarios/{background-tasks,subagent-trajectory}.ts`
- `docs/design-docs/子智能体和后台任务设计规范/`、`docs/design-docs/collaboration/agent-{subagent-runtime,background-tasks}.md`、`docs/design-docs/frontend/front-子Agent与后台任务规范.md`
- `docs/exec-plans/completed/20261112-subagent-simplify.md`、`docs/exec-runs/20261112-subagent-simplify/`
