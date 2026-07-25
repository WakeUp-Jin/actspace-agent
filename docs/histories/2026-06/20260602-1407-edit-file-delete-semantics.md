## [2026-06-02 14:07] | Task: Stabilize edit_file deletion semantics

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> Execute the second active plan for `edit_file` deletion semantics.

### Changes Overview

**Scope:** `packages/agent-core`, docs

**Key Actions:**

- **Deletion Semantics**: Added focused tests for `new_string: ""` deleting whole lines, inline tail text, multiline blocks, file tail content, repeated matches, and content lines that begin with diff marker characters.
- **Executor Fix**: Limited newline swallowing to true whole-line deletion, while preserving newlines for inline text deletion.
- **Diff Stats**: Updated edit diff statistics in both executor and bridge preview code to count only unified diff hunk lines.
- **Docs Sync**: Recorded the long-term `edit_file` deletion contract in tool preview guidelines, the module map, and the active execution plan.

### Design Intent (Why)

`edit_file` must treat an empty `new_string` as text deletion, not file deletion. The tricky part is distinguishing whole-line deletion from inline deletion: whole-line deletion should avoid leaving blank residue, but inline deletion must not merge the next line into the current one. Diff statistics also need to ignore file headers without losing real content lines such as `---flag`.

### Files Modified

- `packages/agent-core/src/tools/tools/edit-file-diff/executor.ts`
- `packages/agent-core/src/tools/test/edit-write.test.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts`
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`
- `docs/exec-plans/active/20260527-agent-tool-capabilities-breakdown/02-edit-file-delete-semantics.md`
