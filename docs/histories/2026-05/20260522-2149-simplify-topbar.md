## [2026-05-22 21:49] | Task: Simplify conversation topbar

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 顶部栏高度太高，去掉 `Agent workspace` 和 `Active` 副标题，参考 Codex 简化为一栏。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer UI and frontend design docs

**Key Actions:**

- **[Topbar markup]**: Removed the secondary workspace/status line under the conversation title.
- **[Topbar layout]**: Compressed the header into a single row with title truncation and stable action alignment.
- **[Docs]**: Updated the workbench layout spec to record the single-line topbar rule.

### 🧠 Design Intent (Why)

The conversation header should stay lightweight and leave more vertical room for the message stream. Workspace status details are not useful enough to repeat in the primary header, while the title and actions are the high-value elements.

### 📁 Files Modified

- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/styles.css`
- `docs/design-docs/front-工作台布局与面板交互规范.md`
