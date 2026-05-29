## [2026-05-29 13:32] | Task: Tighten composer attachment DOM test

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex CLI`

### User Query

> Continue executing the Composer DOM hierarchy cleanup and verification.

### Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **Test guard**: Strengthened the Composer attachment test so demo attachments must render inside the `Message composer panel`.
- **DOM boundary check**: Added an assertion that the review action button remains outside the composer panel.

### Design Intent (Why)

The Composer visual structure depends on attachments belonging to the input panel while review actions stay in the surrounding wrapper. The test now protects that relationship directly instead of only checking that attachment text is not mixed into the review button.

### Files Modified

- `packages/desktop/src/renderer/test/composer.test.tsx`
- `docs/histories/2026-05/20260529-1332-composer-panel-attachment-test.md`
