## [2026-07-17 19:54] | Task: 修复流式结束后的消息区闪动

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 模型持续流式输出后，最终完成时消息区会全局闪动一下；检查原因并修复。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/desktop`、Agent turn 设计文档

**Key Actions:**

- **数据源互斥**：当前 turn 仍由 streaming blocks 展示时，从持久化消息中排除相同 `turnId`，避免完成瞬间出现双份用户消息和回复。
- **同步交接**：恢复 `SessionRecord` 后立即同步清理 streaming 状态，再执行会话列表等辅助刷新。
- **稳定展示身份**：为 `MessageBlock` 增加独立于持久化 event id 的 `renderKey`，让 streaming 与 persisted block 复用同一 React DOM。
- **回归测试**：锁定 Session 列表刷新 pending 期间消息不重复，并验证交接前后的 turn 和 assistant DOM 节点不变。

### 🧠 Design Intent (Why)

流式 UI 和持久化 SessionRecord 是同一个 turn 的两个阶段，不是两组可以叠加展示的数据。交接时既要保证只有一个数据源可见，也要把存储身份和 React 展示身份分开，否则随机 event id 会触发整轮消息 remount 并重新播放入场动画。

### 📁 Files Modified

- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/shared/src/test/session-selectors.test.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `docs/design-docs/agent-runtime/agent-turn-layers.md`
- `docs/learnings/2026-07/streaming-ui-handoff-needs-source-exclusivity.html`
