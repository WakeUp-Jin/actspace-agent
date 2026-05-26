# Agent Core 当前模块地图

本文档记录 `packages/agent-core` 当前已经落地的模块结构。它回答“现在代码分布在哪里、各模块负责什么”，长期设计动机见 `backend-agent-design.md`。

## 顶层类型与契约

- `messages.ts`：内部 Message/Content 类型体系（discriminated union），包含 Usage、StopReason、Context 等核心类型。
- `internal-tools.ts`：统一工具定义（InternalTool）与注册表（InternalToolRegistry），支持 definition + handler + permission 组合。
- `adapters.ts`：内部类型（Message）与 shared 契约（SessionEvent/MessageBlock）之间的双向转换。
- `fixtures.ts`：测试用 mock 数据工厂。
- `types.ts`：agent-core 内部辅助类型。

## `llm/` - LLM 服务层

- `llm/types.ts`：LLMConfig、StreamOptions、LLMService 接口、AssistantMessageEventStream、LLMServiceError。error 事件携带完整 `AssistantMessage`（含部分内容 + `stopReason` + `errorMessage`），而非 `Error` 对象。
- `llm/convert.ts`：共享的消息转换、工具转换、流式 chunk 处理和 SDK 错误映射逻辑。包含防御性消息处理（跳过 error/aborted 的 assistant messages、为孤儿 tool calls 插入 synthetic toolResult）。
- `llm/services/deepseek.ts`：DeepSeekService，使用 OpenAI SDK 直接流式调用 DeepSeek chat completions，具体实现 stream/complete/streamSimple/completeSimple 四个方法。通过 `convert.ts` 共享转换和流处理逻辑。
- `llm/services/kimi.ts`：KimiService，使用 OpenAI SDK 直接流式调用 Kimi chat completions，支持 `builtin_function.$web_search`，并提供 `streamWithBuiltinWebSearch` / `streamMessages` / `completeMessages` 辅助方法。通过 `convert.ts` 共享转换和流处理逻辑。
- `llm/services/mock.ts`：MockLLMService，支持 response queue 模式（通过 `setResponses`/`appendResponses` 预设响应序列）和默认行为模式（向后兼容）。提供 `mockText`、`mockToolCall`、`mockError` 辅助工厂函数。
- `llm/kimi-assistants.ts`：DeepSeek 专用的 Kimi 辅助调用层，包含 `searchWithKimi`（统一处理关键词搜索和 URL 读取，利用 `$web_search` builtin 的 search + crawl 能力）和 `analyzeMediaWithKimi`；系统提示词从 `prompt/kimi-assistants/` 引用。
- `llm/factory.ts`：createLLMService 工厂函数。

## `prompt/` - 提示词集中管理

- `prompt/main-agent.ts`：桌面端默认主 Agent 系统提示词，供 `SystemPromptContext` 初始化使用。
- `prompt/kimi-assistants/`：Kimi 辅助能力使用的系统提示词，包括 `web_search`、`analyze_media`。
- 提示词文件顶部应写明使用位置、影响范围和维护边界；动态上下文、工具协议、密钥和运行时配置不应硬编码进提示词。

## `tools/` - 模块化工具系统

- `tools/types.ts`：ToolDefinitionSpec、ToolExecutorFn、ToolManagerConfig；工具定义必须声明 `previewKind` 作为前端展示语义，并可用 `exposeOnlyTo?: "deepseek" | "kimi"` 做轻量暴露筛选，缺省表示两个主模型都可见。
- `tools/workspace-guard.ts`：路径边界守卫，防止工具访问工作区外文件。
- `tools/manager.ts`：ToolManager（注册/获取/导出工具定义），执行入口委托给 ToolScheduler。
- `tools/scheduler.ts`：ToolScheduler（权限三态决策、工具状态记录、执行、结果渲染与裁剪）。当前 `ask` 会返回结构化待审核结果，approve/deny IPC 和恢复流程由后续计划接入。
- `tools/subprocess/{run-process,ripgrep-path,ripgrep}.ts`：受控子进程执行封装。`run-process` 统一处理进程生命周期、timeout、stdout/stderr 和截断；`ripgrep-path` 按 `ACTSPACE_RG_PATH -> 系统 rg -> bundled @vscode/ripgrep` 解析可执行文件；`ripgrep` 在其上封装 `rg` 命令语义。
- `tools/tools/shared/write-atomic.ts`：原子写入 helper（tmpfile → fsync → rename），Edit 和 Write 工具共用。
- `tools/tools/{read-file,list-directory,edit-file-diff,write-file,bash}/`：每个工具一个目录，含 `definition.ts` + `executor.ts`；其中 `edit-file-diff` 对外工具名为 `edit_file`（snake_case），使用 `diff` 库生成 unified diff 并原子写入；`write-file` 对外工具名为 `write_file`，创建或覆写文件并生成 diff；两者各有 `permissions.ts` 预留 AgentMode 审批扩展；Bash 额外包含 `permissions.ts` 和 `render-result.ts`。目录名沿用 kebab-case，对外 `name` 字段统一 snake_case，详见 `tool-preview-design-guidelines.md` 的工具命名约定章节。
- `tools/tools/{grep,glob}/`：文件搜索工具。grep 通过 ripgrep 正则搜索文件内容，glob 通过 `rg --files --glob` 按文件名模式查找。
- `tools/tools/{web-search,analyze-media}/`：DeepSeek-only Kimi 辅助工具；只有 DeepSeek 为主模型且配置 Kimi key 时注册。`web_search` 统一处理关键词搜索和 URL 读取。

新增工具时，先读 `tool-preview-design-guidelines.md`，确保 `previewKind` 和 `ToolUiPreview` 语义稳定。

## `context/` - 上下文管道

- `context/types.ts`：SystemPart、ContextModule、PromptSegment、CompressionConfig。
- `context/token-estimator.ts`：token 估算与用量快照生成。
- `context/modules/system-prompt.ts`：分段系统提示词上下文。
- `context/modules/conversation.ts`：会话历史上下文模块。构造函数接受可选 `initialMessages`；新增 `static async createFromSession(sessionPath)`，内部用 `persistence/parseJsonl + adapters/sessionEventsToMessages` 一次性恢复 `Message[]`。运行期 `format()` / `appendMessage` 仍是纯内存操作，与 `SystemPromptContext` 的"构造时吃数据、运行期只读内存"机制对齐。V1 升级为 ShortTermMemoryContext 时仅引入 turn 标记 / 多日切片 / 压缩接入，构造入口签名不破坏。
- `context/manager.ts`：ContextManager 编排器（模块协调、appendMessage、getContext、用量统计）。`static async createForSession({ systemPromptModule, sessionPath, ... })` 是会话恢复的语义入口，委托 `ConversationContext.createFromSession`；构造期完成历史加载，`getContext()` 保持同步。普通 `new ContextManager(...)` 也可通过 `options.conversation` 注入已构造好的 ConversationContext，便于测试与 mock 场景。

## `engine/` - 执行引擎

- `engine/types.ts`：AgentEvent（discriminated union）、AgentLoopConfig、AgentLoopResult。
- `engine/loop.ts`：runAgentLoop 纯函数双层循环（内层工具调用+转向、外层跟进）。
- `engine/agent.ts`：Agent 入口类（run/abort），编排 ContextManager + ToolManager + LLMService。
- `engine/bridge.ts`：IPC 桥接层，将 AgentEvent 实时映射为 RuntimeStreamEvent，并根据工具 `previewKind` 将执行结果聚合为带 `ToolUiPreview` 的 AgentTurnResult。`tool_call_delta` 阶段维护 `toolCallStreaming` 状态机（按 toolCallId 累积 partial args + 50ms throttle），调用 `streaming-preview-extractors` 把 partial args 解析为 typed `ToolUiPreview`，emit `tool_call_streaming` 让前端在 tool_start 前就能展示 `Write filename` 甚至 streaming content。
- `engine/partial-args.ts`：partial JSON 字符串字段提取状态机，正确处理 `\"` `\\` `\n` `\uXXXX` 等 JSON escape，未闭合时返回当前累积部分。仅给 streaming-preview-extractors 使用。
- `engine/streaming-preview-extractors.ts`：按 `ToolPreviewKind` 注册的 extractor 表，把 LLM 流式 `tool_call_delta` 累积的 partial JSON 解析成 typed `ToolUiPreview`。write_file 同时提取 path 与 content（content 作为 `streamingContent` 让前端 cursor 风格边写边看）；edit_file 只提取 path（diff 需要文件上下文 + 替换执行才能生成）。新工具按 previewKind 注册一行 extractor 即可。
- `engine/create-agent-deps.ts`：Agent 配置构建与实例创建，两步分离。`buildAgentConfig(frontendInput, workspaceRoot)` 返回纯配置对象 `AgentConfig`（内部读 env + 模型注册表）。运行时实例有两种入口：`createAgentFromConfig(config)`（同步，构造空会话历史，仅供 mock / 单元测试 / 纯内存场景）；`createAgentForSession(config, { sessionPath })`（async，main 进程使用，会话历史在构造阶段通过 `ContextManager.createForSession` 一次性恢复，`contextManager.getContext()` 之后同步可见完整历史）。

Agent Turn 的跨层职责边界见 `agent-turn-layers.md`。

## `persistence/` - 持久化与恢复

- `persistence/types.ts`：SessionStorePaths、JsonlParseResult、WriteResult、SessionRecoveryResult。
- `persistence/jsonl.ts`：健壮 JSONL 读写（坏行容错 + 结构化错误传播）。
- `persistence/meta.ts`：meta.json 增量更新（turnCount/updatedAt/lastModel）。
- `persistence/recovery.ts`：多维恢复（events -> Messages/Blocks/Snapshot/DiffSummary）。
- `persistence/session-store.ts`：会话存储生命周期（create/ensure/write/read/list）。

## `observability/` - 本地运行排障日志

- `observability/agent-run-log.ts`：每次 Agent turn 一个 JSONL 文件，记录从用户输入、main 边界、AgentEvent、RuntimeStreamEvent 到最终结果的完整链路，并清理超过 24 小时的 run 日志。

日志和 session 持久化的边界见 `../storage-and-observability.md`。

## 环境变量管理

- `env.ts`：集中式环境变量管理模块。自带轻量 `.env` 文件解析器（无第三方依赖），按 Schema 驱动验证、解析、冻结。
- `loadEnv()`：应用启动时调用，自动探测并加载 `.env` 文件，合并到 `process.env`（不覆盖已有值）。
- `env` proxy：类型安全的只读对象，任意文件 `import { env }` 后直接访问 `env.DEEPSEEK_API_KEY` 等。
- `envToLLMConfig()`：从 env 生成 `LLMConfig`，仅用于测试和 mock fallback 场景；Electron 真实 turn 使用 `engine/create-agent-deps.ts` 中的 `buildAgentConfig()` + `createAgentFromConfig()` 两步完成。
- `EnvValidationError`：缺失必填项或值不合法时抛出，携带所有问题列表。

项目根目录的 `.env.example` 列出全部可配置项和默认值，`.env` 已被 `.gitignore` 忽略。

## 兼容层

原有单文件入口（`agent.ts`、`llm.ts`、`tools.ts`、`context.ts`、`persistence.ts`）保留为兼容层，内部 re-export 新模块的 API，确保 `desktop` 等现有消费方不被破坏。
