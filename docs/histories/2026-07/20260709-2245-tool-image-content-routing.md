## [2026-07-09 22:45] | Task: Tool Image Content Routing

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> Diagnose why an image-capable Kimi model could not analyze images produced or read during an Agent session, then implement the missing multimodal transfer path.

### Changes Overview

**Scope:** `packages/agent-core`, `docs/design-docs`

**Key Actions:**

- **Tool result content**: Extended `ToolResult` with optional rich content parts so tools can return native image input in addition to textual summaries.
- **Agent loop preservation**: Updated the execution loop to preserve tool-provided image content instead of flattening every tool result to text.
- **OpenAI-compatible routing**: Kept the text `tool` result for tool-call accounting, then appended a user visual observation carrying image content for Kimi/OpenAI-compatible models.
- **Image-producing tools**: Made `read_file` return native image content for supported image files and made foreground bash stdout data URLs become image content.
- **Tool-call ordering**: Delayed OpenAI-compatible visual observations until after consecutive tool results, so image observations do not interrupt `assistant(tool_calls) -> tool(...) -> tool(...)` ordering.
- **Tests and docs**: Added focused tests for read_file, bash, loop preservation, and OpenAI-compatible conversion; documented the capability boundary.

### Design Intent (Why)

The model registry can correctly say a model supports image input, but that only helps if the Agent runtime preserves image content through the tool-result and provider-conversion path. Prior behavior treated screenshots or image reads as paths, binary text, or base64 text, so the model did not receive a real image content part. This change adds the missing bridge while keeping tool-call accounting compatible with OpenAI-style APIs.

OpenAI-compatible APIs require every assistant tool call to be followed by the corresponding tool messages before any new user message. Tool images are therefore accumulated and emitted as a user visual observation only after the current consecutive tool-result run finishes.

### Files Modified

- `packages/agent-core/src/internal-tools.ts`
- `packages/agent-core/src/engine/loop.ts`
- `packages/agent-core/src/llm/convert.ts`
- `packages/agent-core/src/tools/tools/read-file/definition.ts`
- `packages/agent-core/src/tools/tools/read-file/executor.ts`
- `packages/agent-core/src/tools/tools/bash/executor.ts`
- `packages/agent-core/src/tools/test/read-file.test.ts`
- `packages/agent-core/src/tools/test/bash.test.ts`
- `packages/agent-core/src/engine/test/loop.test.ts`
- `packages/agent-core/src/llm/test/convert.test.ts`
- `docs/design-docs/model-context/agent-deepseek-kimi-hybrid-capabilities.md`
