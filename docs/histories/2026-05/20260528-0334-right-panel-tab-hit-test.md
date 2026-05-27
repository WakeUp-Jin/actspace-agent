## [2026-05-28 03:34] | Task: Fix right panel tab hit testing

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> Kairos on the right panel cannot be clicked with the mouse in the Electron window.

### Changes Overview

**Scope:** `packages/desktop` renderer UI and docs

**Key Actions:**

- **Right panel tab hit-test fix**: Marked right panel tab buttons as Electron `no-drag` regions so real mouse clicks are not swallowed by the custom titlebar drag area.
- **Regression coverage**: Added a renderer test that locks the `.right-tabs button` CSS contract.
- **Knowledge capture**: Added a learning note for Electron `-webkit-app-region` hit-testing traps.

### Design Intent (Why)

The React click handler and Kairos IPC path were valid, but the right panel tabs sit inside the top chrome strip. In Electron, any overlapping drag region can consume real mouse input before the DOM click handler runs. The narrow fix keeps the existing layout and pointer-events model while explicitly making the clickable tab buttons opt out of window dragging.

### Files Modified

- `packages/desktop/src/renderer/styles.css`
- `packages/desktop/src/renderer/test/right-panel-kairos.test.tsx`
- `docs/learnings/2026-05/electron-app-region-hit-testing.md`
