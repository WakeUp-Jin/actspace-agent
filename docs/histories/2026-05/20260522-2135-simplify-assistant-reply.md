## [2026-05-22 21:35] | Task: Simplify assistant reply chrome

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 调整模型回复展示：去掉回复消息中的图像和模型名称，只直接展示回复内容。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer UI and frontend design docs

**Key Actions:**

- **[Assistant reply markup]**: Removed the assistant avatar and per-message product/model metadata from ordinary assistant replies.
- **[Message spacing]**: Reworked assistant reply layout so reply text, thinking rows, tool logs, and diffs share a cleaner reading rhythm.
- **[Docs]**: Updated the middle message area design spec to state that ordinary assistant replies do not repeat identity chrome.

### 🧠 Design Intent (Why)

The model selection remains available in the composer, while individual assistant replies now prioritize reading flow. This avoids repeated identity labels in short replies and makes the conversation stream feel more like a continuous agent work log.

### 📁 Files Modified

- `packages/desktop/src/renderer/components/messages/AssistantReply.tsx`
- `packages/desktop/src/renderer/styles.css`
- `docs/design-docs/frontend-ui/中间消息区规范.md`
