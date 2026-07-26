## [2026-07-26 00:05] | Task: Make tool completion status immediate

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 多个写入工具执行时，已经完成的工具仍显示执行中，直到最后一个结束后才一起改变；希望每个工具写完就独立更新状态。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer tool lifecycle

**Key Actions:**

- **[Immediate completion]**: 移除 renderer 对工具完成态的 300ms 定时延迟，`tool_finished` 现在按 `toolCallId` 立即写入完成或失败状态。
- **[Regression coverage]**: 增加三个 `write_file` 调用逐个完成的测试，锁定已完成工具立即收尾、其余工具继续 running。
- **[Contract documentation]**: 明确视觉动画不能延迟真实工具生命周期状态。

### 🧠 Design Intent (Why)

后端已经为每个工具独立发送 `tool_finished`。前端最短 running 时长会让短工具的完成态聚集刷新，造成等待整批工具的错觉。完成事件应作为单工具事实源，视觉平滑不应覆盖真实状态。

### 📁 Files Modified

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`
- `docs/learnings/2026-07/tool-completion-state-must-not-wait-for-animation.md`
