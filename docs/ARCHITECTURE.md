# 架构总览

这份文档用于描述 `actspace` 当前确认下来的顶层结构和实现边界。

## 当前仓库结构

- `packages/desktop`：Electron main、preload、renderer 所在的桌面端应用。
- `packages/agent-core`：Agent 运行层、模型接入、上下文、工具与执行循环。
- `packages/shared`：IPC contracts、session schema、跨进程共享类型。
- `infra/`：部署、基础设施和环境定义。
- `scripts/`：仓库级自动化脚本，供人和 Agent 直接调用。
- `docs/`：仓库知识库，也是本地规则和上下文的正式来源。

## 边界建议

- 基础设施和运行编排要显式版本化，不要藏在手工操作里。
- 避免隐式跨包耦合；一旦仓库成形，就把允许的依赖方向写清楚。
- 只要架构有变化，就同步更新这份文档。

## 当前运行拓扑

当前桌面端采用标准的 Electron 三层结构：

- `main`：负责窗口生命周期、IPC 注册、本地数据目录初始化、环境变量加载（`loadEnv()`），以及调用 `agent-core` 跑 turn。
- `preload`：负责向 renderer 暴露最小、安全、类型化的 bridge API。
- `renderer`：负责工作台界面渲染、会话列表展示、消息流展示和用户交互。

## 当前包分层与依赖边界

- `packages/desktop`
  - 可以依赖 `packages/shared`
  - 可以依赖 `packages/agent-core`
  - renderer 不能直接访问文件系统
- `packages/agent-core`
  - 可以依赖 `packages/shared`
  - 负责 provider、context、tools、persistence、execution loop
- `packages/shared`
  - 只放跨进程共享契约和类型
  - 不依赖 `desktop` 或 `agent-core`

默认依赖方向应保持为：

`desktop -> agent-core -> shared`

而不是反向耦合。

为保证 Electron 主进程编译输出稳定，`desktop` 不应直接相对引用 sibling package 的 `src/`，而应通过包名消费：

- `@actspace/shared`
- `@actspace/agent-core`

对应地，`shared` 和 `agent-core` 需要先构建出各自的 `dist/` 产物，再作为 `desktop` 的运行时依赖。

## 当前已落地的 Agent 运行层模块

`packages/agent-core` 已完成模块化重构，从单文件结构升级为以下子模块：

### 顶层类型与契约

- `messages.ts`：内部 Message/Content 类型体系（discriminated union），包含 Usage、StopReason、Context 等核心类型。
- `internal-tools.ts`：统一工具定义（InternalTool）与注册表（InternalToolRegistry），支持 definition + handler + permission 组合。
- `adapters.ts`：内部类型（Message）与 shared 契约（SessionEvent/MessageBlock）之间的双向转换。
- `fixtures.ts`：测试用 mock 数据工厂。
- `types.ts`：agent-core 内部辅助类型。

### `llm/` — LLM 服务层（stream-first）

- `llm/types.ts`：LLMConfig、StreamOptions、LLMService 接口、AssistantMessageEventStream、LLMServiceError。error 事件携带完整 `AssistantMessage`（含部分内容 + `stopReason` + `errorMessage`），而非 `Error` 对象。
- `llm/convert.ts`：共享的消息转换、工具转换、流式 chunk 处理和 SDK 错误映射逻辑。包含防御性消息处理（跳过 error/aborted 的 assistant messages、为孤儿 tool calls 插入 synthetic toolResult）。
- `llm/services/deepseek.ts`：DeepSeekService，使用 OpenAI SDK 直接流式调用 DeepSeek chat completions，具体实现 stream/complete/streamSimple/completeSimple 四个方法。通过 `convert.ts` 共享转换和流处理逻辑。
- `llm/services/kimi.ts`：KimiService，使用 OpenAI SDK 直接流式调用 Kimi chat completions，支持 `builtin_function.$web_search`，并提供 `streamWithBuiltinWebSearch` / `streamMessages` / `completeMessages` 辅助方法。通过 `convert.ts` 共享转换和流处理逻辑。
- `llm/services/mock.ts`：MockLLMService，支持 response queue 模式（通过 `setResponses`/`appendResponses` 预设响应序列）和默认行为模式（向后兼容）。提供 `mockText`、`mockToolCall`、`mockError` 辅助工厂函数。
- `llm/kimi-assistants.ts`：DeepSeek 专用的 Kimi 辅助调用层，包含 `searchWithKimi`、`fetchAndSummarizeWithKimi`、`analyzeMediaWithKimi` 三个函数；系统提示词统一从 `prompt/kimi-assistants/` 引用。
- `llm/factory.ts`：createLLMService 工厂函数。

### `prompt/` — 提示词集中管理

- `prompt/main-agent.ts`：桌面端默认主 Agent 系统提示词，供 `SystemPromptContext` 初始化使用。
- `prompt/kimi-assistants/`：Kimi 辅助能力使用的系统提示词，包括 `web_search`、`web_fetch`、`analyze_media`。
- 提示词文件顶部应写明使用位置、影响范围和维护边界；动态上下文、工具协议、密钥和运行时配置不应硬编码进提示词。

### `tools/` — 模块化工具系统

- `tools/types.ts`：ToolDefinitionSpec、ToolExecutorFn、ToolManagerConfig；工具定义可用 `exposeOnlyTo?: "deepseek" | "kimi"` 做轻量暴露筛选，缺省表示两个主模型都可见。
- `tools/workspace-guard.ts`：路径边界守卫，防止工具访问工作区外文件。
- `tools/manager.ts`：ToolManager（注册/获取/导出工具定义），执行入口委托给 ToolScheduler。
- `tools/scheduler.ts`：ToolScheduler（权限三态决策、工具状态记录、执行、结果渲染与裁剪）。当前 `ask` 会返回结构化待审核结果，approve/deny IPC 和恢复流程由后续计划接入。
- `tools/tools/{read-file,search-files,list-directory,edit-file-diff,bash}/`：每个工具一个目录，含 `definition.ts` + `executor.ts`；Bash 额外包含 `permissions.ts` 和 `render-result.ts`。
- `tools/tools/{web-search,web-fetch,analyze-media}/`：DeepSeek-only Kimi 辅助工具；只有 DeepSeek 为主模型且配置 Kimi key 时注册。

### `context/` — 上下文管道

- `context/types.ts`：SystemPart、ContextModule、PromptSegment、CompressionConfig。
- `context/token-estimator.ts`：token 估算与用量快照生成。
- `context/modules/system-prompt.ts`：分段系统提示词上下文。
- `context/modules/conversation.ts`：会话历史上下文管理。
- `context/manager.ts`：ContextManager 编排器（模块协调、appendMessage、getContext、用量统计）。

### `engine/` — 执行引擎

- `engine/types.ts`：AgentEvent（discriminated union）、AgentLoopConfig、AgentLoopResult。
- `engine/loop.ts`：runAgentLoop 纯函数双层循环（内层工具调用+转向、外层跟进）。
- `engine/agent.ts`：Agent 入口类（run/abort），编排 ContextManager + ToolManager + LLMService。
- `engine/bridge.ts`：IPC 桥接层，将 AgentEvent 实时映射为 RuntimeStreamEvent，并将执行结果聚合为 AgentTurnResult。

### `persistence/` — 持久化与恢复

- `persistence/types.ts`：SessionStorePaths、JsonlParseResult、WriteResult、SessionRecoveryResult。
- `persistence/jsonl.ts`：健壮 JSONL 读写（坏行容错 + 结构化错误传播）。
- `persistence/meta.ts`：meta.json 增量更新（turnCount/updatedAt/lastModel）。
- `persistence/recovery.ts`：多维恢复（events→Messages/Blocks/Snapshot/DiffSummary）。
- `persistence/session-store.ts`：会话存储生命周期（create/ensure/write/read/list）。

### `observability/` — 本地运行排障日志

- `observability/agent-run-log.ts`：每次 Agent turn 一个 JSONL 文件，记录从用户输入、main 边界、AgentEvent、RuntimeStreamEvent 到最终结果的完整链路，并清理超过 24 小时的 run 日志。

### 环境变量管理

- `env.ts`：集中式环境变量管理模块。自带轻量 `.env` 文件解析器（无第三方依赖），按 Schema 驱动验证、解析、冻结。
  - `loadEnv()`：应用启动时调用，自动探测并加载 `.env` 文件，合并到 `process.env`（不覆盖已有值）。
  - `env` proxy：类型安全的只读对象，任意文件 `import { env }` 后直接访问 `env.DEEPSEEK_API_KEY` 等。
  - `envToLLMConfig()`：从 env 生成 `LLMConfig`，供测试和显式 mock 场景使用；Electron 真实 turn 由 main 进程按 UI/配置选择 `deepseek|kimi`，不静默降级 mock。
  - `EnvValidationError`：缺失必填项或值不合法时抛出，携带所有问题列表。

项目根目录的 `.env.example` 列出全部可配置项和默认值，`.env` 已被 `.gitignore` 忽略。

### 兼容层

原有单文件入口（`agent.ts`、`llm.ts`、`tools.ts`、`context.ts`、`persistence.ts`）保留为兼容层，内部 re-export 新模块的 API，确保 `desktop` 等现有消费方不被破坏。

## 本地存储模型

当前首版本地存储采用会话目录模型：

- 每个会话一个目录
- `meta.json`：会话摘要、标题、更新时间、turn 计数
- `session.jsonl`：会话事件流持久化文件
- `attachments/`：附件目录

当前应用启动时会初始化应用数据目录：

- `sessions/`
- `tmp/`

同时，开发排障日志会写入仓库根目录 `logs/`。其中 `logs/agent-runs/` 用于保存最近约 1 天的 Agent turn 运行链路 JSONL。它不同于 `session.jsonl`：

- `session.jsonl` 是会话恢复事实来源，保存稳定的 SessionEvent。
- 每轮真实 turn 的 `SessionEvent` 顺序以 `user_message -> thinking/tool_call/tool_result -> assistant_message -> context_snapshot` 为基线；即使后端内部 AgentLoopResult 不包含 user message，IPC bridge 也必须显式写入本轮用户输入事件。
- `logs/agent-runs/*.jsonl` 是本地排障文件，允许包含完整用户输入、完整工具参数、完整工具结果和最终 AgentTurnResult；模型流式文本会聚合为单条 `assistant_text` / `assistant_thinking` 事件，避免逐 delta 刷屏，同时仍保留 delta 数量和字符数，便于判断 Agent 执行、后端推送或前端渲染问题。
- 日志目录只保存在本机，不应提交到 Git；仓库根目录 `logs/` 已在 `.gitignore` 中忽略。

应用会在启动早期显式把 Electron `userData` 目录固定为产品名 `actspace`，因此安装后目录规则应稳定为：

- macOS：`~/Library/Application Support/actspace/`
- Windows：`%APPDATA%/actspace/`
- Linux：`~/.config/actspace/`

上述目录下再包含：

- `sessions/`
- `tmp/`

开发态 `logRoot` 默认指向仓库根目录 `logs/`，也可以通过 `ACTSPACE_REPO_ROOT` 显式指定仓库根。

Agent 文件工具的 `workspaceRoot` 与 Electron `userData` 分离：

- `userData` 只用于 session、附件、tmp 等应用数据。
- `workspaceRoot` 用于 `read_file`、`search_files`、`list_directory`、`edit_file_diff` 等文件工具。
- 首版解析顺序为 `ACTSPACE_WORKSPACE_ROOT` -> 当前仓库根目录。

## 当前 IPC 契约

当前已接通的 IPC 通道包括：

**请求-响应（invoke/handle）：**

- `app:get-bootstrap-state`
- `agent:run-turn`
- `session:create`
- `session:list`
- `session:get`

**单向推送（main → renderer）：**

- `agent:stream`：在 `agent:run-turn` 执行过程中，main 进程通过此通道实时推送 `RuntimeStreamEvent`（thinking delta、text delta、tool started/finished、turn started/finished/failed）。

这些契约统一由 `packages/shared` 暴露，作为 main、preload 和 renderer 之间的单一事实来源。

## 当前数据流

采用双通道模式（invoke 返回完整结果 + send 实时推送中间事件）：

1. renderer 启动后请求 bootstrap state
2. renderer 请求 `session:list`
3. 若存在旧会话，则请求 `session:get` 恢复
4. 用户点击 `New chat` 时，renderer 通过 `session:create` 创建空会话
5. main 在本地 session 目录生成 `meta.json`、空 `session.jsonl` 和 `attachments/`，并返回 `SessionRecord`
6. renderer 将新会话设为 active session，清空当前消息流，后续发送沿用新的 `sessionId`
7. 用户输入消息，renderer 通过 `agent:run-turn` 发起请求
8. main 调用 `runTurnWithAgent()`，内部使用新 Agent 引擎（Agent.run）
9. main 在仓库根目录 `logs/agent-runs/` 创建本次 turn 的 JSONL 排障文件，并清理超过 24 小时的旧 run 日志
10. 执行过程中，`AgentEvent` 实时通过 `engine/bridge.ts` 映射为 `RuntimeStreamEvent`，经 `agent:stream` 推送到 renderer；本次 run JSONL 记录关键生命周期和工具事件，并将流式文本聚合成单条可读事件
11. renderer 通过 `onAgentStream` 监听实时事件，动态更新 UI（thinking、text delta、tool 状态）
12. `agent:run-turn` 返回完整的 `AgentTurnResult`，结果落盘到本地 session 目录，并写入本次 run JSONL
13. renderer 用最终结果替换流式中间状态，完成一轮交互

## 当前已确认的实现方向

- 桌面端首版采用 `Electron + React + TypeScript + Vite`。
- 交互基础组件优先采用 `Radix UI` primitives，而不是直接依赖重样式组件库。
- 本地数据优先使用 `jsonl` 文件存储，直接落盘到用户电脑。
- 更细的产品级技术选型以根目录 `README.md` 中的“技术栈”小节为准。
- 工程骨架已开始落地为 `packages/desktop + packages/agent-core + packages/shared` 的单仓结构。
- 当前同时保留 `mock` 开发 provider 与 `deepseek`、`kimi` 两个真实流式 provider。桌面端主模型由前端模型选择器驱动，可选 `deepseek-v4-flash`（DeepSeek Chat）、`deepseek-v4-pro`（DeepSeek Reasoner，默认开启 thinking）、`kimi-k2.6`（Kimi K2.6）。模型注册表定义在 `packages/shared/src/ipc.ts` 的 `MODEL_REGISTRY`，前端发送具体 `ModelId`，main 进程根据注册表解析 provider、API model 和 thinking 行为。mock 仅用于测试、浏览器 fixture 或显式 demo，不允许静默替代 Electron 真实 turn。密钥不进入 renderer 或 session 事件。
- DeepSeek 作为主模型时，如果配置 `KIMI_API_KEY`，ToolManager 会额外注册 `web_search`、`web_fetch`、`analyze_media`；没有 Kimi key 时这些工具不暴露，本地文件工具仍正常可用。
- 环境变量统一通过 `agent-core/env.ts` 管理，项目根目录的 `.env` 文件在 main 进程启动时加载。`process.env` 已有值优先于 `.env` 文件（方便 CI / Docker 覆盖）。env 中的 `LLM_MODEL`、`KIMI_MODEL` 仅用于辅助工具（kimi-assistants）和 mock/测试 fallback，主模型选择已迁移到前端 `MODEL_REGISTRY` 驱动。
- 开发态启动需要先确保 `shared`、`agent-core` 有可消费产物，再启动 Electron main/preload 的 watch 与 renderer。
