## [2026-07-05 22:30] | Task: LLM 错误自动重试与失败轮次 error 事件兜底

### 🤖 Execution Context

- **Agent ID**: Cursor Agent
- **Base Model**: Fable 5
- **Runtime**: Cursor IDE (macOS)

### 📥 User Query

> LLM 网关偶发错误（如 DSML leak 转成的可重试 server_error）时：1) `LLMServiceError` 带的 `retryable` 标记落到 `AssistantMessage` 就丢了，loop 看到 `stopReason === "error"` 直接 return，没有重试入口；2) 失败轮次落库的是 `content: ""` 的空 `assistant_message`，UI 渲染成空白气泡，已定义的 `error` SessionEvent 链路从来没人投料。按三层设计打通：错误元数据 → loop 自动重试 → error 事件兜底。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`、`packages/shared`、`packages/desktop`

**Key Actions:**

- **错误元数据打通**: `AssistantMessage` 新增 `errorKind` / `errorRetryable`；`buildErrorMessage`（OpenAI 系）与 `buildAnthropicErrorMessage`（Anthropic 系）统一把 `LLMServiceError` 的 kind/retryable 写入（aborted 不写）。
- **loop 层自动重试**: `engine/loop.ts` 在 `stopReason === "error"` 且 `errorRetryable === true` 时自动重试，策略挂 `AgentLoopConfig.llmRetry`（默认 2 次重试，退避 1s → 3s，sleep 响应 AbortSignal）。重试前把 error message 从 `context.messages` pop 掉（防污染请求 + 保 prompt cache 前缀）；失败尝试的 usage 照常累进 `totalUsage` / `usageCalls`（计费审计）。新增 agent event `llm_retry { attempt, maxAttempts, reason }`。`Agent` / `RunTurnWithAgentDeps` 透传 `llmRetry`。
- **error 事件兜底**: `engine/bridge.ts` 的 `buildSessionEvents` 在最终消息 `stopReason === "error"` 时落一条 `error` SessionEvent（code 由 errorKind 派生如 `LLM_SERVER_ERROR`，recoverable: true）；`adapters.ts` 不再为失败回复落 `content: ""` 的空 `assistant_message`；被重试掉的中间失败尝试只留 `llm_usage` 不留内容事件。`AgentTurnResult.error.code` 同样按 errorKind 派生。
- **前端呈现**: shared `RuntimeStreamEvent` 新增 `llm_retry`；bridge 桥接并写 run log；renderer `App.tsx` 收到后清掉半截 thinking/text streaming 段（已完成的工具块保留）、显示「网关异常，正在重试 (n/m)」status 块，新 delta 到达时自动清除提示。error SessionEvent 的渲染复用 `session-selectors.ts` 已有的 `kind: "error"` 分支，前端零改动。
- **测试**: loop 三个新用例（重试成功且 pop 脏消息 / 重试耗尽 / 不可重试不重试）；bridge 两个新用例（失败轮次落 error 事件不落空 assistant_message / 重试成功流 llm_retry 且 usage 全保留）；`mockError` 支持 errorKind/errorRetryable。

### 🧠 Design Intent (Why)

重试放 loop 层而不是 service 层：service 内部重试无法收拾已 emit 给 UI 的半截流式内容，且每个 service 要各写一遍；loop 层一份逻辑覆盖所有 provider，还能借 emit 通道告诉 UI「正在重试」。error 事件复用已定义但闲置的 SessionEvent 链路，实时流和重开会话都显示错误块，替代原本的空白气泡。

### 📁 Files Modified

- `packages/agent-core/src/messages.ts`
- `packages/agent-core/src/llm/convert.ts`
- `packages/agent-core/src/llm/anthropic-convert.ts`
- `packages/agent-core/src/llm/services/mock.ts`
- `packages/agent-core/src/engine/types.ts`
- `packages/agent-core/src/engine/loop.ts`
- `packages/agent-core/src/engine/agent.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/index.ts`
- `packages/agent-core/src/adapters.ts`
- `packages/agent-core/src/engine/test/loop.test.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts`
- `packages/shared/src/session.ts`
- `packages/desktop/src/renderer/App.tsx`
- `docs/design-docs/agent-backend-design.md`
- `docs/RELIABILITY.md`
- `docs/QUALITY_SCORE.md`
