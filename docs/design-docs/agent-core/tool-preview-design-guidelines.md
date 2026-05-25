# 工具预览设计规范

这份文档约束新增 Agent 工具时，后端如何为前端消息流提供稳定、克制、可读的工具预览数据。

## 目标

工具执行事实和用户可见展示必须分层：

- `tool_call.payload.arguments` / `argsPreview`：记录原始工具参数，用于执行、恢复、日志和排障。
- `ToolUiPreview`：前端消息流使用的 view model，用于轻量展示工具动作。
- React 组件：只消费 `ToolUiPreview` / `MessageBlock`，不反推工具参数，也不直接暴露内部工具名。

新增工具时，必须先设计 `ToolUiPreview` 再接 UI。不要把 raw args 当作展示模型，也不要为了某个工具临时新增重复字段。

## 命名边界

- `toolName` 是能力标识，给 LLM、ToolManager、权限和日志使用。
- `previewKind` 是展示语义，给 bridge、shared selector 和 renderer 使用。
- 用户可见动作词由 `ToolUiPreview` 字段和前端组件共同决定，不直接展示内部工具名。

示例：

- 工具名：`edit-file`
- 展示类型：`edit_diff`
- 用户可见：`Edited index.ts +3 -1`

## 通用展示原则

- 工具日志行优先短、轻、可扫读。
- 文件路径类参数默认只展示最后一级名称。
- 完整参数保留在原始工具参数、run log 和持久化事件中。
- 网络 URL 和搜索 query 本身通常是任务语义，可以保留完整参数。
- 如果某个字段可能很长，优先由组件做视觉截断，不改变原始事实字段。
- 展示文案使用产品动作词：`Read`、`Grep`、`Glob`、`Listed`、`Searched`、`Fetched`、`Edited`、`Ran`。
- 不在前端组件里根据 `toolName` 分支推断展示；新增工具应通过 `previewKind` 和 `ToolUiPreview` 建模。

## 内置工具规范

### `read_file`

- `previewKind`: `read`
- `ToolUiPreview.filePath`: 文件名，例如 `package.json`
- 展示：`Read package.json`
- 带行范围时展示：`Read package.json 1-80`
- 不展示完整路径。

### `list_directory`

- `previewKind`: `directory_list`
- `ToolUiPreview.path`: 最后一层目录名，例如 `desktop`
- 展示：`Listed desktop`
- 根目录可以展示 workspace 或 repo 名。
- 不展示完整路径。

### `grep`

- `previewKind`: `grep`
- `ToolUiPreview.pattern`: 正则 pattern。
- `ToolUiPreview.scope`: 搜索范围（目录或 include glob）。
- 展示示例：`Grep ToolUiPreview in src/**/*.ts`。

### `glob`

- `previewKind`: `glob`
- `ToolUiPreview.pattern`: glob pattern。
- `ToolUiPreview.scope`: 搜索根目录。
- 展示示例：`Glob **/*.ts in packages/agent-core`。

### `edit-file`

- `previewKind`: `edit_diff`
- `ToolUiPreview.filePath`: 文件名，例如 `index.ts`
- `ToolUiPreview.additions` / `deletions`: 结构化修改统计。
- 展示：`Edited index.ts +3 -1`
- 完整路径保留在工具参数中，不放在主消息行里。

### `bash`

- `previewKind`: `bash`
- 折叠态使用 `commandPreview`。
- 展示：`Running pnpm test`、`Ran pnpm test`、`Denied rm -rf ...`。
- 完整 `command` 只在展开态展示。

### `web_search`

- `previewKind`: `web_search`
- 支持两种模式：`query`（关键词搜索）和 `url`（读取网页）。
- `ToolUiPreview.mode`: `query` 或 `url`。
- query 模式展示：`Web Search 最新新闻 今天`。
- url 模式展示：`Read Web Page https://example.com/path`。
- 不在工具日志行里展示搜索结果正文、来源摘要或页面摘要；这些内容只保留在 `tool_result.rawOutput` / `modelOutput` 中，供模型继续推理和排障使用。

### `analyze_media`

- 当前使用 `generic`。
- 优先展示媒体文件名、URL 或输入来源。
- 展示建议：`Analyzed image screenshot.png` 或 `Analyzed media`。

## 新增工具检查清单

- 工具 definition 必须声明 `previewKind`。
- `createToolUiPreview()` 必须为新增展示类型生成稳定字段。
- 流式 `tool_started.preview` 和最终 `tool_result.uiPreview` 必须使用同一套展示语义。
- `MessageBlock` / `session-selectors` 必须能从 `ToolUiPreview` 恢复前端消息。
- 前端组件应消费 `MessageBlock` 字段，不直接读取 raw args。
- 测试至少覆盖一次流式展示和一次持久化恢复展示。
