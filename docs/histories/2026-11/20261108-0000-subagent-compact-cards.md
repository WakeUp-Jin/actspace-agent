## [2026-11-08 00:00] | Task: 子智能体单行卡片、来信卡片、右侧列表实时动态与来信

### 🤖 Execution Context

- **Agent ID**: `main`
- **Base Model**: `Claude Opus 5.5`
- **Runtime**: `Claude Code`（worktree `actspace-agent-subagent-polish`，分支 `fix/subagent-list-return-style`）

### 📥 User Query

> 子智能体来信要能「轻微地打断」，也要考虑后台运行的子智能体。看了 A–E 五版后喜欢「卡片回响」，但觉得子智能体在消息流里太高；既然有了右侧面板，动态就放到面板里，主流可以再矮一些。
>
> 选定 K1 单行卡片，面板第二行显示「实时动态 + 来信」；卡片状态要从运行中变成已完成。

### 🛠 Changes Overview

**Scope:** `apps/desktop`（渲染进程与主进程）、`apps/web`、`packages/client/client`、`packages/util/shared`、`scripts/`、`docs/`

**Key Actions:**

- **派发卡片单行**：`AgentRunBlock` 改为 34px 一行，内容是 20px 头像、标题、种类、「后台」、状态。去掉模型名和动态行，失败原因放在 `title` 悬停里。`AgentIdentity` 删掉 `agentLatestActivity`，增加 20px 头像，`ActivityLine` 挪进来供列表共用。
- **来信卡片**：
  - 新建 `SubagentMessageCard`，替代 `agent_message` 的分隔行：头部同派发卡片，带蓝色「来信」和发送方状态；正文按 Markdown 渲染，超过 6 行折叠。
  - 状态来自 `SubagentStatusContext`。`ConversationView` 用 `subagentStatusByAgent` 算出，内容不变时沿用同一个 Map。
  - 一轮结束后，`liftSubagentMessages` 把来信卡片从「Worked for」里拿出来，放在最终回复之前。唤醒空闲会话的来信是那一轮的开头。Bash 通知仍是分隔行。
- **列表第二行**：
  - 运行中显示此刻在做什么（`SubagentListItem.activity`）；本地 / Fork 没有动态时写「正在思考」，外部子智能体不写。
  - 6 秒内来过信时显示「来信：」加第一行，转圈换成 7px 蓝点。
- **主进程动态**：`SubagentActivityBoard` 按子会话 id 记录 `SubagentActivity` 文案。`runtime-registry` 收到每个带 `parentSessionId` 的实时事件时更新它；run 结束时删除；最多记 200 条。`getSubagents` 给运行中的本地 / Fork 填上 `activity`。
- **投影**：`projectSubagentItems` 扫描 `agent/inbox/spliced` 来信，取每个发送方最新一条，时间用发送时刻。shared 新增 `agentMessageBody`，`BackgroundNoticeRow` 改用它。
- **Web**：新增 `SubagentLetter`（不带头像，内容是名字、来信、状态文字、正文）；`TurnView` 折叠后把来信放在过程外；`SessionDetail` 提供状态。
- **mock**：「压测 SQLite 写入」每 3 秒换一句动态，打开页面后第 8 秒来信一次。
- **测试**：
  - 更新：`agent-run-block`、`subagents-panel`、`deferred-tool-message`、`app-streaming-user-message`（卡片不再显示动态和结论）。
  - 新增：`subagent-message-card`、主进程动态记录、client 来信投影与状态映射、Web 来信卡片与折叠位置。
- **原生按钮基线**：`SubagentMessageCard` 记 1 个，即整条头部的卡片按钮，与 `AgentRunBlock` 一样；「展开」用 `Button`。
- **文档**：
  - 新增 `front-子Agent与后台任务规范.md` §2.1 / §2.2；
  - 同步更新 `05-界面与设置设计规范.md`、`front-中间消息区规范.md`、`agent-background-tasks.md`、`FRONTEND_VERIFICATION.md`；
  - 执行计划 `20261108-subagent-compact-cards.md`；demo `subagent-message-demo.html`（A–E）与 `subagent-compact-demo.html`（K1）。

### 🧠 Design Intent (Why)

后台派发的子智能体越来越多，每张两行卡片加上不停变化的动态行，会把主会话切碎。动态是「顺便看一眼」的信息，放进右侧列表更合适。主会话只留身份和状态，所以一行就够。

来信是子智能体主动说的话，值得直接读，不该藏在分隔线后面。卡片头部和派发卡片一样，用户一眼能认出是谁。两张卡片的状态取自同一处，结束时一起变。

后台派发的工具一调用就返回，渲染流里按父调用记录的动态在那之后就找不到了，所以主进程要按子会话另记一份。

### 📁 Files Modified

- `packages/util/shared/src/session.ts`、`subagent-labels.ts`
- `packages/client/client/src/sessions/subagent-list.ts`、`src/test/subagent-card.test.ts`
- `apps/desktop/src/main/runtime-v2/subagent-activity.ts`、`runtime-registry.ts`、`fixed-renderer-ipc.ts`
- `apps/desktop/src/renderer/components/messages/AgentRunBlock.tsx`、`AgentIdentity.tsx`、`SubagentMessageCard.tsx`、`subagent-status-context.ts`、`BackgroundNoticeRow.tsx`
- `apps/desktop/src/renderer/components/conversation/TurnView.tsx`、`turns.ts`、`render-message.tsx`
- `apps/desktop/src/renderer/components/ConversationView.tsx`、`right-panel/SubagentsPanel.tsx`
- `apps/desktop/src/renderer/mock/scenarios/subagent-trajectory.ts`
- `apps/web/src/pages/session/blocks/SubagentLetter.tsx`、`TurnView.tsx`、`SessionDetail.tsx`
- `scripts/native-button-baseline.json`
- 上述测试与文档
