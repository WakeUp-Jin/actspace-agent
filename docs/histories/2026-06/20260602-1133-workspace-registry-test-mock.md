## [2026-06-02 11:33] | Task: Fix workspace registry test mock

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> Continue fixing the workspace switch test failure where the selected workspace should resolve to a registry workspace id before sending.

### Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **[Renderer test fixture]**: Added a shared workspace registry fixture for App bridge mocks.
- **[Workspace switch test]**: Wired the deferred workspace switch test mock through `listWorkspaces` so `setSessionWorkspace` receives the selected workspace id.

### Design Intent (Why)

The App resolves `workspaceId` from the workspace registry, not from session-list fallback options. Tests that override `window.actspace` need to expose the same registry IPC shape, otherwise the UI can select the right path while the send flow cannot include the registry id.

### Files Modified

- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
