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

- **工具对外 `name`** 一律 **snake_case**，例如 `read_file`, `write_file`, `edit_file`, `list_directory`, `web_search`, `web_fetch`。单词工具（`bash`, `grep`, `glob`）保持单词无分隔符。
  - LLM 工具协议（OpenAI / DeepSeek / Kimi / Anthropic）事实约定都是 snake_case，统一使用 `_` 而不是 `-` 兼容性最好。
  - 历史上 `edit-file` 是 kebab-case 异类，已在 2026-05 统一为 `edit_file`。
- **目录名**（`packages/tools/core-tools/src/<dir>/`）一律 **kebab-case**，例如 `edit-file-diff/`, `read-file/`, `web-search/`。这是仓库整体的目录命名风格，与工具 `name` 独立。
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
- 工具调用进行中阶段（`tool_started` 之后、`tool_finished` 之前）所有工具行使用统一的 B 方案 text shimmer：`text-faint` 底字 + `text-main` 墨色扫光，收到 `tool_finished` 后立即停止，不人为延长 running。详见 [中间消息区规范 - 工具执行中态规范](../frontend/front-中间消息区规范.md#工具执行中态规范)。
- running 阶段后端 `tool_started.preview` 只推送当前能确定的最小字段（filePath / command / query），不传未生成的数值（diff stats、entryCount 等）；完成态字段在 `tool_finished` / 持久化事件中补齐。
- `tool_finished` 是单个工具调用的完成事实。renderer 必须按 `toolCallId` 立即切换该工具的最终状态，不能为了最短动画时长等待同批其他工具完成；视觉平滑不能延迟真实生命周期状态。
- **`tool_call_streaming` 事件契约**：首个参数分片只触发稳定动作占位；prepared 后一次发送完整摘要。Main 不再累积或解析可见 partial args，前端直接消费 typed preview。正文与 Thinking 保持流式，执行状态与结果继续实时更新。
- **`subagent_event` 事件契约**：Agent 工具执行 SubAgent run 时，bridge emit `subagent_event { toolCallId, transcriptRef, event, preview }`，其中 `preview` 是完整 typed `AgentToolPreview`。renderer 只用它覆盖同一个 Agent block 的 running state，不解析 SubAgent 原始工具参数；最终完成态仍由 `tool_result.uiPreview.kind === "agent"` 持久化恢复。

## v2 实时链路与结果顺序

Core 的工具参数使用独立 `tool-call-delta`，不能复用正文 `assistant-delta`。AgentLoop 在 tool/call append 后发 prepared，在 Tools 真正调用 executor 前发 started，在 tool/result append 后发 finished。审批继续由现有 approvalRegistry 生产。Desktop `FixedRendererStreamAdapter` 经既有 agentStream IPC 发布 typed preview；通用 Session live/revision 不转发工具参数原文。

实时和历史使用同一个 Main preview builder。参数阶段只显示稳定占位；prepared 一次补齐，finished 覆盖结果。正文中的合法 JSON 保持原文。

ToolRuntime 并行 body 结束后立即提交结果；OrderedToolCommitQueue 保留调用顺序，后发先完成的结果仍等待前序提交，但不再等待整批 body 完成。Renderer 收到单个 finished 立即收尾，也允许 finished 直接创建工具条目，迟到的参数、进度和审批不能回退终态。

Read/List/Grep 等轻量组件在失败时显示结果摘要；Bash 保留 denied/cancelled，Write/Edit/Delete 使用已有 failed/denied 组件并保留错误说明。具体实现与验收见 [工具流式渲染设计](../frontend/front-agent-tool-stream-rendering.md)。

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
- 展示示例：`Glob **/*.ts in packages/runtime`。

### `edit_file`

- `previewKind`: `edit_diff`
- `ToolUiPreview.filePath`: 文件名，例如 `index.ts`
- `ToolUiPreview.additions` / `deletions`: 结构化修改统计。
- 流式阶段（dispatched → argsProgress → executing）后端持续推 `tool_call_streaming` + `tool_started`，preview.filePath 从空字符串逐渐变为真实文件名，前端 `MessageBlock.status` 一直是 `running`，渲染为单行 + shimmer 闪光，生成时每秒至多显示一次 `new_string` 的字符量（不包含 `old_string`），prepared 显示“准备保存”，executing 显示“正在保存”，不显示 chevron、增删统计或 content 预览。
- 为什么不流式 content：edit 的 diff 需要「文件原内容 + old_string 定位 + new_string 替换」三者全齐才能生成有定位的 unified diff，LLM 流式只能拿到 old/new 两段无上下文文本，强行展示会误导用户。Main 共享 preview builder 的 `edit_diff` 分支 只提取 path。
- 流式 `tool_finished` 后切换为 `status: completed`，渲染折叠态 `Edit index.ts +3 -1 ›`，点击展开完整 diff。
- diff 由 `diff` 库 `createTwoFilesPatch` 生成（标准 unified diff 格式），包含上下文行。
- `new_string: ""` 的长期语义是删除唯一匹配文本内容，不是删除文件；多处匹配仍必须提供更多上下文或显式 `replace_all`。
- 删除整行时，如果 `old_string` 恰好从行首匹配且匹配后紧跟换行，executor 会连同该换行一起删除，避免留下空白行；行内文本删除不得吞掉后续换行。
- `ToolUiPreview.additions` / `deletions` 必须只统计 unified diff hunk 内的真实 `+` / `-` 行，不统计 `---` / `+++` 文件头，也不能漏算内容本身以 `---` 或 `+++` 开头的变更行。
- **diff/统计来源必须是 `ToolResult.structured`**（scheduler `postProcess` 保留的原始结构化结果），不能从回填给模型的 `modelOutput` 反解析——大 diff 会被上下文压缩改写，反解析会导致统计归零、展开内容是摘要文本。
- `ToolUiPreview.status`: `pending` / `running` / `completed` / `failed` / `denied`（与 `delete` 一致）。失败/拒绝时错误说明放 `errorMessage` 字段，**不**复用 `diff` 字段承载错误文本。
- 越界写入审批：目标路径在 workspace 外时权限检查器返回 `ask`，前端复用 `FileDiffBlock` 渲染审批卡片（`status: pending` + `approvalRequestId` + `reason`），用户 `Allow` / `Skip`；拒绝后展示 `Denied edit xxx.md`。
- 前端使用 `FileDiffBlock` 折叠式组件，与 `write_file` 共享同一组件，无 icon，左边缘与 Read / Grep 等工具行对齐。

### `write_file`

- `previewKind`: `write`
- `ToolUiPreview.filePath`: 文件名，例如 `config.ts`
- 当前 v2 Host 不发送 `streamingContent`；参数生成期间通过 `generationProgress` 每秒至多更新一次 `content` 的字符量（Unicode 码点），不统计路径或 JSON 编码字符；prepared 后一次显示完整路径。
- prepared 显示“准备保存”，executing 显示“正在保存”；finished 补齐 diff、additions/deletions，并可展开结果。无增量时显示“正在生成”，不伪造计数。
- diff 由 `diff` 库 `createTwoFilesPatch` 生成，新建时旧内容为空字符串。
- 磁盘写入仍在 tool execute 阶段原子写入（tmpfile → fsync → rename），**不**在 LLM 流式期间写盘，避免半文件出现或 LLM 重试导致脏写。
- diff/统计来源、`status` / `errorMessage` 语义、workspace 路径边界检查与 `edit_file` 一致（见上）。
- 前端复用 `FileDiffBlock` 折叠式组件（与 `edit_file` 共享），`kind: "write_diff"` 区分标题动作词，无 icon。

### `delete_file`

- `previewKind`: `delete`
- `ToolUiPreview.filePath`: 文件名，例如 `notes.md`。
- `ToolUiPreview.status`: `pending` / `running` / `completed` / `failed` / `denied`。
- 权限语义：第一版默认 `ask`，即使目标在 workspace 内也必须用户确认；只允许一次性 `Delete`，不提供 `allow_similar`。
- 流式阶段只展示轻量工具行 `Delete notes.md` + shimmer；审批 pending 阶段切换为独立 `DeleteFileBlock`，展示目标文件、reason、`Skip` 和 `Delete`。
- 审批通过后同一条工具消息回到 running，完成后展示 `Deleted notes.md`；拒绝后展示 `Denied delete notes.md`。
- session 恢复只恢复最终事实态（completed / failed / denied）；pending 审批依赖运行态 pending approval 事件恢复，不从历史里猜测。
- 不展示完整路径；完整参数保留在 `tool_call.payload.arguments`、run log 和持久化事件中。

### `bash`

- `previewKind`: `bash`
- 折叠态使用 `commandPreview`。
- 展示：`Running pnpm test`、`Ran pnpm test`、`Denied rm -rf ...`。
- 完整 `command` 只在展开态展示。
- 完成态的普通 `sandboxed: true` 信息放入详情，`sandboxed: false` 的 `真实环境` badge 仍在主行；pending 审批继续显示计划环境。实时和历史恢复透传同一字段，缺失时不推测。
- 主行只呈现状态动作和命令，耗时、退出码、完整错误与旧标题保留在详情。Main 使用稳定的 Bash 标题；不从 summary 反解析元数据。未执行时不展示遗留输出或成功退出码。
- 审批 pending 时 badge 表示计划执行环境，最终 preview 以 executor 返回的实际环境覆盖；权限拒绝使用 `notExecuted: true` 展示 `未执行`。
- hard reject 的模型回填必须明确说明“执行前拒绝、没有创建审批请求”，不能只返回含糊的 dangerous 文案让模型误以为仍可审批。

### `web_search`

- `previewKind`: `web_search`
- 支持两种模式：`query`（关键词搜索）和 `url`（读取网页）。
- `ToolUiPreview.mode`: `query` 或 `url`。
- query 模式展示：`Web Search 最新新闻 今天`。
- url 模式展示：`Web Search https://example.com/path`（2026-07-06 起两种模式统一 `Web Search` 前缀，`mode` 字段仍保留区分）。
- 不在工具日志行里展示搜索结果正文、来源摘要或页面摘要；这些内容只保留在 `tool_result.rawOutput` / `modelOutput` 中，供模型继续推理和排障使用。

### `generate_image`

- `previewKind`: `image_generation`。
- running 与 completed 都使用 Read 同级的单行工具日志，不使用图标、外围卡片或聊天区缩略图。
- 参数顺序为动作词、size、数量、prompt preview、model；整行使用视觉截断，完整参数仍保留在 tool call 与 preview 契约中。
- completed / partial 产生的本地图片由 turn 级 `Artifacts` 组件聚合；组件必须等当前 `agent_run_finished`、最终回复完成后再发布，工具行只表达执行事实，不承担产物浏览。
- 点击图片必须通过 main/preload 的 Session Artifact 读取通道，renderer 不拼接 `file://`，不从绝对路径直接读盘。
- 产物行的完整路径只在悬浮 Tooltip 中显示；右键系统操作必须由 main 侧按 session artifacts 或 workspace realpath 边界重新解析，不信任 renderer 传入的绝对路径。
- 失败或 warning 使用工具行内 bounded disclosure 展示；hover 只作为辅助，不是查看错误的唯一方式。Provider 返回 HTML 或非法 JSON 时先在 main 侧归一化为稳定的 `IMAGE_GENERATION_INVALID_RESPONSE` 错误，不把原始 HTML body 写入 Journal。
- `tool_finished` 仍按 `toolCallId` 立即更新该行，但它不是发布 turn 级产物的信号；产物栏只消费 completed / partial 的最终图片引用，并将后续成功 Delete 视为对本轮文件输出的撤销。

### `agent`

- `previewKind`: `agent`
- 对外工具名是 `agent`，用户可见名是 `Agent`。
- `ToolUiPreview` 必须是 `AgentToolPreview`，包含 `description`、`status`、`subagentType`、`displayText`，执行中可带 `recentEvents` 和 `transcriptRef`，完成态带 `summary`、`stats`、`transcriptRef`。
- 展示：主消息流渲染为可点击 `AgentRunBlock`，而不是普通单行工具日志；点击打开 Composer 上方的 SubAgent transcript panel。
- `actspace.explore` 与通用 `actspace.agent` 均使用右侧 SubAgent transcript panel；Explore 不在主消息流内联展开。
- running 更新来自 `RuntimeStreamEvent.subagent_event.preview`。`recentEvents` 只展示最近 3-5 条 transcript 摘要，完整 transcript 通过 `transcriptRef` 读取。
- 主 session 只持久化 Agent 工具的 `tool_call` / `tool_result` 和最终 preview，不展开写入 SubAgent transcript 内部事件。
- `modelOutput` 给主 Agent 使用，必须是短 summary + stats + transcript ref；完整 transcript 只服务 UI 回放和排障。

## 新增工具检查清单

- 工具 definition 必须声明 `previewKind`。
- `createToolUiPreview()` 必须为新增展示类型生成稳定字段。
- 在 `engine/streaming-preview-extractors.ts` 注册同名 previewKind 的 extractor（即便只输出空 preview），让 `tool_call_streaming` 在前端有稳定渲染。
- 流式 `tool_call_streaming.preview`、`tool_started.preview` 和最终 `tool_result.uiPreview` 必须使用同一套展示语义。
- 聚合型工具如果有内部事件流（例如 Agent/SubAgent），必须新增 typed stream event 或 typed preview 更新，不能让 renderer 从 raw args / raw output 反推运行状态。
- `MessageBlock` / `session-selectors` 必须能从 `ToolUiPreview` 恢复前端消息。
- 前端组件应消费 `MessageBlock` 字段，不直接读取 raw args。
- 测试至少覆盖一次流式展示和一次持久化恢复展示。
- 如需流式展示工具 args 的 string 字段（如 content/command），评估是否真的有意义（不会误导用户），有再用 streamingContent 字段；否则只在最终态展示。

默认内置工具操作审批仅保留 Bash；其他工具的参数校验、能力限制与路径边界仍生效。
