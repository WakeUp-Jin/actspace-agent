## [2026-05-24 18:16] | Task: Aggregate agent run stream logs

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> Agent run JSONL should not write every streaming output delta as its own line; aggregate the model reply into a readable single log event.

### Changes Overview

**Scope:** `packages/agent-core`, `docs`

**Key Actions:**

- **Run log aggregation**: Stopped writing per-delta `message_delta` and `assistant_*_delta` events into run JSONL logs.
- **Readable stream summaries**: Added aggregated `assistant_text` and `assistant_thinking` log events with full text, delta count, and character count.
- **Regression coverage**: Added bridge test coverage to lock the new run log shape.
- **Docs sync**: Updated architecture and reliability docs to describe the new logging contract.

### Design Intent (Why)

Streaming events are useful for IPC and UI responsiveness, but one JSONL row per token makes local run logs noisy and difficult to inspect. Aggregating stream content keeps the logs readable while preserving enough counts to diagnose whether streaming occurred.

### Files Modified

- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts`
- `docs/ARCHITECTURE.md`
- `docs/RELIABILITY.md`
