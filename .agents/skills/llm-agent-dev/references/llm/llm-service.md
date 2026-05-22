# LLM 服务层设计

LLM 模块通过工厂模式 + 统一接口解决多模型接入问题。核心设计思想：对上层屏蔽供应商差异，提供一致的调用体验。

## 架构三层结构

### 第一层：工厂函数（Factory）

根据配置参数创建对应的 LLM 服务实例。

工厂函数接收 LLMConfig（包含 provider、api_key、base_url、model、temperature 等），根据 provider 字段映射到具体的服务类。在创建前自动解析 api_key 和 base_url（可从环境变量或配置文件中提取）。

### 第二层：服务基类（BaseLLMService）

采用 stream-first 设计，子类只需实现一个抽象方法 `_doStream`，基类提供四个公开方法：

- `stream(context)`：流式调用——内部调用 `convertMessages()` 将 Context 中的 Message[] 转为 OpenAI 兼容的 APIMessage[]，再交给子类 `_doStream` 执行
- `complete(context)`：非流式调用——等待 stream 完成，直接返回 AssistantMessage
- `streamSimple(context, options?)`：流式调用（通用选项）——接受 provider 无关的 SimpleStreamOptions（如 `reasoning: "high"`），映射为 StreamOptions
- `completeSimple(context, options?)`：非流式调用（通用选项）——执行引擎调用的主入口

基类还提供 `convertMessages(context)` 方法，默认将内部 Message[] 转为 OpenAI 兼容格式（`systemPrompt → system role`，`toolResult → tool role`，`AssistantMessage.content 中的 ToolCallContent → tool_calls 数组`），子类可重写以适配 Anthropic 等非兼容 provider。

### 第三层：具体服务类

每个 LLM 提供商一个实现类（OpenAIService、ClaudeService、DeepSeekService 等）。子类只需实现 `_doStream(messages, tools?, options?)`，接收已转换的 APIMessage[]。每个服务类处理该提供商特有的：
- SDK 客户端初始化
- 流式 SSE 解析，组装 AssistantMessageEvent 事件流
- 工具定义格式微调（如 Anthropic 的工具格式与 OpenAI 不同）
- 可选重写 `convertMessages()` 以适配非 OpenAI 兼容的消息格式
- 可选重写 `resolveSimpleOptions()` 以支持 reasoning 等 provider 特定参数

## Registry 模式

当供应商数量增多时，使用 Registry 解耦工厂函数和具体服务类：

- 每个服务类在模块加载时注册自己到全局 Registry
- 工厂函数通过 Registry 查找对应的服务类
- 新增供应商只需实现服务类并注册，无需修改工厂函数

## 响应格式

`complete()` / `completeSimple()` 直接返回 `AssistantMessage`（不再包装为 LLMResponse），包含：
- `content`：结构化内容数组（TextContent / ThinkingContent / ToolCallContent）
- `usage`：Token 使用量与成本
- `stopReason`：停止原因（stop / toolUse / length / error / aborted）
- `model` / `provider`：生成来源

`stream()` / `streamSimple()` 返回 `AssistantMessageEventStream`，产出 `text_delta` / `thinking_delta` / `tool_call_delta` / `done` / `error` 事件。调用 `.result()` 可等待流完成并返回最终的 AssistantMessage。

执行引擎通过检查 `stopReason === 'toolUse'` 来判断 LLM 是"最终回复"还是"请求工具调用"。

## 关键设计决策

**为什么自己封装而非用 LangChain/LlamaIndex？**

自定义封装的优势：
- 轻量级，只包含必要功能
- 与系统其他组件（上下文管理、工具调度）无缝集成
- 可添加定制功能（重试、压缩、直接生成模式）
- 避免供应商锁定，替换底层更容易

**消息格式转换的必要性**

系统内部使用结构化的 Message 类型（带 source/priority/timestamp 等元数据），而 API 只接受简单的 role + content 格式。`BaseLLMService.convertMessages()` 在基类中提供默认的 OpenAI 兼容转换（丢弃元数据、`toolResult` → `tool` role、ToolCallContent → `tool_calls` 数组）。不同供应商的 API 格式差异（如 Anthropic 的 content blocks）通过子类重写 `convertMessages()` 处理。

## 辅助能力

- **重试机制**：网络波动时自动重试，支持指数退避
- **Token 统计**：每次调用后累计 Token 使用量，为上下文管理提供数据
- **错误分类**：区分可重试错误（网络超时、限流）和不可重试错误（参数错误、余额不足）

参考代码: `examples/llm-factory.ts`、`examples/llm-service.ts`

## 注意事项

- 不同模型对工具调用的支持程度不同——有些不支持 parallel tool calls，有些对 tool 数量有限制。服务类需要处理这些差异
- api_key 不要硬编码，通过环境变量或配置文件注入。工厂函数中做统一的 key 解析
- Token 使用统计是上下文压缩触发的数据来源，必须准确记录
