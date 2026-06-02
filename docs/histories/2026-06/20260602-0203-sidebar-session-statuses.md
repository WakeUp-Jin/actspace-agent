## [2026-06-02 02:03] | Task: Sidebar session status aggregation

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> Continue the approved plan: derive App-level session statuses so Sidebar can show pending approval and failed sessions.

### Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **Session status aggregation**: Added renderer-side status sets for pending approval and failed sessions, then derived `SessionUiStatusKind` values for `WorkbenchLayout` / `Sidebar`.
- **Pending approval refresh**: Reused existing `listPendingApprovals({ sessionId })` IPC to refresh visible session approval state without changing shared contracts.
- **Runtime event handling**: Updated stream handling so `tool_approval_required`, `tool_approval_resolved`, `turn_finished`, and `turn_failed` keep Sidebar status in sync.
- **Regression tests**: Added App tests for `Waiting approval` and `Failed` Sidebar status visibility.

### Design Intent (Why)

Sidebar already understood status display, but App did not yet translate runtime events and approval IPC state into per-session status props. Keeping the aggregation in App preserves Sidebar as a simple presentational consumer and avoids widening the pending approval IPC contract just to recover session-level status.

### Files Modified

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
