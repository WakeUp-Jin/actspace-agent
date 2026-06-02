## [2026-06-02 02:09] | Task: Fix Add workspace button callback

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> Clicking the Workspaces folder-plus button does not open the directory picker.

### Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **Callback wiring**: Passed `handleAddWorkspace` from `App` into `WorkbenchLayout`, completing the existing `Sidebar -> WorkbenchLayout -> App -> selectWorkspaceDirectory` chain.
- **Regression test**: Added an App-level test that clicks `Add workspace`, asserts the directory picker is called, and verifies the selected workspace root is used when creating a new session.

### Design Intent (Why)

The Sidebar button and Electron preload IPC already existed; the missing piece was the App-level prop connection. The fix keeps the change narrow and avoids touching the dialog IPC contract or Sidebar rendering behavior.

### Files Modified

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
