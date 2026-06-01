# actspace 并行计划 1：前后端契约与 Mock Fixtures 重建

## 目标

建立一层稳定、类型化、可被前端和后端同时依赖的契约层，让 `renderer / main / agent-core / shared` 不再各自猜测数据结构。完成后，前端可以基于 fixtures 独立还原 UI，后端可以基于同一套事件协议独立重构运行时，双方不需要强顺序等待。

## 并行边界

本计划是三条并行线中的“接口地基”，但不要求其他计划等它完全完成才能启动。

- 前端计划可以先复制本计划定义的临时 fixture 结构到本地 mock，再在契约落地后切换到 `packages/shared`。
- 后端计划可以先实现 adapter 层，保证输出能映射到本计划定义的 `SessionEvent`。
- 本计划不负责做 UI 高保真，也不负责接真实 DeepSeek。

## 新会话启动必读

- `AGENTS.md`：仓库导航和工作规则。
- `docs/REPO_COLLAB_GUIDE.md`：协作、提交、测试约定。
- `docs/ARCHITECTURE.md`：当前 monorepo、Electron、包边界。
- `docs/FRONTEND_VERIFICATION.md`：前端 mock 与 Electron 验证边界。
- `docs/design-docs/front-index.md`：前端定稿图入口，理解 UI 消费哪些数据。
- `.agents/skills/llm-agent-dev/SKILL.md`：Agent 后端契约、上下文、工具和执行循环的设计原则。

## 相关代码路径

- `packages/shared/src/session.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/index.ts`
- `packages/agent-core/src/persistence.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/App.tsx`

## 当前问题

- `session.jsonl` 当前写入外层 `turn_result` 包装，但 `SessionEventType` 不包含 `turn_result`，导致 renderer 恢复旧会话时无法映射消息。
- `AgentTurnResult`、`SessionRecord`、`SessionEvent` 的边界混在一起：一次 turn 的返回结构和长期 session 事件流没有分清。
- 前端需要的消息块数据不够清晰，比如 `thinking` 展开内容、`read/search` 轻量文本、`edit diff` 文件名与修改统计、`context popup` 分类统计。
- IPC 当前只提供最小查询能力，缺少面向 UI 的稳定视图模型。
- `llm-agent-dev/examples/agent-loop.ts` 中的 `AgentEvent` 是后端内部生命周期事件，不应原样暴露给 renderer，否则未来后端 loop 调整会直接破坏 UI。

## 契约分层原则

本计划的核心不是把后端内部类型直接共享给前端，而是建立三层清晰边界。

### 1. Runtime Internal Types

后端内部使用，参考 `.agents/skills/llm-agent-dev/examples/agent-loop.ts`。

典型类型：

- `Message`
- `AssistantMessage`
- `ToolResultMessage`
- `AgentEvent`
- `AssistantMessageEvent`
- `Usage`
- `ToolExecuteResult`

这些类型服务 Agent loop、工具调度、流式响应、steering、follow-up、sub-agent 等运行时机制。它们可以变化，不作为 renderer 的稳定依赖。

### 2. Persisted Session Events

写入 `session.jsonl` 的稳定事件流，是前后端共享的核心协议。

要求：

- 每行只写一个可恢复事件。
- 事件必须可版本化。
- 事件必须能从旧格式迁移或兼容读取。
- 事件表达“发生了什么”，而不是暴露后端内部循环怎么实现。

### 3. UI View Models

renderer 组件优先消费的视图模型。

典型类型：

- `MessageBlock[]`
- `ContextUsageSnapshot`
- `SessionDiffSummary`
- `ComposerAttachment`
- `RightPanelTab`

这些类型从 `SessionEvent[]` 派生，专门服务 UI 渲染。前端不应该直接理解工具调度器、LLM provider、内部 stream event。

### 数据流方向

```txt
Agent Runtime Internal Events
  -> runtime adapter
  -> Persisted SessionEvent
  -> session selector / UI mapper
  -> UI ViewModel
  -> renderer components
```

### 决策

- 不把 `AgentEvent` 直接写入 `session.jsonl`。
- 不让 renderer 直接消费 `AgentEvent`。
- 可以为流式 UI 单独定义 `RuntimeStreamEvent`，但它只用于临时传输，不作为长期持久化格式。
- 长期恢复只依赖 `SessionEvent`。

## 范围

包含：

- 重新定义首版 `SessionEvent` 事件流格式。
- 明确 `session.jsonl` 每行必须是一条可恢复的事件，而不是不可识别的包装对象。
- 定义前端可直接消费的 `MessageBlock` 或等价 view model。
- 定义 `ContextUsageSnapshot` 的 UI 字段，包括分类 buckets、总 token、最大 token、压缩次数、累计消耗。
- 定义 `SessionDiffSummary`，供右侧会话级 diff 或中间 diff 卡片使用。
- 定义 `RuntimeStreamEvent` 的首版边界，用于未来流式 UI，但不进入长期 jsonl。
- 定义 runtime adapter，把 `llm-agent-dev` 风格的内部 `AgentEvent` 映射成稳定 `SessionEvent`。
- 定义 mock fixtures，覆盖用户消息、助手回复、Thinking、Read、Search、Edit diff、Context popup。
- 修复恢复旧 session 时消息为空的问题。

不包含：

- 不做高保真 CSS。
- 不接真实 DeepSeek。
- 不实现复杂工具执行。
- 不做数据库或云同步。
- 不做多窗口同步。

## 建议契约草案

### RuntimeStreamEvent

`RuntimeStreamEvent` 只用于一次正在运行的 turn 的临时 UI 更新，不作为长期存储格式。

```ts
type RuntimeStreamEvent =
  | { type: "turn_started"; sessionId: string; turnId: string }
  | { type: "assistant_text_delta"; messageId: string; delta: string }
  | { type: "assistant_thinking_delta"; messageId: string; delta: string }
  | { type: "tool_started"; toolCallId: string; toolName: string; argsPreview: string }
  | { type: "tool_finished"; toolCallId: string; toolName: string; resultEventId: string; isError: boolean }
  | { type: "turn_finished"; sessionId: string; turnId: string; resultEventIds: string[] }
  | { type: "turn_failed"; sessionId: string; turnId: string; error: SessionError };
```

约束：

- 可以由后端内部 `AgentEvent` 映射而来。
- 不写入 `session.jsonl`。
- renderer 用它做临时 loading、增量文本和工具执行状态。
- turn 完成后，以 `SessionEvent[]` 作为最终权威数据。

### SessionEvent

`session.jsonl` 每行写入一个事件：

```ts
type SessionEvent =
  | UserMessageEvent
  | AssistantMessageEvent
  | ThinkingEvent
  | ToolCallEvent
  | ToolResultEvent
  | DiffPreviewEvent
  | ContextSnapshotEvent
  | ErrorEvent;
```

所有事件必须包含：

```ts
type BaseSessionEvent = {
  id: string;
  sessionId: string;
  turnId: string;
  type: string;
  timestamp: string;
  schemaVersion: 1;
};
```

建议事件类型：

```ts
type SessionEventType =
  | "user_message"
  | "assistant_message"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "diff_preview"
  | "context_snapshot"
  | "error";
```

说明：

- `assistant_message` 作为 UI 与持久化事件名，避免和 provider 内部 `AssistantMessage` 混淆。
- `tool_call` 表示模型请求使用工具。
- `tool_result` 表示工具执行结果，必须包含裁剪后的 UI 预览。
- `diff_preview` 用于明确表达文件级 diff，可从 `edit_file_diff` 的 `tool_result` 派生。
- `context_snapshot` 可在 turn 结束后写入，也可在压缩后写入。
- `error` 用于 provider、tool、persistence 等可展示错误。

### MessageBlock

前端消息区优先消费 `MessageBlock[]`：

```ts
type MessageBlock =
  | { kind: "user"; id: string; content: string; createdAt: string }
  | { kind: "assistant"; id: string; content: string; createdAt: string }
  | { kind: "thinking"; id: string; title: string; content: string; collapsedByDefault: true }
  | { kind: "read"; id: string; filePath: string; range?: string; displayText: string }
  | { kind: "search"; id: string; query: string; scope?: string; displayText: string }
  | { kind: "edit_diff"; id: string; filePath: string; additions: number; deletions: number; diff: string; collapsedLines: number };
```

约束：

- `MessageBlock` 不写入 jsonl，可由 `SessionEvent[]` 重建。
- `MessageBlock` 是 UI 语法，不是 Agent runtime 语法。
- 中间消息区组件只接收 `MessageBlock`，不要直接接收 raw `ToolExecutionResult`。

### ContextUsageSnapshot

```ts
type ContextUsageSnapshot = {
  totalTokens: number;
  maxTokens: number;
  percentUsed: number;
  compressionCount: number;
  cumulativeTokens: number;
  buckets: Array<{
    key: "systemPrompt" | "tools" | "rules" | "skills" | "mcp" | "subagents" | "conversation";
    label: string;
    tokens: number;
    colorToken: string;
  }>;
};
```

### ToolExecutionResult

后端工具结果需要同时服务模型上下文、UI 预览和调试排障，因此必须拆清 raw 与 preview。

```ts
type ToolExecutionResult = {
  toolCallId: string;
  toolName: string;
  ok: boolean;
  summary: string;
  rawOutputRef?: {
    kind: "inline" | "file";
    value: string;
  };
  modelOutput: string;
  uiPreview: ToolUiPreview;
  artifacts: ToolArtifact[];
  error?: SessionError;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  tokenEstimate: number;
};
```

约束：

- `rawOutputRef` 不一定给前端完整展示。
- `modelOutput` 是裁剪后回填给 LLM 的文本。
- `uiPreview` 是前端消息组件使用的数据。
- 工具错误必须结构化，避免后端只返回字符串。

### ToolUiPreview

```ts
type ToolUiPreview =
  | { kind: "read"; filePath: string; range?: string; displayText: string }
  | { kind: "search"; query: string; scope?: string; resultCount?: number; displayText: string }
  | { kind: "edit_diff"; filePath: string; additions: number; deletions: number; diff: string; collapsedLines: number }
  | { kind: "generic"; title: string; content: string };
```

### SessionDiffSummary

```ts
type SessionDiffSummary = {
  sessionId: string;
  files: Array<{
    filePath: string;
    additions: number;
    deletions: number;
    diff: string;
    sourceEventIds: string[];
  }>;
  totalAdditions: number;
  totalDeletions: number;
};
```

### SessionError

```ts
type SessionError = {
  code: string;
  message: string;
  recoverable: boolean;
  details?: string;
};
```

## 实施步骤

1. 先在文档中确认三层契约：Runtime Internal Types、Persisted Session Events、UI View Models。（已完成）
2. 对齐 `packages/shared` 类型：拆清 `SessionEvent`、`RuntimeStreamEvent`、`AgentTurnResult`、`SessionRecord`、`MessageBlock`、`ContextUsageSnapshot`。（已完成）
3. 增加 runtime adapter：把后端内部 `AgentEvent / Message / ToolExecuteResult` 映射成 `SessionEvent / RuntimeStreamEvent`。（部分完成：先落地 jsonl normalize 与 UI selector，完整 runtime adapter 留给后端重建计划）
4. 修复持久化：`writeSessionResult` 不再写不可识别的 `turn_result`，而是逐条追加 `result.events`。（已完成）
5. 增加恢复适配：如果本地已有旧 `turn_result` 记录，读取时临时展开 `payload.events`，避免开发机旧数据导致空白。（已完成）
6. 增加 UI selector：从 `SessionEvent[]` 生成 `MessageBlock[]`、`SessionDiffSummary`、最新 `ContextUsageSnapshot`。（已完成）
7. 增加 fixture 文件：建议放在 `packages/shared/src/fixtures.ts` 或 `packages/desktop/src/renderer/fixtures/`，供前端和测试使用。（待前端高保真计划执行时补齐）
8. 调整 IPC：明确 `session:list`、`session:get`、`agent:run-turn` 返回结构，避免 renderer 直接理解底层 jsonl 细节。（部分完成：`SessionRecord` 增加 view model 字段预留，main 暂仍返回 events）
9. 更新文档：在 `docs/ARCHITECTURE.md` 或 `docs/FRONTEND.md` 中补充契约入口。（待后续文档同步）

## 验收方式

命令：

- `pnpm typecheck`
- `pnpm build`

手工检查：

- 删除或保留旧本地 session，应用启动后中间消息区都不能空白。
- `session.jsonl` 每行都是可识别事件。
- 前端能基于 fixture 渲染完整消息序列。

数据检查：

- `session.jsonl` 至少包含 `user_message / thinking / tool_call / tool_result / assistant_message / context_snapshot`。
- 旧格式 `turn_result` 如存在，读取时能展开，不再让 UI 消息流为空。
- `RuntimeStreamEvent` 不写入 `session.jsonl`。
- `MessageBlock[]` 能完全从 `SessionEvent[]` 重建。

## 与其他计划的接口

- 输出给前端计划：`MessageBlock[]`、`ContextUsageSnapshot`、mock fixtures。
- 输出给后端计划：`SessionEvent`、`ToolExecutionResult`、`AgentTurnResult` 标准结构。
- 输入自后端计划：`llm-agent-dev` 风格的内部 `AgentEvent`，但必须通过 adapter 转换。
- 只要 fixture 字段稳定，前端可以先并行还原，不必等真实 runtime 完成。

## 风险

- 风险：过早把契约设计得太复杂，拖慢前端还原。
- 缓解：只覆盖 V1 基础版当前 UI 需要的字段，后续扩展用 optional 字段。

- 风险：旧 jsonl 与新 jsonl 混用导致读取异常。
- 缓解：读取层做兼容展开，写入层只写新格式。

## 进度记录

- [x] 确认事件流与 view model 草案。
- [x] 确认 Runtime Internal Types 不直接暴露给 renderer。
- [x] 修改 `packages/shared` 类型。
- [x] 增加 runtime adapter 和 UI selector。（已完成 normalize/selector，完整 runtime adapter 待后端重建计划）
- [x] 修复 jsonl 写入与读取兼容。
- [x] 增加 mock fixtures。（`packages/desktop/src/renderer/fixtures/workbenchFixture.ts` 已提供浏览器 mock UI 所需的 session、message blocks、context snapshot 和 turn result）
- [x] 调整 IPC 返回结构。（已预留 view model 字段，完整 IPC view model 可后续补）
- [x] 通过类型检查与构建。
- [x] 更新相关文档和 history。

## 决策记录

- 2026-05-22：三条并行计划采用 Contract First，但不强制 UI 和后端等待契约完全完成；通过 fixtures 和 adapter 降低协作阻塞。
- 2026-05-22：确认采用三层契约：后端内部 `AgentEvent` 不直接持久化、不直接给 renderer；长期恢复依赖 `SessionEvent`，前端渲染依赖 `MessageBlock` 等 UI ViewModel。
- 2026-05-22：首轮落地选择兼容式升级：保留旧 `assistant_reply` 读取能力，新写入使用 `assistant_message`；旧 `turn_result` 读取时展开，新写入逐条写 `SessionEvent`。
- 2026-05-22：契约与 fixture 首轮已完成，计划归档；真实后端 runtime 的进一步 adapter 细节交给 `actspace-parallel-agent-runtime-rebuild.md`。
