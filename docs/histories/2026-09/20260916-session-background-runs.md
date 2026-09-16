## [2026-09-16 21:55] | Task: 修复会话切换时后台运行与消息串线

### 📥 User Query

用户要求切换会话后模型、工具调用、子 Agent 和后台任务继续运行，返回时保留进度并避免消息错乱。

### 🛠 Changes Overview

**Scope:** Desktop renderer/session browsing。

- 将流式运行投影从单个全局状态改为按 `sessionId` 保存，事件按 `sessionId + agentRunId` 路由。
- 切换会话只替换可见投影；后台运行、审批、失败、工具和 Bash 状态继续更新。
- 历史读取增加会话版本与请求隔离，并在完成后让持久化结果覆盖旧快照，避免重复或倒退。
- 新增后台运行交互 fixture 和快速切换、并发、后台完成、工具终态、Bash、失败草稿、停止竞态、审批竞态回归。

### 🧠 Design Intent

Runtime 本来就按会话持有运行循环，问题发生在 renderer 只持有一个 active stream 并在切换时清空。现在 renderer 的选择状态与运行状态分离；Journal 仍是恢复事实源，缓存只是返回时的即时投影。

### 📁 Files Modified

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/session/session-run-state.ts`
- `apps/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `apps/desktop/test-fixtures/session-background-runs.html`
- `apps/desktop/test-fixtures/session-background-runs.tsx`
- `docs/exec-plans/active/20260916-session-background-runs.md`
