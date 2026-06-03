# Agent Core 当前模块地图

本文档记录 `packages/agent-core` 当前已经落地的模块结构。它回答“现在代码分布在哪里、各模块负责什么”，长期设计动机见 `agent-backend-design.md`。

## 顶层类型与契约

- `messages.ts`：内部 Message/Content 类型体系（discriminated union），包含 Usage、StopReason、Context 等核心类型。
- `internal-tools.ts`：统一工具定义（InternalTool）与注册表（InternalToolRegistry），支持 definition + handler + permission 组合。
- `adapters.ts`：内部类型（Message）与 shared 契约（SessionEvent/MessageBlock）之间的双向转换。
- `fixtures.ts`：测试用 mock 数据工厂。
- `types.ts`：agent-core 内部辅助类型。

## `llm/` - LLM 服务层

- `llm/types.ts`：LLMConfig、StreamOptions、LLMService 接口、AssistantMessageEventStream、LLMServiceError。LLMConfig 现在把 `api` / `apiFormat` / `input` 拆开，error 事件仍携带完整 `AssistantMessage`（含部分内容 + `stopReason` + `errorMessage`），而非 `Error` 对象。
- `llm/convert.ts`：OpenAI 协议的共享消息转换、工具转换、流式 chunk 处理和 SDK 错误映射逻辑。包含防御性消息处理（跳过 error/aborted 的 assistant messages、为孤儿 tool calls 插入 synthetic toolResult）。
- `llm/anthropic-convert.ts`：Anthropic 协议适配层。Context↔Anthropic system/messages/tools 转换、server/client tool 映射、usage 归一（`anthropicUsageToUsage`），以及真流式处理（`createAnthropicAccumulator` + `processAnthropicStream` 逐增量累积 → `buildAnthropicAssistantMessage` / `buildAnthropicErrorMessage`，设计思路与 `convert.ts` 同构，差异仅在协议）。
- `llm/transform-messages.ts`：跨 provider 通用预处理层。负责图片降级、thinking 降级、tool call id 规范化、孤儿 tool result 修复，以及 error/aborted assistant 消息过滤；OpenAI / Anthropic 协议服务都先过这一层再做各自协议转换。
- `llm/services/anthropic-messages.ts`：AnthropicMessagesService，真正的 Anthropic Messages 协议实现层，负责 provider-native tools、usage 归一和真流式事件组装。
- `llm/services/openai-completions.ts`：OpenAICompletionsService，真正的 OpenAI Chat Completions 协议实现层，负责公共消息转换、tool call 重组和 usage 归一。
- 协议服务是 LLM 职责事实来源；品牌 service 只保留兼容包装，不再新增消息转换、tool call 重组或 usage 归一逻辑。
- `llm/services/deepseek.ts`：DeepSeekService 兼容包装层，普通对话实际复用 `OpenAICompletionsService`；只负责 DeepSeek 的 provider 默认值和 api 兜底。
- `llm/services/deepseek-anthropic.ts`：DeepSeekAnthropicService 兼容包装层，普通对话实际复用 `AnthropicMessagesService`；只负责 DeepSeek 的 provider 默认值和 api 兜底。
- `llm/services/kimi.ts`：KimiService 兼容包装层，普通 Kimi 对话复用 `OpenAICompletionsService`；仅保留 `streamWithBuiltinWebSearch` 这类 Kimi 内置 `$web_search` 内部 helper 能力。
- `llm/services/mock.ts`：MockLLMService，支持 response queue 模式（通过 `setResponses`/`appendResponses` 预设响应序列）和默认行为模式（向后兼容）。提供 `mockText`、`mockToolCall`、`mockError` 辅助工厂函数。
- `llm/kimi-assistants.ts`：DeepSeek 专用的 Kimi 辅助调用层，包含 `searchWithKimi`（统一处理关键词搜索和 URL 读取，利用 `$web_search` builtin 的 search + crawl 能力）和 `analyzeMediaWithKimi`；系统提示词从 `prompt/kimi-assistants/` 引用。
- `llm/factory.ts`：createLLMService 工厂函数。当前按 `LLMConfig.api` 选 `AnthropicMessagesService` / `OpenAICompletionsService`，provider 品牌包装层只保留兼容入口。

## `prompt/` - 提示词集中管理

- `prompt/main-agent.ts`：桌面端默认主 Agent 系统提示词，供 `SystemPromptContext` 初始化使用。
- `prompt/kimi-assistants/`：Kimi 辅助能力使用的系统提示词，包括 `web_search`、`analyze_media`。
- 提示词文件顶部应写明使用位置、影响范围和维护边界；动态上下文、工具协议、密钥和运行时配置不应硬编码进提示词。

## `tools/` - 模块化工具系统

- `tools/types.ts`：ToolDefinitionSpec、ToolExecutorFn、ToolManagerConfig；工具定义必须声明 `previewKind` 作为前端展示语义，并可用 `exposeOnlyTo?: "deepseek" | "kimi"` 做轻量暴露筛选，缺省表示两个主模型都可见。`ToolManagerConfig` 还携带压缩相关字段：`truncateThreshold` / `readTruncateThreshold` / `absoluteMaxChars` / `bashInlineThreshold` / `bashDiskCap` / `tmpRoot` / `sessionId` / `summarizer`。
- `tools/workspace-guard.ts`：路径解析与边界守卫。写类工具（write/edit/bash）走 `guardWorkspacePath` 拒绝越界；**读类工具（read_file/grep/glob/list_directory）走 `resolveReadablePath` 只解析不越界**（为支持回读 `<userData>/tmp` 落盘文件与 `session.jsonl`），`displayReadablePath` 决定 workspace 外结果展示绝对路径。取舍与后续 blocklist 见 `docs/SECURITY.md`、`agent-权限设计规则和原则.md`。
- `tools/manager.ts`：ToolManager（注册/获取/导出工具定义），执行入口委托给 ToolScheduler；把 `readTruncateThreshold` / `absoluteMaxChars` / `summarizer` 透传给 scheduler。
- `tools/scheduler.ts`：ToolScheduler（权限三态决策、工具状态记录、执行、结果渲染与裁剪）。`ask` 通过 `ApprovalGate` 暂停工具执行，向桌面端 pending approval registry 发出审核请求，用户 `approve_once` / `deny` / 超时后再恢复调度；`allow_similar` 只有工具权限显式允许时才可继续执行。`postProcess` 异步化：bash 由 executor 自处理（流式落盘 + 头部截断 + outputRef），其余工具走 `output-truncator`（flash 摘要 / 头尾确定性截断兜底）。
- `tools/output-truncator.ts`：非 bash 工具输出后处理。按工具类型取阈值，超阈值先 `headTailTruncate(absoluteMaxChars)` 再送 `summarizer.summarizeToolOutput`，summarizer 不可用回退头尾确定性截断；回填前拼 `compressedNotice` 压缩标记，返回 `modelOutput` + inline `rawOutputRef`。
- `tools/tool-output-paths.ts`：bash 大输出落盘路径构造 `<tmpRoot>/tool-output/<sessionId>/<uniqueId>-bash.txt`。
- `tools/cleanup-tool-outputs.ts`：`cleanupOldToolOutputs(tmpRoot, maxAgeMs=7天)` 按 mtime 删除超期落盘文件并回收空会话目录；desktop 在 turn 起始 best-effort 调用。
- `tools/subprocess/{run-process,ripgrep-path,ripgrep}.ts`：受控子进程执行封装。`run-process` 统一处理进程生命周期、timeout、stdout/stderr；支持流式落盘 sink（`outputFile` / `headBufferCap` / `diskCap`）：内存只留头部缓冲，超出懒落盘、达 `diskCap` 停写标记 truncated，返回 `headBuffer` / `totalBytes` / `outputFilePath`。`ripgrep-path` 按 `ACTSPACE_RG_PATH -> 系统 rg -> bundled @vscode/ripgrep` 解析可执行文件；`ripgrep` 在其上封装 `rg` 命令语义。
- `tools/tools/shared/write-atomic.ts`：原子写入 helper（tmpfile → fsync → rename），Edit 和 Write 工具共用。
- `tools/tools/{read-file,list-directory,edit-file-diff,write-file,delete-file,bash}/`：每个工具一个目录，含 `definition.ts` + `executor.ts`；其中 `edit-file-diff` 对外工具名为 `edit_file`（snake_case），使用 `diff` 库生成 unified diff 并原子写入；`new_string: ""` 表示删除匹配文本内容，不是删除文件，整行删除会连同该行换行删除，行内删除不得吞掉后续换行；`write-file` 对外工具名为 `write_file`，创建或覆写文件并生成 diff；`delete-file` 对外工具名为 `delete_file`，只删除 workspace 内普通文件，默认走一次性用户审批且不允许 `allow_similar`；这些写类/删类工具各有 `permissions.ts` 预留 AgentMode 审批扩展；Bash 额外包含 `permissions.ts` 和 `render-result.ts`。目录名沿用 kebab-case，对外 `name` 字段统一 snake_case，详见 `agent-tool-preview-design-guidelines.md` 的工具命名约定章节。
- `tools/tools/{grep,glob}/`：文件搜索工具。grep 通过 ripgrep 正则搜索文件内容，glob 通过 `rg --files --glob` 按文件名模式查找。
- `tools/tools/{web-search,analyze-media}/`：DeepSeek-only Kimi 辅助工具；只有 DeepSeek 为主模型且配置 Kimi key 时注册。`web_search` 统一处理关键词搜索和 URL 读取。

新增工具时，先读 `agent-tool-preview-design-guidelines.md`，确保 `previewKind` 和 `ToolUiPreview` 语义稳定。

## `context/` - 上下文管道

- `context/types.ts`：SystemPart、ContextModule、PromptSegment、CompressionConfig + `DEFAULT_COMPRESSION_CONFIG`（contextWindow / compressionThreshold / compressKeepRatio / compactMinIntervalCalls / toolTruncateThreshold / readTruncateThreshold / bashInlineThreshold / bashDiskCap / absoluteMaxChars 的单一默认来源）。另含 `CACHE_STABILITY`（IMMUTABLE 100 / STABLE 70 / SEMI 40 / VOLATILE 10）缓存稳定性档位；`PromptSegment` 与 `SystemPart` 都带 `stability` 字段，用于把不易变内容稳定排在请求前缀，提高 DeepSeek prefix-cache 命中率（动机见 `agent-token-usage-and-context-state.md`「缓存稳定性档位」）。
- `context/token-estimator.ts`：token 估算与用量快照生成（`createContextUsageSnapshot` 支持 `compressionCount`）。`createEmptyBuckets()` 遍历共享注册表 `@actspace/shared` 的 `CONTEXT_BUCKET_REGISTRY` 生成 bucket（单一事实来源，新增上下文类型只改注册表 + 主题 token，不改组件）。
- `context/modules/system-prompt.ts`：分段系统提示词上下文。核心段为 `CACHE_STABILITY.IMMUTABLE`，`registerSegment` 默认 `STABLE`；`getPrompt()` 排序键为「stability 降序 → priority 降序 → id 升序」，确定性拼接避免前缀字节漂移。
- `context/modules/conversation.ts`：会话历史上下文模块。构造函数接受可选 `initialMessages`；`static async createFromSession(sessionPath)` 一次性恢复 `Message[]`。新增历史压缩两阶段能力：`planCompaction(keepRatio)`（只读，按 keepRatio 找安全切点——不动区以 assistant turn 开头，不拆 tool_call/tool 配对、避免连续 user）+ `applyCompaction(summary, split)`（用合成摘要替换可压区并返回被替换消息）。运行期 `format()` / `appendMessage` 仍是纯内存操作。
- `context/manager.ts`：ContextManager 编排器（模块协调、appendMessage、getContext、用量统计）。`buildSystemPrompt()` 收集各模块 `SystemPart` 后按 `stability` 降序稳定排序（同稳定性按收集 index tie-break），让最不易变内容（系统提示词 IMMUTABLE）稳定落在请求前缀。`static async createForSession({ systemPromptModule, sessionPath, ... })` 是会话恢复入口，同时把 `sessionPath` 存为压缩摘要的回看 ref。`async compactIfNeeded(summarizer)`：token 水位过 `contextWindow×compressionThreshold` 且距上次压缩满足 `compactMinIntervalCalls` 时调 HistoryCompactor，返回 `ContextCompactionReport`（trigger/threshold token、前后消息数、ref），`compressionCount` 计入用量快照。`async compactNow(summarizer)` 是手动 `/compact` 入口，跳过阈值与间隔检查但仍复用同一安全切点和 fallback，返回 `compacted/skipped` 状态。
- `context/compression/`：上下文压缩子系统。`summarizer.ts`（flash 摘要封装，`summarizeToolOutput` / `summarizeHistory`，失败抛 `SummarizerUnavailableError`）、`tool-summary-prompts.ts`（按 previewKind 选 prompt + `compressedNotice` 压缩标记）、`history-prompts.ts`（ClaudeCode 8 节摘要 prompt + 开篇语 + session.jsonl 回看 footer）、`history-compactor.ts`（`compactHistory` 序列化可压区 → 摘要 → 合成 `source:"compaction"` UserMessage 替换；摘要不可用兜底为「丢弃最旧 + 指针」）。

## `engine/` - 执行引擎

- `engine/types.ts`：AgentEvent（discriminated union，含 `context_compaction`）、AgentLoopConfig（含 `maybeCompact?`、`cacheAudit?`）、AgentLoopResult、`ContextCompactionInfo` / `CompactionOutcome`。`LLMUsageCall` 可携带 `cacheAudit` 元数据，供 bridge 写入 `llm_usage.payload`。
- `engine/loop.ts`：runAgentLoop 纯函数双层循环（内层工具调用+转向、外层跟进）。每次模型调用前 `await config.maybeCompact?.()`，发生压缩时用返回的新数组刷新 `context.messages` 引用并 emit `context_compaction` 事件；随后在 `llm.stream` 前后调用可选 `cacheAudit.beforeLlmCall/afterLlmCall`，快照真实 provider 输入并根据模型返回 usage 确认低缓存。
- `engine/agent.ts`：Agent 入口类（run/abort），编排 ContextManager + ToolManager + LLMService；持有 `summarizer` 与可选 `cacheAudit`，把 `contextManager.compactIfNeeded` 包成 `maybeCompact` 传入 loop。
- `engine/bridge.ts`：IPC 桥接层，将 AgentEvent 实时映射为 RuntimeStreamEvent，并根据工具 `previewKind` 将执行结果聚合为带 `ToolUiPreview` 的 AgentTurnResult。`createToolExecutionResult` 据 `ToolResult.outputRef` 填 `rawOutput` / `rawOutputRef`（bash 为 file ref、其余 inline）；收集 `context_compaction` 事件落 run-log、生成 `context_compaction` SessionEvent 追加到 session 事件，并把自动压缩完成态映射为 `context_compaction_finished` stream event。透传 `summarizer` / `cacheAudit` 给 Agent，并把 `LLMUsageCall.cacheAudit` 的 `cacheStatus/cacheAuditId/cacheHitRatio` 写入 `llm_usage.payload`。`tool_call_delta` 阶段维护 `toolCallStreaming` 状态机（按 toolCallId 累积 partial args + 50ms throttle），调用 `streaming-preview-extractors` 把 partial args 解析为 typed `ToolUiPreview`，emit `tool_call_streaming` 让前端在 tool_start 前就能展示 `Write filename` 甚至 streaming content。
- `engine/compact-context.ts`：手动 `/compact` 后端入口。接收 `CompactContextInput` + 已装配 `AgentDeps`，发送 `context_compaction_started/progress/finished/failed` stream event，调用 `contextManager.compactNow()`，返回 `CompactContextResult` 并产出 `context_compaction` / `context_snapshot` 事件。
- `engine/partial-args.ts`：partial JSON 字符串字段提取状态机，正确处理 `\"` `\\` `\n` `\uXXXX` 等 JSON escape，未闭合时返回当前累积部分。仅给 streaming-preview-extractors 使用。
- `engine/streaming-preview-extractors.ts`：按 `ToolPreviewKind` 注册的 extractor 表，把 LLM 流式 `tool_call_delta` 累积的 partial JSON 解析成 typed `ToolUiPreview`。write_file 同时提取 path 与 content（content 作为 `streamingContent` 让前端 cursor 风格边写边看）；edit_file 和 delete_file 只提取 path（edit 的 diff 需要文件上下文 + 替换执行才能生成，delete 的审批/执行状态由权限事件和工具结果决定）。新工具按 previewKind 注册一行 extractor 即可。
- `engine/create-agent-deps.ts`：Agent 配置构建与实例创建，两步分离。`buildAgentConfig(frontendInput, workspaceRoot, approvalGate?, runtimeContext?)` 返回纯配置对象 `AgentConfig`，`runtimeContext` 透传 `tmpRoot` / `sessionId` 到 `toolManagerConfig`（bash 落盘需要），并可传入主 Agent 当前完整 `systemPrompt`（桌面端来自 SettingsService；不传则用代码默认 `MAIN_AGENT_SYSTEM_PROMPT`）。运行时实例有两种入口：`createAgentFromConfig(config)`（同步，空会话历史，mock/测试）；`createAgentForSession(config, { sessionPath })`（async，main 进程，构造期一次性恢复历史）。两者都用 `createSummarizerForAgent()`（`deepseek-v4-flash`，无 DeepSeek key 时为 undefined）构造 `summarizer`，注入 ToolManager 与 `AgentDeps`，供工具输出摘要与 mid-loop 历史压缩使用。

Agent Turn 的跨层职责边界见 `agent-turn-layers.md`。

## `persistence/` - 持久化与恢复

- `persistence/types.ts`：SessionStorePaths、JsonlParseResult、WriteResult、SessionRecoveryResult。
- `persistence/jsonl.ts`：健壮 JSONL 读写（坏行容错 + 结构化错误传播）。
- `persistence/meta.ts`：meta.json 增量更新（turnCount/updatedAt/lastModel）。
- `persistence/recovery.ts`：多维恢复（events -> Messages/Blocks/Snapshot/DiffSummary）。
- `persistence/session-store.ts`：会话存储生命周期（create/ensure/write/read/list）。

## `observability/` - 本地运行排障日志

- `observability/agent-run-log.ts`：每次 Agent turn 一个 JSONL 文件，记录从用户输入、main 边界、AgentEvent、RuntimeStreamEvent 到最终结果的完整链路（含 `context_compaction` 历史压缩记录），并清理超过 24 小时的 run 日志。
- `observability/cache-audit.ts`：缓存失效旁路审计器。模型调用前对真实 Context 生成稳定 hash 指纹并读取滚动 `last.context.json` 做 prefix / append-only 比较；模型返回后按 `cacheHit/cacheRead + cacheMiss` 计算命中率，低于阈值时在 `<userData>/cache-audit/<sessionId>/<cacheAuditId>/` 固化 `summary.json`、`previous.context.json`、`current.context.json`、`diff.txt`，并始终 best-effort 覆盖滚动 `last.context.json`。

日志和 session 持久化的边界见 `../core-storage-and-observability.md`。

## 环境变量管理

- `env.ts`：集中式环境变量管理模块。自带轻量 `.env` 文件解析器（无第三方依赖），按 Schema 驱动验证、解析、冻结。
- `loadEnv()`：应用启动时调用，自动探测并加载 `.env` 文件，合并到 `process.env`（不覆盖已有值）。
- `env` proxy：类型安全的只读对象，任意文件 `import { env }` 后直接访问 `env.DEEPSEEK_API_KEY` 等。
- `envToLLMConfig()`：从 env 生成 `LLMConfig`，仅用于测试和 mock fallback 场景；Electron 真实 turn 使用 `engine/create-agent-deps.ts` 中的 `buildAgentConfig()` + `createAgentFromConfig()` 两步完成。
- `EnvValidationError`：缺失必填项或值不合法时抛出，携带所有问题列表。

项目根目录的 `.env.example` 列出全部可配置项和默认值，`.env` 已被 `.gitignore` 忽略。

## 兼容层

原有单文件入口（`agent.ts`、`llm.ts`、`tools.ts`、`context.ts`、`persistence.ts`）保留为兼容层，内部 re-export 新模块的 API，确保 `desktop` 等现有消费方不被破坏。

## `kairos/` - 自治模式

Kairos 是 actspace 内置的"主动 Agent"——常驻进程、tick 驱动、随时被用户消息打断。它复用主 Agent 的 LLMService / ToolManager / SessionEvent / engine.runAgentLoop，自身只新增"调度 + 配置 + 观察 + 短期记忆"四组能力。完整设计见 `agent-kairos-autonomous-mode.md`。

```mermaid
flowchart TB
  subgraph kairos[packages/agent-core/src/kairos/]
    Controller[controller.ts<br/>装配中枢]
    Scheduler[scheduler.ts<br/>MessageQueue + QueueProcessor]
    Runner[runner.ts<br/>KairosRunner.processTick]
    PromptAsm[prompt-assembler.ts<br/>5 段 system prompt 拼装]
    Inbox[inbox.ts<br/>Agent inbox loader/writer]
    Aggregator[aggregator.ts<br/>事件聚合 re-export]

    subgraph cfg[config/]
      Schema[schema.ts<br/>Preferences/Paths/Blocklist]
      Loader[loader.ts]
      CfgPrompt[prompt-assembler.ts<br/>config tip 块]
    end

    subgraph store[storage/]
      ShortMem[short-memory-store.ts<br/>JSONL append + rotate]
      Ring[ring-buffer.ts<br/>200 条 SessionEvent]
    end

    subgraph ctx[context/]
      ShortTerm[short-term.ts<br/>token budget 加载]
      WatchScan[watch-scanner.ts<br/>fs.readdir 递归]
      WatchDiff[watch-diff.ts<br/>sha1 manifest 对比]
      SessDigest[sessions-digest.ts]
    end

    subgraph briefs[briefs/]
      BParser[parser.ts]
      BIndex[index-manager.ts]
      BDispatch[dispatcher.ts<br/>pickNext]
    end

    subgraph guard[guard/]
      Extract[extract-paths.ts]
      Block[blocklist-check.ts<br/>globToRegex]
    end

    subgraph compress[compression/]
      Compressor[compressor.ts<br/>调 LLMService.complete]
    end

    subgraph tools[tools/]
      SleepTool[sleep.ts]
    end
  end

  Controller --> Scheduler
  Controller --> Runner
  Controller --> ShortMem
  Controller --> Ring
  Controller --> BIndex
  Controller --> WatchDiff
  Controller --> Compressor
  Scheduler --> Runner
  Scheduler --> BDispatch
  Runner --> PromptAsm
  Runner --> ShortTerm
  Runner --> WatchDiff
  Runner --> SessDigest
  Runner --> Inbox
  PromptAsm --> CfgPrompt
  BIndex --> BParser
```

模块速读：

- `controller.ts`：单例装配中枢。`createKairos(opts)` 接收 `kairosRoot / llm / toolManagerFactory / contextWindow`，内部串起所有子模块并 emit `event` / `state`。`eventSink` 严格按"写盘 → 推 ring buffer → 回调 listener"顺序，保证消费方任何时刻看到的都是已持久化事实。**额度护栏**：持有 `KairosBudgetStore`，`eventSink` 处理 `llm_usage` 后按 `budget.enabled` 扣减余额、耗尽则 `triggerWake`；scheduler emit `budget_exhausted` 时走 `haltForBudget`（enabled=false + 持久化 preferences.enabled=false + emit error）；`setBudget()` 写盘 + 重算 + 耗尽态清理；`start({force})` 耗尽时 throw。**优雅退出**：持有每轮重建的 `AbortController`，`shutdown()` = abort 在飞请求 + stop 循环 + flush usage/budget。
- `scheduler.ts`：`MessageQueue` FIFO + `QueueProcessor` 主循环。`runInterruptibleSleep` 用 `Promise + setTimeout + clearTimeout` 实现可中断 sleep；`mainAgentBusy` 标志让主 Agent runTurn 期间 scheduler 暂停取下一条；连续 `errorThreshold` 次失败进 cooldown。`sleepBiasAt(now, prefs)` 按 `preferences.rhythm` 调节 sleep 系数，`clampSleep` 卡住 LLM 请求范围。注入的 `canStartTick()`（额度耗尽时返回 false）在投/取 tick 前 + tick 后 sleep 前各检查一次，命中即 `onStateChange("budget_exhausted")` + break。
- `runner.ts`：`KairosRunner.processTick(msg)` 执行单次 tick：刷新观察（watch diff + sessions digest + Agent inbox）→ 加载 short-term context（token budget）→ assemble system prompt → emit `kairos_tick_injected` → 从 Kairos 专属 ToolManager 注入工具定义 → 直接调用共享 `runAgentLoop({ toolExecuteOptions: { callerAgent:"kairos", kairosGuard } }, getAbortSignal?.())`（透传退出用 AbortSignal）→ 把 `tool_start/tool_end/message_end` 转成 Kairos `SessionEvent` → 解析最后一次 `sleep(seconds)` 工具参数返回给 scheduler。
- `prompt-assembler.ts`：把 5 段（pacing / observation / config tip / history / rule.md）拼到 `KAIROS_SYSTEM_PROMPT` 占位符；每段独立 token budget。观测段内部再把 watch diff、sessions digest、Agent inbox 分块截断，避免某一类长内容把其它观测信号完全挤掉。
- `inbox.ts`：V0 Agent 文件收件箱。幂等创建 `<kairosRoot>/inbox/main-agent.md` / `lab-agent.md`，提供 `appendKairosInboxMessage()` 和 `loadKairosInboxSummary()`；写入只 append 到文件末尾，读取时按最近消息数与字符预算截断。inbox 只作为 Kairos prompt 观测信号，不作为短期记忆事实源。
- `aggregator.ts`：薄壁 re-export `@actspace/shared` 的 `aggregateKairosEvents`——agent-core 内部统一从这里 import，避免散落引用 shared。
- `config/`：4 个文件（preferences.json / paths.json / blocklist.json / rule.md）的 schema 解析器（无 Zod，手写校验）+ tip 提取拼装。
- `storage/`：`ShortMemoryStore` 移植自 heartclaw，按月分目录 + 按日分文件 + 每日分卷（`_001.jsonl` → reset 时滚到 `_002`）。`SessionEventRingBuffer` 是内存圆环，200 条上限，给 UI 首屏用。`usage-accumulator.ts`（`KairosUsageAccumulator`，lifetime + sinceReset 双维度 token/成本总账，只增不减）和 `budget-store.ts`（`KairosBudgetStore`，额度护栏运行态 `{enabled, balanceCny}`，运行时被扣减且用户可改）共用 debounce + atomic rename + flush 范式，分别落 `memory/usage-accumulator.json` 与 `memory/budget-state.json`。
- `context/`：`watch-scanner` 手写递归遍历（不引 chokidar/glob），`watch-diff` 用 sha1 哈希文件列表对比快/慢路径，`sessions-digest` 扫 `paths.json` 列出的会话路径生成 unread turn 元数据，`short-term` 按 token budget 倒序加载历史事件并 sanitize 工具孤儿。
- `briefs/`：用户写在 `briefs/tasks/<id>.md` 的任务，frontmatter 含 `intervalSec`（v1 替代 cron）；`index-manager` 维护 `briefs/index.json` 的 lastRun/nextRun；`dispatcher.pickNext(now)` 在每次"队列空"时被 scheduler 调用。
- `guard/`：`extract-paths(args)` 集中处理"哪些字段是路径"，`blocklist-check` 用手写 `globToRegex` 匹配命中。两者被 `tools/scheduler.ts` 的 `checkKairosGuard` 调用，只对 `callerAgent === "kairos"` 路径激活。
- `compression/compressor.ts`：被动调用——controller 在 tick 完后看 short-term token 超阈值时触发，调 `llm.complete()` 出 markdown summary 写回 `memory/short-term/<YYYY-MM>/week_*.summary.md`。
- `tools/sleep.ts`：Kairos 专属工具。executor 只是"记账"——返回成功结果给 LLM、把 `seconds` 通过 SessionEvent 传出，真正的 sleep 由 scheduler 在 tick 结束后执行。

与主 Agent 共用的 hooks（已在前置模块文档中说明）：

- 主 Agent 和 Kairos 共享 `LLMService / ToolManager / ToolScheduler / runAgentLoop` 这套工具执行内核；差异只在外壳：主 Agent 通过 `engine/bridge.ts` 推 `RuntimeStreamEvent` 到聊天区并写主 session，Kairos 通过 `kairos/runner.ts + controller.eventSink` 推 `SessionEvent` 到 KairosPage 并写 short-term jsonl。
- `desktop/src/main/kairos-bootstrap.ts#createKairosToolManagerFactory()` 创建 Kairos 专属 ToolManager：先注册主 Agent 同款基础工具，再按 `env.disabledTools + blocklist.toolsDenied` 过滤；`controller.ts` 之后调用 `registerKairosTools()` 追加 Kairos 专属 `sleep`。默认 `blocklist.toolsDenied` 含 `bash`，用户显式移除后才会暴露给 Kairos。
- `engine/types.ts` 的 `AgentLoopConfig.toolExecuteOptions` 字段：让 runner 把 `callerAgent + kairosGuard` 透到 `ToolManager.execute(name, args, callId, options)`。主 Agent 不传该字段时路径零开销。
- `tools/scheduler.ts` 的 `checkKairosGuard(toolName, args)`：仅在 `callerAgent === "kairos"` 时跑路径白名单 + blocklist 双校验。
- Kairos 工具事件契约：`tool_start` 转 `tool_call { id, name, arguments }`，`tool_end` 转 `tool_result { toolCallId, toolName, ok, summary, modelOutput }`；前端右侧"工具结果"里的输入来自 `tool_call.payload.arguments`。
- 4 个新 `SessionEventType`：`kairos_tick_injected` / `kairos_sleep_start` / `kairos_sleep_end` / `kairos_sleep_interrupted`。`@actspace/shared/kairos-aggregator.ts` 的 `aggregateKairosEvents(events)` 把它们和复用的 `assistant_message` / `tool_call` / `tool_result` 聚合为表格行。

Desktop 集成（`packages/desktop`）：

- `src/main/agent-runtime-context.ts` + `agents-md-service.ts`：主 Agent runtime context 装配入口。`SettingsService.readAgentSystemPrompt()` 读取 `<userData>/prompts/main-agent.md` 作为主系统提示词；`agents-md-service` 固定加载 `<userData>/AGENTS.md` 与 `<workspaceRoot>/AGENTS.md`，缺失静默跳过、读取失败只 warning，并以 `rules` segment 注入 `SystemPromptContext`。真实 turn 与 `context:describe` 共用该 loader，避免上下文检查视图和 LLM 实际输入漂移。
- `src/main/context-describe-service.ts`：按需重建某个 session 的 Context 明细，不调用 LLM；现在通过同一 runtime context loader 注入主系统提示词文件和 `AGENTS.md` rules，再用 `buildContextEntries` 生成 systemPrompt / rules / tools / conversation 逐条全文。
- `src/main/kairos-bootstrap.ts`：`ensureKairosScaffolding(kairosRoot)` 幂等建目录 + 落 4 份默认 config；`createKairosLlm()` 复用 `buildLLMConfig`；`createKairosToolManagerFactory({ workspaceRoot })` 把 `blocklist.toolsDenied` 合并进 `disabledTools`。
- `src/main/kairos-ipc.ts` + `kairos-ipc-internals.ts`：注册 invoke handler（`kairos:get-state/get-events-recent/control/read-config/write-config/get-context-snapshot`） + 50ms debounce 推 `kairos:event/state` 到 renderer。`dispatchKairosControl` 纯逻辑分派 `KairosControl`，含 `set_budget`（→ `controller.setBudget`，不碰 preferences）。
- `src/main/index.ts` 的 `before-quit`：优雅退出——首次进入 `preventDefault` + 发 `app:shutting-down` → `await controller.shutdown()` → `app.exit(0)`，5s 超时兜底强退（修复早期 async before-quit 不被 await 的 bug）。
- `src/preload/index.ts` + `global.d.ts`：`window.actspace.onShuttingDown(cb)` 订阅 `app:shutting-down`。
- `src/renderer/state/useKairos.ts` + `src/renderer/pages/KairosPage.tsx`：UI 入口，事件流上限 500 条，4 个 config tab 共用 raw textarea + 保存按钮；状态条按 `budget.enabled` 显示额度胶囊、`budget_exhausted` 显示"额度不足"。
- `src/renderer/components/settings/KairosSettings.tsx`：「Kairos 自主智能体」分区的额度限制开关 + 剩余额度输入（走 `window.kairos` getState/onState/control set_budget）。
- `src/renderer/components/ShutdownOverlay.tsx`：挂在 `App.tsx` 顶层，收到 `onShuttingDown` 后铺全屏「Kairos 正在安全关闭」遮罩。
