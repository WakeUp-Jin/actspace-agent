# LLM 模块健壮性优化 — 实施结果

## 实施日期

2026-05-25

## 优化内容总览

基于 `fix-llm-agent-02-pi-ai-core-design-extraction.md` 中提取的 10 个 pi-ai 核心设计理念，选择性引入最有影响力的改进，不做架构大改。

### 已实施的改进

#### 1. 共享消息转换 + 防御性处理（`llm/convert.ts`）

- **提取内容**：`convertMessages()`、`toUserContent()`、`toRequestTools()`、`parseToolCall()`、`mapStopReason()` 从 `deepseek.ts` 和 `kimi.ts` 提取到独立的 `convert.ts`。
- **防御性处理**（参考 pi-ai 设计 6）：
  - 跳过 `stopReason === "error" | "aborted"` 的 assistant messages，防止不完整回复回放给 API。
  - 为孤儿 tool calls（有 tool_calls 但无对应 toolResult）插入 synthetic toolResult，防止 API 报错。
- **影响**：消除约 80 行重复代码，两个 service 只保留 provider 特有逻辑。

#### 2. error 事件携带 AssistantMessage（参考 pi-ai 设计 9）

- **改动**：`{ type: "error"; error: Error }` → `{ type: "error"; message: AssistantMessage }`。
- error 事件中的 `AssistantMessage` 包含已收到的部分内容、`stopReason: "error" | "aborted"` 和 `errorMessage`。
- `AssistantMessageEventStream.result()` 不再 throw，而是返回带 error 信息的 AssistantMessage。
- **影响**：`engine/loop.ts` 的 `streamAssistantResponse()` 从 try-catch 简化为 switch-case，不再需要手动构造空的 error message。

#### 3. 共享 SDK 错误映射（`mapSdkError()`）

- **提取内容**：HTTP status → `LLMErrorKind` 的映射逻辑提取到 `convert.ts`，两个 service 共用。
- **影响**：消除重复的错误分类代码。

#### 4. 共享流式 chunk 处理（`processStreamChunks()`）

- **提取内容**：OpenAI SDK stream 遍历、delta 累积、事件 yield、usage 收集、AssistantMessage 组装。
- **辅助函数**：`createAccumulator()`、`buildContentFromAccumulator()`、`buildAssistantMessage()`、`buildErrorMessage()`。
- **影响**：两个 service 的 `_stream` 方法从 ~70 行简化为 ~30 行（构造请求参数 → create stream → processStreamChunks → build message）。

#### 5. MockLLMService 升级为 response queue 模式（参考 pi-ai 设计 8 faux provider）

- **新模式**：通过 `setResponses()`/`appendResponses()` 预设响应序列，每次 stream 调用从队列取下一个。
- **辅助工厂**：`mockText()`、`mockToolCall()`、`mockError()`，快速构造测试用 AssistantMessage。
- **向后兼容**：队列为空时保持旧的默认行为（根据 hasToolResults 决定返回 tool calls 或 final text）。
- **状态追踪**：`state.callCount` 和 `getPendingCount()` 便于测试验证。

### 未引入的设计

| pi-ai 设计 | 原因 |
|---|---|
| 设计 1 函数式 API | interface + class 更适合 DI 和测试 |
| 设计 3 push-based EventStream | AsyncGenerator 已足够 |
| 设计 4 按 API 协议注册 | 只有 2 个 provider，factory switch 足够 |
| 设计 5 Model 对象 | LLMConfig 满足当前需求 |
| 设计 7 start/delta/end 三阶段事件 | 影响面过大（P2，后续单独评估） |

## 变更文件清单

| 文件 | 变更类型 |
|---|---|
| `llm/convert.ts` | 新建 |
| `llm/types.ts` | 修改（error 事件签名 + result() 行为） |
| `llm/services/deepseek.ts` | 重写（使用共享函数） |
| `llm/services/kimi.ts` | 重写（使用共享函数） |
| `llm/services/mock.ts` | 重写（response queue + 工厂函数） |
| `llm/index.ts` | 新增导出 |
| `engine/loop.ts` | 简化（移除 try-catch） |
| `engine/bridge.ts` | 修复（buffer tool_call_delta） |
| `llm/test/convert.test.ts` | 新建 |
| `llm/test/deepseek-service.test.ts` | 更新（error 断言方式） |
| `llm/test/kimi-service.test.ts` | 更新（error 断言方式） |
| `llm/test/mock-service.test.ts` | 重写（覆盖 response queue 模式） |
| `engine/test/bridge.test.ts` | 更新（适配 mock delta 行为） |
| `docs/ARCHITECTURE.md` | 同步更新 |

## 测试结果

全部 24 个测试文件、147 个测试用例通过。TypeScript 编译 0 错误。
