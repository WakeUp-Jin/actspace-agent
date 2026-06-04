## [2026-06-04 20:23] | Task: Tune read_file range behavior

### 🤖 Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 优化 read_file 工具：修正默认读取说明，鼓励模型分段读取，并减少重复读取对上下文和 cache 的污染；暂不降低 readTruncateThreshold。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`, `docs/design-docs`

**Key Actions:**

- **[Range discipline]**: Changed `read_file` default range from 500 lines to 200 lines and updated the tool description to prefer segmented `offset` / `limit` reads.
- **[Dedup]**: Added per-`ToolManager` unchanged-range dedup for `read_file` keyed by resolved path, offset, and limit, using file size and mtime as invalidation signals.
- **[Escape hatch]**: Added optional `force=true` so the model can repeat an unchanged range when earlier text has been compacted out of context.
- **[Docs/tests]**: Updated context compression docs and added focused `read_file` tests for default range, dedup, force, metadata invalidation, and independent ranges.

### 🧠 Design Intent (Why)

Repeated `read_file` calls were a direct contributor to context growth and poor cache reuse: the same numbered source ranges could be reinserted into conversation history even when the file had not changed. The new behavior keeps first reads precise and line-numbered, nudges the model toward smaller segmented reads, and returns a short unchanged notice for exact repeated ranges. The `force` option keeps recovery possible after context compaction without making repeated full output the default.

`readTruncateThreshold` remains at 20000 for now because lowering it would push more source reads into summarization, which is less reliable than exact line-range reading for code.

### 📁 Files Modified

- `packages/agent-core/src/tools/tools/read-file/executor.ts`
- `packages/agent-core/src/tools/tools/read-file/definition.ts`
- `packages/agent-core/src/tools/manager.ts`
- `packages/agent-core/src/tools/types.ts`
- `packages/agent-core/src/tools/test/read-file.test.ts`
- `docs/design-docs/agent-context-compression.md`
