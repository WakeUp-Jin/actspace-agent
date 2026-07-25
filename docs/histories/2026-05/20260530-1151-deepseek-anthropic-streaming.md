## [2026-05-30 11:51] | Task: DeepSeekAnthropicService 真流式修复

### 🤖 Execution Context

- **Agent ID**: `Claude`
- **Base Model**: `Claude Opus 4.8`
- **Runtime**: `Cursor`

### 📥 User Query

> 为什么现在的输出不是流式的啦，连中间工具的执行调度状态也不显示，而是一下子就回复了全部？分析原因并改为真流式：`DeepSeekAnthropicService` 的 `stream` 走真流式，`complete` 只是 `await`，和 OpenAI 路线设计思路一致，只是格式不同。

### 🛠 Changes Overview

**Scope:** `packages/agent-core/src/llm`，相关单测与设计文档

**Key Actions:**

- **定位回归根因**: DeepSeek 默认 `DEEPSEEK_API_FORMAT=anthropic`，工厂实例化 `DeepSeekAnthropicService`，而该 service 用阻塞式 `client.messages.create` 等整段响应返回后才把内容拆成大块一次性 `yield`（整段 text 作为单个 `text_delta`），导致前端「LLM 阶段无增量、文本与工具调度状态在结束瞬间一次性涌出」。
- **新增 Anthropic 流式处理层**: 在 `anthropic-convert.ts` 增加 `AnthropicStreamAccumulator` + `createAnthropicAccumulator` + `processAnthropicStream` + `buildAnthropicAssistantMessage` / `buildAnthropicErrorMessage`，与 OpenAI 路线（`convert.ts`）同构。
- **改为真流式**: `DeepSeekAnthropicService._stream` 改用 `client.messages.stream(...)`，逐 `content_block_delta` 转发 `text_delta` / `thinking_delta` / `tool_call_delta`（含 tool_use 首帧带出 id/name），结束后由累加器组装 `done` 消息；错误时保留已收到的部分内容。`complete` 仍是 `stream().result()`。
- **usage 流式合并**: 累加器从 `message_start.usage` 取初值，用 `message_delta.usage` 合并 output/缓存/server tool/reasoning，最终经 `anthropicUsageToUsage` 归一，保持既有 token 不变量。
- **保留 extended thinking 回放能力**: 累积 `signature_delta`，`done` 的 thinking 块带 signature，避免下一轮被 `sanitizeMessagesForAnthropic` 丢弃。
- **测试更新**: service 单测改 mock `messages.stream`（同步返回 async iterable），新增「逐 text_delta 增量」「中途报错保留部分内容」断言；engine tool-loop 测试改用流式事件序列 mock。

### 🧠 Design Intent (Why)

之前的实现虽然实现了 `LLMService.stream` 接口，但底层是非流式 `messages.create`，是「伪流式」——整段响应回来后才拆块，等于把流式链路最上游堵死。改用 Anthropic SDK 的真流式 `messages.stream` 后，增量从源头逐 SSE 事件产出，下游 `loop → bridge → IPC → 前端` 不变即可恢复逐字流式与实时工具调度状态。

模块边界沿用既有约定：Anthropic 私有协议（含流式累积）集中在 `anthropic-convert.ts`，与 OpenAI 路线的 `convert.ts` 形成对称的两条 adapter；service 只负责发起请求、串接「流式处理 → 组装消息」，`complete = stream().result()`，与 OpenAI 路线设计思路完全一致。

### ✅ Verification

- `pnpm typecheck`（agent-core）通过。
- `pnpm test`（agent-core）全量 69 文件 / 487 测试通过。

### 📁 Files Modified

- `packages/agent-core/src/llm/anthropic-convert.ts`
- `packages/agent-core/src/llm/services/deepseek-anthropic.ts`
- `packages/agent-core/src/llm/test/deepseek-anthropic-service.test.ts`
- `packages/agent-core/src/engine/test/deepseek-anthropic-tool-loop.test.ts`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`
- `docs/design-docs/model-context/agent-deepseek-kimi-hybrid-capabilities.md`
- `docs/exec-plans/active/20260530-context-cache-and-usage/01-usage-anthropic-semantics-fix.md`
