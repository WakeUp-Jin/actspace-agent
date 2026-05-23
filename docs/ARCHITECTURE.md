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

- `llm/types.ts`：LLMConfig、StreamOptions、APIMessage、LLMServiceError。
- `llm/base.ts`：BaseLLMService 抽象基类，stream 为核心方法，complete 由 stream 聚合。
- `llm/services/mock.ts`：MockLLMService，模拟完整 turn 事件流（含工具调用）。
- `llm/services/deepseek.ts`：DeepSeekService 真实流式 provider，使用 OpenAI 兼容的 `/chat/completions` SSE 接口，映射文本、思考、工具调用和 token usage。
- `llm/factory.ts`：createLLMService 工厂函数。

### `tools/` — 模块化工具系统

- `tools/types.ts`：ToolDefinitionSpec、ToolExecutorFn、ToolManagerConfig。
- `tools/workspace-guard.ts`：路径边界守卫，防止工具访问工作区外文件。
- `tools/manager.ts`：ToolManager（注册/获取/执行/结果裁剪）。
- `tools/tools/{read-file,search-files,list-directory,edit-file-diff}/`：每个工具一个目录，含 `definition.ts` + `executor.ts`。

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

### 环境变量管理

- `env.ts`：集中式环境变量管理模块。自带轻量 `.env` 文件解析器（无第三方依赖），按 Schema 驱动验证、解析、冻结。
  - `loadEnv()`：应用启动时调用，自动探测并加载 `.env` 文件，合并到 `process.env`（不覆盖已有值）。
  - `env` proxy：类型安全的只读对象，任意文件 `import { env }` 后直接访问 `env.DEEPSEEK_API_KEY` 等。
  - `envToLLMConfig()`：从 env 生成 `LLMConfig`，`MOCK_MODE=true` 时自动切换到 mock provider。
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

当前应用启动时会初始化：

- `sessions/`
- `logs/`
- `tmp/`

应用会在启动早期显式把 Electron `userData` 目录固定为产品名 `actspace`，因此安装后目录规则应稳定为：

- macOS：`~/Library/Application Support/actspace/`
- Windows：`%APPDATA%/actspace/`
- Linux：`~/.config/actspace/`

上述目录下再包含：

- `sessions/`
- `logs/`
- `tmp/`

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
9. 执行过程中，`AgentEvent` 实时通过 `engine/bridge.ts` 映射为 `RuntimeStreamEvent`，经 `agent:stream` 推送到 renderer
10. renderer 通过 `onAgentStream` 监听实时事件，动态更新 UI（thinking、text delta、tool 状态）
11. `agent:run-turn` 返回完整的 `AgentTurnResult`，结果落盘到本地 session 目录
12. renderer 用最终结果替换流式中间状态，完成一轮交互

## 当前已确认的实现方向

- 桌面端首版采用 `Electron + React + TypeScript + Vite`。
- 交互基础组件优先采用 `Radix UI` primitives，而不是直接依赖重样式组件库。
- 本地数据优先使用 `jsonl` 文件存储，直接落盘到用户电脑。
- 更细的产品级技术选型以根目录 `README.md` 中的“技术栈”小节为准。
- 工程骨架已开始落地为 `packages/desktop + packages/agent-core + packages/shared` 的单仓结构。
- 当前同时保留 `mock` 开发 provider 与 `deepseek` 真实流式 provider；真实调用通过本地环境变量显式选择，密钥不进入 renderer 或 session 事件。
- 环境变量统一通过 `agent-core/env.ts` 管理，项目根目录的 `.env` 文件在 main 进程启动时加载。`process.env` 已有值优先于 `.env` 文件（方便 CI / Docker 覆盖）。
- 开发态启动需要先确保 `shared`、`agent-core` 有可消费产物，再启动 Electron main/preload 的 watch 与 renderer。
