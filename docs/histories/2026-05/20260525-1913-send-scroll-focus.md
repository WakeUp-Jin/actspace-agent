## [2026-05-25 19:13] | Task: 修复发送后消息区自动滚动

### 🤖 Execution Context

- **Agent ID**: `Codex GPT-5`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 聊天区在发送到第三条消息后会追加到底部，但视口不会自动滚到最新消息；期望只在用户发送消息时自动滚动，模型回复过程中不要持续抢占焦点。

### 🛠 Changes Overview

**Scope:** `packages/desktop`, `docs/histories`

**Key Actions:**

- **发送态滚动触发**: 在 renderer `App` 中新增一次性发送滚动信号，只在用户发出消息时触发。
- **消息区底部锚点**: 在 `ConversationView` 中增加底部锚点，并在收到发送滚动信号后执行 `scrollIntoView`。
- **回归测试**: 新增前端测试，锁定“发送时自动滚到底部、而不是靠流式回复触发”的行为。

### 🧠 Design Intent (Why)

把自动滚动严格绑定到“用户主动发送”这个动作上，既能解决新消息发出后需要手动滚动的问题，也避免模型流式回复时不断打断用户回看历史消息。

### 📁 Files Modified

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `docs/histories/2026-05/20260525-1913-send-scroll-focus.md`
