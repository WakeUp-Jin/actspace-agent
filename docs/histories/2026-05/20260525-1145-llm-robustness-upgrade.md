# LLM 模块健壮性优化

## 用户诉求

基于从 pi-ai 项目提取的 10 个核心 LLM 设计理念，选择性优化 actspace-agent 的 LLM 模块健壮性，重点在共享代码提取、错误事件改进和 mock 升级。

## 主要改动

### 新建 `llm/convert.ts`

- 提取 `convertMessages()`、`toUserContent()`、`toRequestTools()`、`parseToolCall()`、`mapStopReason()`、`mapSdkError()` 共享函数
- 新增 `processStreamChunks()`、`buildAssistantMessage()`、`buildErrorMessage()` 流式处理工具
- 防御性消息处理：跳过 error/aborted assistant messages、为孤儿 tool calls 插入 synthetic toolResult

### error 事件协议升级

- `{ type: "error"; error: Error }` → `{ type: "error"; message: AssistantMessage }`
- error message 保留已收到的部分内容、stopReason 和 errorMessage
- `AssistantMessageEventStream.result()` 不再 throw，统一返回 AssistantMessage

### MockLLMService 升级

- 新增 response queue 模式（`setResponses`/`appendResponses`）
- 新增 `mockText()`、`mockToolCall()`、`mockError()` 工厂函数
- 保留默认行为向后兼容

### 下游适配

- `engine/loop.ts` 移除 try-catch，直接处理 error 事件
- `engine/bridge.ts` 新增 tool_call_delta 的 run log buffer
- 所有 LLM 测试文件适配新结构

## 设计动机

参考 pi-ai 的错误事件携带 AssistantMessage 设计（设计 9）和 faux provider 设计（设计 8），在不改变架构的前提下提升健壮性。共享代码提取消除约 150 行重复逻辑。

## 受影响文件

- `packages/agent-core/src/llm/convert.ts`（新建）
- `packages/agent-core/src/llm/types.ts`
- `packages/agent-core/src/llm/services/deepseek.ts`
- `packages/agent-core/src/llm/services/kimi.ts`
- `packages/agent-core/src/llm/services/mock.ts`
- `packages/agent-core/src/llm/index.ts`
- `packages/agent-core/src/engine/loop.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/llm/test/*.test.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/llm-agent-fix-plan/03-robustness-upgrade-result.md`
