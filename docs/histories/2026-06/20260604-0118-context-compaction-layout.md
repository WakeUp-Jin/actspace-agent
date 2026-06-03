## [2026-06-04 01:18] | Task: Fix context compaction layout

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 修复上下文压缩条宽度偏窄，以及 assistant 回复操作栏被压缩分隔条挤到下方的问题。

### Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **Layout fix**: 将 `context_compaction` 消息作为独立顶层 turn 渲染，避免复用上一条 assistant 回复的操作栏位置。
- **Width fix**: 移除压缩条自身的 `max-w-[720px]` 限制，让它跟随消息栈宽度铺开。
- **Regression tests**: 补充 renderer 单测，锁定操作栏位于压缩分隔条之前，并防止压缩块重新引入旧宽度上限。

### Design Intent (Why)

上下文压缩组件是系统级 timeline 事件，不属于某条 assistant 回复的正文。将它独立成顶层消息项后，assistant turn 的操作栏仍锚定在回复下方，压缩结果则作为下一条独立分隔线展示，视觉层级和交互归属更清楚。

### Files Modified

- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/messages/CompactCommandBlock.tsx`
- `packages/desktop/src/renderer/test/conversation-view-tooltip.test.tsx`
- `packages/desktop/src/renderer/test/compact-command-block.test.tsx`
