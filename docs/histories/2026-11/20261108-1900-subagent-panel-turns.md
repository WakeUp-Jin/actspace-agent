## [2026-11-08 19:00] | Task: 子 Agent 面板对齐主会话的轮次渲染，修子会话轨迹为空

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI (macOS)`

### 📥 User Query

> 子智能体的工具都是平铺开的，没有主会话那种「Worked for」收起；子智能体的轨迹视图显示「当前会话暂无可展示的 Agent 轨迹。」

### 🛠 Changes Overview

**Scope:** `apps/desktop`（renderer）、文档

**Key Actions:**

- **对话视图**：`SubagentsPanel` 的执行记录从 `renderMessageList` 平铺改为 `groupMessagesIntoTurns` + `TurnView`，与主会话、侧边对话一致；子会话的回复操作去掉「分叉会话」。
- **轨迹视图**：`useTrajectorySource` 传了 `sessionId` 时用 `useSyncExternalStore` 订阅该子会话的 cell；`TrajectoryView` 的加载中 / 出错状态改看子会话的 cell。

### 🧠 Design Intent (Why)

- 子 Agent 面板直接调 `renderMessageList`，跳过了主会话按轮分组、把过程收进 `ToolActivityGroup` 的那一层。
- 2d007c7b（渲染订阅隔离）之后，投影 context 只随当前（父）会话的 cell 换新；轨迹源在渲染时 `peek(childId)` 却没有订阅它，子会话数据晚到不会触发重渲染。父会话已结束时就一直停在空状态，且空状态读的是父会话的 cell，所以显示「暂无轨迹」而不是「加载中」。子会话日志本身完整（三个子会话各 660–1481 条事件）。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/right-panel/SubagentsPanel.tsx`
- `apps/desktop/src/renderer/components/trajectory/use-trajectory-source.ts`
- `apps/desktop/src/renderer/components/TrajectoryView.tsx`
- 测试：`renderer/test/{subagents-panel,trajectory-session-source,chat-markdown-host}.test.tsx`（新增「父会话空闲、子会话晚到」用例，未修复时失败）
- 文档：`docs/design-docs/frontend/front-子Agent与后台任务规范.md`
