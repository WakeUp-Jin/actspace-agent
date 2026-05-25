## [2026-05-25 12:40] | Task: Tool preview contract

### Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-5
- **Runtime**: Codex desktop

### User Query

> 梳理工具类型和前端组件匹配关系，并将工具定义扩展出扁平的 `previewKind` 元数据；`list_directory` 应有独立的 `directory_list` 展示类型。

### Changes Overview

**Scope:** `packages/shared`, `packages/agent-core`, `packages/desktop`, `docs`

**Key Actions:**

- **[Shared contract]**: Added `ToolPreviewKind` and `directory_list` to `ToolUiPreview` / `MessageBlock`.
- **[Tool metadata]**: Made `ToolDefinitionSpec.previewKind` required and added it to all built-in tools.
- **[Bridge mapping]**: Changed the agent bridge to persist tool results with structured `uiPreview` derived from tool metadata and execution args.
- **[Renderer]**: Added `directory_list` rendering to the lightweight tool log line.

### Design Intent (Why)

Tool names and frontend display semantics were previously coupled through selector-side inference. The new contract makes every tool explicitly declare its display semantics via `previewKind`, while the renderer still owns the concrete React component choice.

### Files Modified

- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/agent-core/src/tools/types.ts`
- `packages/agent-core/src/internal-tools.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/desktop/src/renderer/components/messages/ToolLogLine.tsx`
- `docs/ARCHITECTURE.md`
