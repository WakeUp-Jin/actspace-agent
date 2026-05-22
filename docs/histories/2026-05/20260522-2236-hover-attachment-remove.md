## [2026-05-22 22:36] | Task: Hide attachment remove buttons until hover

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 附件上的 X 号默认不应该出现，鼠标悬浮在附件元素上时才显示。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer UI and frontend design docs

**Key Actions:**

- **[Composer polish]**: Hid attachment remove buttons by default and revealed them on attachment hover or keyboard focus.
- **[Docs]**: Updated the Composer attachment rules to describe hover/focus-only remove controls.

### 🧠 Design Intent (Why)

Attachment previews should stay visually quiet during normal typing. Remove controls remain discoverable on hover and accessible by keyboard focus without changing the attachment layout.

### 📁 Files Modified

- `packages/desktop/src/renderer/styles.css`
- `docs/design-docs/frontend-ui/聊天输入框规范.md`
