## [2026-06-02 11:46] | Task: Remove top workspace selector

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> Remove the duplicated workspace selector from the top chrome bar while keeping the Composer workspace selector.

### Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **[Chrome UI]**: Removed the workspace dropdown from `WindowChromeBar` so the top bar only shows window controls and the chat title.
- **[Workspace selector ownership]**: Kept workspace switching routed through `ConversationView` and `Composer`.
- **[Regression test]**: Added a `WindowChromeBar` assertion that the top chrome no longer renders the workspace combobox.

### Design Intent (Why)

Workspace selection should have a single visible control in the message composer. Keeping a second selector in the title chrome duplicated the interaction and made the top bar visually noisy.

### Files Modified

- `packages/desktop/src/renderer/components/WindowChromeBar.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/styles/electron.css`
- `packages/desktop/src/renderer/test/sidebar.test.tsx`
