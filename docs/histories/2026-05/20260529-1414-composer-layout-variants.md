## [2026-05-29 14:14] | Task: Implement Composer layout variants

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI`

### User Query

> Build the full Composer plan in one pass: support follow-up and initial composer states, inline and stacked layouts, and use reusable subcomponents.

### Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **Composer variants**: Added `surface` and `inputLayout` concepts so Composer supports follow-up and initial surfaces with inline or stacked input layouts.
- **Attachment layout**: Moved the input above the toolbar when attachments are present, keeping the toolbar focused on controls.
- **Initial composer**: Added workspace, branch, and runtime dropdown entries plus the initial composer shell for empty sessions.
- **Session readiness guard**: Prevented temporary composer nodes from rendering before Electron session restore completes.
- **Initial stacked rule**: Updated new-session Composer so the prompt input is always above the toolbar, even without attachments.
- **Stacked toolbar alignment**: Moved model / Auto next to the `+` button in stacked layouts and removed the duplicate context usage button from the input panel.
- **Tests and docs**: Added Composer structure tests and updated the frontend design spec and execution plan.

### Design Intent (Why)

Composer now has multiple real product states. Modeling the UI as `surface + inputLayout` avoids hard-coding each screenshot as a one-off branch, while keeping the first-message flow compatible with the existing optimistic streaming pipeline.

### Files Modified

- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/test/composer.test.tsx`
- `docs/design-docs/frontend/front-聊天输入框规范.md`
- `docs/exec-plans/active/20260529-composer-layout-variants.md`
- `docs/learnings/2026-05/component-state-matrix-and-ready-gates.md`
