# 后端 Agent 设计文档

## 当前状态

本文档是 `actspace` 后端 Agent Runtime 的设计事实来源，用来约束后续多个 execution plan 的拆分与实现。

当前阶段不追求一次做完整产品，而是先把 V1 基础版后端做成稳定、可验证、可扩展的运行时骨架。具体实现计划应从本文档派生，避免多个会话并行时各自发明一套类型、事件和模块边界。

## 设计目标

`actspace` 的核心理念是让 DeepSeek 能获取更多上下文、做更多事情，同时让上下文的组成、消耗和压缩过程对用户可见、可控制。

后端 Agent 首版目标：

- 以 TypeScript 实现桌面端本地 Agent Runtime。
- DeepSeek 优先，但 provider 层必须保留扩展其他模型的接口。
- 使用本地 `jsonl` 事件流保存会话，保证刷新和重启后可恢复。
- 通过工具系统获得文件读取、搜索、目录浏览和 diff 预览能力。
- 工具输出必须裁剪后回填上下文，避免上下文膨胀。
- 前端只消费 shared 契约和 IPC 返回，不感知后端内部实现细节。

## 架构原则

- **单智能体优先**：V1 先做好一个强单体 Agent，只有当只读探索需要并行或工具集过载时，再考虑子 Agent。
- **事件驱动**：Agent 内部生命周期通过事件 emit 暴露，事件再映射到 `SessionEvent` 和前端消息组件。
- **stream-first**：LLM Service 以流式接口为主，非流式结果可以由流式结果聚合得到。
- **上下文工程优先**：后端不是简单转发聊天请求，而是构建、裁剪、统计和解释上下文。
- **工具安全默认保守**：读取可以先做，编辑首版只生成 reviewable diff，不自动写盘。
- **契约先行**：`packages/shared` 是 renderer、main、agent-core 的唯一共享契约来源。
- **可观测优先**：每一轮 turn 都应能从事件流看出模型、上下文、工具、错误和最终回复。

## 目标模块

后端运行时由五个核心模块组成：

```txt
LLM Service
  -> provider registry
  -> DeepSeek provider
  -> mock provider
  -> stream / complete 聚合

Context Pipeline
  -> system prompt
  -> session history
  -> tool definitions
  -> attachments summary
  -> tool result feedback
  -> token usage snapshot

Tool Runtime
  -> tool definition
  -> input validation
  -> scheduler
  -> output truncator
  -> safe artifact result

Execution Engine
  -> runAgentLoop
  -> tool-call loop
  -> event emit
  -> abort / safety stop

Session Persistence
  -> session.jsonl
  -> meta.json
  -> attachments/
  -> recovery adapter
```

推荐落地目录：

```txt
packages/agent-core/src/
  runtime/
    createAgentRuntime.ts
    executionEngine.ts
    runtimeEvents.ts
  llm/
    modelProvider.ts
    baseLLMService.ts
    deepseekProvider.ts
    mockProvider.ts
    providerRegistry.ts
  context/
    contextPipeline.ts
    contextTypes.ts
    tokenEstimator.ts
    outputTruncator.ts
    contextUsage.ts
  tools/
    toolDefinition.ts
    toolRegistry.ts
    toolScheduler.ts
    readFileTool.ts
    searchFilesTool.ts
    listDirectoryTool.ts
    editFileDiffTool.ts
  persistence/
    sessionStore.ts
    jsonl.ts
    recovery.ts
```

实际迁移可以渐进完成，但最终职责边界应接近上面结构。

## 运行循环

V1 采用 `llm-agent-dev` skill 中推荐的纯函数执行循环。

核心流程：

1. renderer 通过 IPC 发起 `agent:run-turn`。
2. main 调用 `agent-core`，传入 session、turn、用户输入、附件和当前 workspace 边界。
3. Agent Runtime 追加 `user_message` 事件。
4. Context Pipeline 组装本轮输入上下文。
5. LLM Service 调用 provider，流式产出 thinking、文本和 tool calls。
6. Execution Engine 将模型生命周期转换成 runtime events。
7. 如出现 tool calls，Tool Scheduler 校验、执行、裁剪输出。
8. 工具结果进入 `tool_result`，裁剪后的 `modelOutput` 回填上下文。
9. Execution Engine 再次调用模型，直到模型停止调用工具并给出最终回复。
10. 追加 `assistant_message` 和 `context_snapshot`。
11. Session Persistence 写入 `session.jsonl` 和 `meta.json`。
12. main 返回 `AgentTurnResult` 给 renderer。

执行循环应支持：

- `AbortSignal` 取消。
- 最大 turn 安全阀。
- provider 错误转为结构化 error 事件。
- 工具失败转为 recoverable tool result，不让整个进程崩溃。
- 流式事件与最终持久化事件分离。

## 事件模型

后端至少维护两层事件：

- `RuntimeEvent`：运行时短生命周期事件，用于流式 UI、日志和调试。
- `SessionEvent`：可持久化事件，写入 `session.jsonl`，用于恢复会话和前端重建消息流。

`SessionEvent` 首版至少覆盖：

- `user_message`
- `thinking`
- `tool_call`
- `tool_result`
- `diff_preview`
- `assistant_message`
- `context_snapshot`
- `error`

事件设计要求：

- 每行 `jsonl` 是一个完整事件。
- 所有事件带 `sessionId`、`turnId`、`timestamp`、`schemaVersion`。
- 工具的原始输出和模型回填输出要区分。
- 前端消息组件不能依赖 provider 私有结构。
- 可恢复性优先于渲染便利性，渲染可以由 adapter 派生。

## LLM Service

LLM Service 负责屏蔽 provider 差异，对 Execution Engine 提供一致接口。

首版 provider：

- `deepseek`：真实 provider 目标，优先兼容 OpenAI 风格接口。
- `deepseek-mock`：本地开发和测试 provider，必须能稳定产出 thinking、tool calls 和 final reply。

核心接口方向：

```ts
type ModelProvider = {
  id: string;
  label: string;
  stream(input: ModelProviderInput): AsyncIterable<ModelProviderEvent>;
  complete(input: ModelProviderInput): Promise<ModelProviderOutput>;
};
```

LLM Service 还应负责：

- API key 和 base URL 解析。
- provider 错误分类。
- usage 聚合。
- tool call 格式转换。
- provider 私有字段到内部 message content 的映射。

真实 DeepSeek HTTP 接入不阻塞运行时重构，但 provider 抽象必须提前按真实接入设计。

## Context Pipeline

Context Pipeline 的职责是整理 LLM 本轮可见内容，而不是简单堆消息。

首版上下文来源：

- 系统提示词和产品行为约束。
- 当前会话历史。
- 用户输入和附件摘要。
- 工具定义。
- 最近工具结果的裁剪输出。
- 必要的 workspace 和文件路径上下文。

Context Pipeline 输出：

- provider 可消费的 messages。
- provider 可消费的 tool definitions。
- `ContextUsageSnapshot`。
- 用于 Context popup 的 buckets。

Context buckets 首版沿用前端需要的分类：

- `systemPrompt`
- `tools`
- `rules`
- `skills`
- `mcp`
- `subagents`
- `conversation`

首版不做高级自动压缩，但必须预留：

- `compressionCount`
- `cumulativeTokens`
- token threshold 判断入口
- 输出裁剪前后的 token 估算

## Tool Runtime

工具采用 `definition + executor` 分离模式。

首版工具范围：

- `read_file`：读取 workspace 内文件，返回轻量预览和可裁剪模型输出。
- `grep`：正则搜索 workspace 内文件内容（优先 ripgrep）。
- `glob`：按文件名模式查找文件，按修改时间排序。
- `list_directory`：列出目录，支持最小文件导航。
- `edit-file`：生成 diff preview，不自动写盘。

工具结果统一为 `ToolExecutionResult`：

- `toolName`
- `ok`
- `summary`
- `rawOutput`
- `truncatedOutput`
- `rawOutputRef`
- `modelOutput`
- `uiPreview`
- `artifacts`
- `error`
- `durationMs`
- `tokenEstimate`

工具安全边界：

- renderer 不直接访问文件系统。
- 所有路径必须经过 workspace 边界检查。
- 文件不存在、权限不足、输入非法都返回结构化错误。
- 工具错误要精确，避免污染下一轮模型判断。
- `edit-file` 默认只产物化 diff，不应用 patch。

## Session Persistence

本地存储采用会话目录：

```txt
~/Library/Application Support/actspace/
  sessions/
    <session-id>/
      meta.json
      session.jsonl
      attachments/
  logs/
  tmp/
```

`session.jsonl` 是会话事实来源。

`meta.json` 保存轻量摘要：

- `id`
- `title`
- `createdAt`
- `updatedAt`
- `turnCount`
- 可选 `lastModel`
- 可选 `lastError`

写入要求：

- 事件追加写入。
- 单个事件写入失败要可被 main 捕获。
- 恢复时允许跳过无法解析的坏行，但必须记录错误。
- 恢复后的消息流应通过 shared adapter 生成。

## IPC 与前端边界

renderer 只能通过 preload 暴露的最小 API 调用后端。

首版 IPC 职责：

- `app:get-bootstrap-state`：返回数据目录、版本、默认 provider。
- `session:list`：列出会话摘要。
- `session:get`：读取并恢复会话事件。
- `agent:run-turn`：运行一轮 Agent。

后续可以增加流式 IPC，但不应破坏现有最终结果返回结构。

前端依赖：

- `AgentTurnResult`
- `SessionEvent`
- `MessageBlock`
- `ContextUsageSnapshot`
- `SessionDiffSummary`

前端不依赖：

- provider 原始响应。
- 文件系统 API。
- agent-core 内部 Context 类型。

## 并行计划拆分

为了支持多个会话并行推进，后端实现建议拆成这些计划。

### 计划 A：全局数据契约与事件模型

目标：

- 稳定 `packages/shared` 中的 `SessionEvent`、`RuntimeStreamEvent`、`ToolExecutionResult`、`ContextUsageSnapshot`、`AgentTurnResult`。
- 定义 runtime event 到 session event 的 adapter。
- 增加 mock fixtures，覆盖 thinking、read/search、edit-file、context snapshot、error。

可并行性：

- 应先于其他计划完成或至少先确认接口草案。
- 其他计划只依赖 shared 契约，不直接依赖彼此内部实现。

### 计划 B：LLM Service 与 DeepSeek Provider

目标：

- 建立 stream-first 的 LLM Service。
- 实现 provider registry。
- 保留稳定 mock provider。
- 增加 DeepSeek provider 骨架和真实接入配置位。

可并行性：

- 可与 Tool Runtime、Context Pipeline 并行。
- 依赖计划 A 的 provider 输入输出类型。

### 计划 C：Tool Runtime 与真实文件工具

目标：

- 建立 tool definition、registry、scheduler、output truncator。
- 实现 `read_file`、`grep`、`glob`、`list_directory`、`edit-file`。
- 增加路径边界、输入校验和结构化错误。

可并行性：

- 可与 LLM Service 并行。
- 依赖计划 A 的 `ToolExecutionResult`。

### 计划 D：Context Pipeline

目标：

- 组装系统提示词、会话历史、工具定义、附件摘要、工具结果。
- 生成 Context popup 需要的 usage buckets。
- 建立 token estimator 和压缩预留入口。

可并行性：

- 可与 Tool Runtime 并行。
- 需要计划 A 的 context snapshot 契约。

### 计划 E：Execution Engine

目标：

- 实现纯函数 `runAgentLoop`。
- 支持 tool-call loop、runtime event emit、AbortSignal、安全阀。
- 将 LLM、Context Pipeline、Tool Scheduler 串起来。

可并行性：

- 最好在 B、C、D 的接口稳定后开始。
- 可先用 mock adapter 并行开发。

### 计划 F：Persistence 与 Recovery

目标：

- 稳定 `session.jsonl` 写入和恢复。
- 完善 `meta.json`。
- 支持坏行容错、写盘失败传播、恢复为前端消息流。

可并行性：

- 可与 B/C/D 并行。
- 依赖计划 A 的持久化事件格式。

## 首版验收

最小可用后端验收：

- `pnpm typecheck` 通过。
- `pnpm build` 通过。
- mock provider 能跑完整 turn。
- 完整 turn 至少包含 `thinking + read_file + grep/glob 或 list_directory + edit-file + assistant_message + context_snapshot`。
- `session.jsonl` 能恢复完整消息流。
- 工具输出进入上下文前被裁剪。
- Context popup 可显示 token 总量、累计 token、压缩次数和 buckets。
- 文件不存在时返回结构化工具错误。
- provider 异常时返回 failed turn 或 error event。
- renderer 不直接访问文件系统。

## 暂不做

V1 基础版暂不做：

- 长期记忆。
- 子 Agent 编排。
- 完整 MCP runtime。
- 自动压缩高级策略。
- 云同步。
- 未授权的真实文件写入。
- 多 provider 的完整 UI 管理。

这些不是否定，而是为了让首版后端先稳稳落地。

## 参考

- `.agents/skills/llm-agent-dev/SKILL.md`
- `.agents/skills/llm-agent-dev/references/architecture.md`
- `.agents/skills/llm-agent-dev/references/context/overview.md`
- `.agents/skills/llm-agent-dev/references/tools/overview.md`
- `.agents/skills/llm-agent-dev/references/llm/llm-service.md`
- `.agents/skills/llm-agent-dev/references/agent-runtime/agent-patterns.md`
- `docs/design-docs/frontend-ui/中间消息区规范.md`
- `docs/ARCHITECTURE.md`
