## [2026-05-25 19:58] | Task: 规范工具预览展示

### 🤖 Execution Context

- **Agent ID**: `Codex GPT-5`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 重新设计工具日志展示：文件工具不显示长路径，`edit_file_diff` 改名为 `edit-file`，并把未来新增工具必须遵守的预览字段规范沉淀到 design-docs。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`, `packages/desktop`, `docs/design-docs`, `docs/histories`

**Key Actions:**

- **[Tool Name]**: 将编辑 diff 工具的公开工具名从 `edit_file_diff` 改为 `edit-file`，保留 `edit_diff` 作为前端 preview kind。
- **[Preview Fields]**: 调整 `ToolUiPreview` 生成规则，`read_file` 只输出文件名，`list_directory` 只输出最后一级目录名，`edit-file` 只输出文件名和结构化增删统计。
- **[Guidelines]**: 新增工具预览设计规范，明确 raw args、`ToolUiPreview` 和前端组件的分层边界。
- **[Coverage]**: 补充 bridge 测试，覆盖绝对路径参数进入工具时，前端 preview 只得到短展示字段。

### 🧠 Design Intent (Why)

工具原始参数是执行事实，不应该为了 UI 改写；前端消息流应消费 `ToolUiPreview` 这个 view model。文件系统路径的父级目录通常是环境噪音，轻量日志只展示最有识别度的末级名称；URL 和搜索 query 则保留完整参数，因为它们本身就是用户语义。

### 📁 Files Modified

- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts`
- `packages/agent-core/src/tools/tools/edit-file-diff/definition.ts`
- `packages/agent-core/src/tools.ts`
- `packages/agent-core/src/fixtures.ts`
- `packages/agent-core/src/llm.ts`
- `docs/design-docs/agent-tool-preview-design-guidelines.md`
- `docs/design-docs/agent-index.md`
- `docs/design-docs/agent-backend-design.md`
- `docs/design-docs/front-中间消息区规范.md`
- `docs/ARCHITECTURE.md`
