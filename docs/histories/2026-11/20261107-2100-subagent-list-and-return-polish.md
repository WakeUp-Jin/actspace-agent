## [2026-11-07 21:00] | Task: 子 Agent 列表去外框、停止按钮悬停显示、主会话不出子智能体完成行

### 🤖 Execution Context

- **Agent ID**: `main`
- **Base Model**: `Claude Opus 5.5`
- **Runtime**: `Claude Code`（worktree `actspace-agent-subagent-polish`，分支 `fix/subagent-list-return-style`）

### 📥 User Query

> 子智能体列表的边框重合在一起很丑；子智能体消息返回时主会话的样式也很丑；运行中旁边常驻的停止按钮也丑，希望先转圈、鼠标悬浮时才显示停止。用 HTML demo 给方案。
>
> 选定：列表去掉外框（B）；停止按钮最右固定一格（S1）。返回消息：派发时本来就有执行卡片，完成时卡片变成完成就够了——主会话运行中读到的完成通知、空闲时被子智能体完成唤醒，两种都什么都不显示。子智能体主动发来消息的样式之后再定。

### 🛠 Changes Overview

**Scope:** `apps/desktop`（渲染进程）、`apps/web`、`packages/client/client`、`docs/`

**Key Actions:**

- **列表去外框**：`SubagentsPanel` 的分组卡（边框 + `divide-y`）改为无框列表，行自带圆角，悬停 `bg-hover-overlay`。
- **停止按钮**：运行中的行最右固定 28px 一格，平时绿色转圈；行悬停或聚焦时换成圆形 danger `IconButton`。按钮平时透明但仍可 Tab 到；停止请求发出后只留转圈。
- **完成通知不显示**：
  - 桌面 `groupMessagesIntoTurns`、Web `buildTurns` 跳过 `taskKind: "subagent"` 的 `background_notice`；
  - 唤醒空闲会话的（`opensTurn` 不为 false）只断开上一轮，后面的回复自成一轮，没有开头行；
  - `agent_message`、Bash 通知不变。
- **等待 / 查看类工具行只留标题**：`tool-card.ts` 中 `wait_agent` / `list_agents` / `list_subagent_models` 的 `content` 只保留错误，去掉 `wait_agent completed`、`Input arrived.`。`ToolLogLine` 的通用行在 `content` 为空时只显示标题。
- **测试**：
  - 更新 `conversation-turns`、Web `turn-model`、`subagent-card`、`subagents-panel` 用例；
  - `surface-derived/expected.json` 只改 4 处 `wait_agent` 的显示 `content`（chatEvents 与 chatBlocks 各 4 个字段），结构对比确认无其他变化。
- **文档**：
  - `front-子Agent与后台任务规范.md` §2 和新增 §2.1；
  - `05-界面与设置设计规范.md` 对话区表与 U1；
  - `agent-background-tasks.md`、`front-中间消息区规范.md`、`FRONTEND_VERIFICATION.md` 场景表。
- **Demo**：`subagent-polish-demo.html` 保留列表、停止按钮、返回样式三组方案。

### 🧠 Design Intent (Why)

完成通知是给模型的收件箱消息，派发卡片已经从同一份事件（`subagent/activation` settle）显示了结果。再画一条分隔线，等于同一件事在对话里说两遍。几个子智能体并行时，「等待 → 返回 → 等待」把正文切得很碎。唤醒轮的开头行对用户也没有信息量。

停止不是常用操作，常驻按钮扎眼；改成悬停才出现，运行状态仍由转圈表达。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/right-panel/SubagentsPanel.tsx`
- `apps/desktop/src/renderer/components/conversation/turns.ts`
- `apps/desktop/src/renderer/components/messages/ToolLogLine.tsx`
- `apps/web/src/sessions/turn-model.ts`
- `packages/client/client/src/sessions/tool-card.ts`
- `apps/desktop/src/main/test/fixtures/surface-derived/expected.json`
- `docs/design-docs/frontend/front-子Agent与后台任务规范.md`
- `docs/design-docs/frontend/subagent-polish-demo.html`
