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

- 工具名：`edit_file`
- 展示类型：`edit_diff`
- 用户可见：`Edit index.ts +3 -1`（折叠态摘要，点击展开 diff）

## 工具命名约定

- **工具对外 `name`** 一律 **snake_case**，例如 `read_file`, `write_file`, `edit_file`, `list_directory`, `web_search`, `analyze_media`。单词工具（`bash`, `grep`, `glob`）保持单词无分隔符。
  - LLM 工具协议（OpenAI / DeepSeek / Kimi / Anthropic）事实约定都是 snake_case，统一使用 `_` 而不是 `-` 兼容性最好。
  - 历史上 `edit-file` 是 kebab-case 异类，已在 2026-05 统一为 `edit_file`。
- **目录名**（`packages/agent-core/src/tools/tools/<dir>/`）一律 **kebab-case**，例如 `edit-file-diff/`, `read-file/`, `web-search/`。这是仓库整体的目录命名风格，与工具 `name` 独立。
- **previewKind** 也用 snake_case，例如 `edit_diff`, `directory_list`, `web_search`。
- **JS/TS 变量与函数名** 使用 camelCase，例如 `editFileDiffDefinition`、`createWebSearchTool`。
- 新增工具时三处都要照例：kebab 目录 + snake_case `name` + snake_case `previewKind` + camelCase 导出名。

## 通用展示原则

- 工具日志行优先短、轻、可扫读。
- 文件路径类参数默认只展示最后一级名称。
- 完整参数保留在原始工具参数、run log 和持久化事件中。
- 网络 URL 和搜索 query 本身通常是任务语义，可以保留完整参数。
- 如果某个字段可能很长，优先由组件做视觉截断，不改变原始事实字段。
- 展示文案使用产品动作词：`Read`、`Grep`、`Glob`、`Listed`、`Searched`、`Fetched`、`Edit`、`Write`、`Ran`。
- 不在前端组件里根据 `toolName` 分支推断展示；新增工具应通过 `previewKind` 和 `ToolUiPreview` 建模。
- 工具调用进行中阶段（`tool_started` 之后、`tool_finished` 之前）所有工具行使用 text shimmer 视觉，详见 [中间消息区规范 - 工具执行中态规范](../front-中间消息区规范.md#工具执行中态规范)。
- running 阶段后端 `tool_started.preview` 只推送当前能确定的最小字段（filePath / command / query），不传未生成的数值（diff stats、entryCount 等）；完成态字段在 `tool_finished` / 持久化事件中补齐。
- **`tool_call_streaming` 事件契约**：bridge 在 LLM 流式输出 `tool_call_delta` 时累积 partial args，按 50ms throttle emit `tool_call_streaming { toolCallId, toolName, isInitial?, preview: ToolUiPreview }`。前端**零解析**直接消费 typed preview，复用与 `tool_started` 相同的渲染分支。`isInitial=true` 是首帧（dispatched 阶段），filePath 此时可能为空字符串，前端用 `Write file…` 等 fallback 文案展示。新工具接入只需在 `engine/streaming-preview-extractors.ts` 注册按 previewKind 的 extractor，前端无需改动。详见 [docs/learnings/2026-05/llm-tool-call-streaming.md](../../learnings/2026-05/llm-tool-call-streaming.md) 的流式协议设计原则。

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

### `edit_file`

- `previewKind`: `edit_diff`
- `ToolUiPreview.filePath`: 文件名，例如 `index.ts`
- `ToolUiPreview.additions` / `deletions`: 结构化修改统计。
- 流式阶段（dispatched → argsProgress → executing）后端持续推 `tool_call_streaming` + `tool_started`，preview.filePath 从空字符串逐渐变为真实文件名，前端 `MessageBlock.status` 一直是 `running`，渲染为单行 `Edit index.ts` + shimmer 闪光，**不显示** chevron、统计或 content 预览。
- 为什么不流式 content：edit 的 diff 需要「文件原内容 + old_string 定位 + new_string 替换」三者全齐才能生成有定位的 unified diff，LLM 流式只能拿到 old/new 两段无上下文文本，强行展示会误导用户。streaming-preview-extractors 的 `edit_diff` extractor 只提取 path。
- 流式 `tool_finished` 后切换为 `status: completed`，渲染折叠态 `Edit index.ts +3 -1 ›`，点击展开完整 diff。
- diff 由 `diff` 库 `createTwoFilesPatch` 生成（标准 unified diff 格式），包含上下文行。
- `new_string: ""` 的长期语义是删除唯一匹配文本内容，不是删除文件；多处匹配仍必须提供更多上下文或显式 `replace_all`。
- 删除整行时，如果 `old_string` 恰好从行首匹配且匹配后紧跟换行，executor 会连同该换行一起删除，避免留下空白行；行内文本删除不得吞掉后续换行。
- `ToolUiPreview.additions` / `deletions` 必须只统计 unified diff hunk 内的真实 `+` / `-` 行，不统计 `---` / `+++` 文件头，也不能漏算内容本身以 `---` 或 `+++` 开头的变更行。
- 前端使用 `FileDiffBlock` 折叠式组件，与 `write_file` 共享同一组件，无 icon，左边缘与 Read / Grep 等工具行对齐。

### `write_file`

- `previewKind`: `write`
- `ToolUiPreview.filePath`: 文件名，例如 `config.ts`
- `ToolUiPreview.streamingContent?`: 流式阶段从 LLM args.content 累积出来的 partial 文本（仅 running 时存在，completed 时 undefined）。
- `ToolUiPreview.additions` / `deletions`: 结构化修改统计。
- 流式 4 阶段：
  1. dispatched（首个 `tool_call_streaming` `isInitial=true`）：渲染 `Write file…` + shimmer。
  2. argsProgress：解析出 path 后变为 `Write config.ts`，开始累积 content 时**展开 code preview + 光标动画**（cursor 风格边写边看）。
  3. executing（`tool_started`）：保持 streamingContent 继续显示，避免闪烁消失（bridge.ts 的 `createToolUiPreview` 在 output 为空时把 args.content 当作 streamingContent 输出）。
  4. finished（`tool_finished`）：streamingContent 清空，切换为折叠态 `Write config.ts +15 ›`（deletions=0 不展示），点击展开看完整 diff。
- diff 由 `diff` 库 `createTwoFilesPatch` 生成，新建时旧内容为空字符串。
- 磁盘写入仍在 tool execute 阶段原子写入（tmpfile → fsync → rename），**不**在 LLM 流式期间写盘，避免半文件出现或 LLM 重试导致脏写。
- 前端复用 `FileDiffBlock` 折叠式组件（与 `edit_file` 共享），`kind: "write_diff"` 区分标题动作词，无 icon。

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
- 在 `engine/streaming-preview-extractors.ts` 注册同名 previewKind 的 extractor（即便只输出空 preview），让 `tool_call_streaming` 在前端有稳定渲染。
- 流式 `tool_call_streaming.preview`、`tool_started.preview` 和最终 `tool_result.uiPreview` 必须使用同一套展示语义。
- `MessageBlock` / `session-selectors` 必须能从 `ToolUiPreview` 恢复前端消息。
- 前端组件应消费 `MessageBlock` 字段，不直接读取 raw args。
- 测试至少覆盖一次流式展示和一次持久化恢复展示。
- 如需流式展示工具 args 的 string 字段（如 content/command），评估是否真的有意义（不会误导用户），有再用 streamingContent 字段；否则只在最终态展示。
