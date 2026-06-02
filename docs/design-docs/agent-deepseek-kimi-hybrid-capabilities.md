# DeepSeek + Kimi 混合能力设计

## 当前状态

本文档是 `actspace` Agent Core 中 DeepSeek 与 Kimi 混合能力接入的设计事实来源。对应 execution plan 为：

- `docs/exec-plans/completed/actspace-deepseek-kimi-hybrid-capabilities.md`

当前仓库已经把公开主模型收口到 DeepSeek `deepseek-v4-flash` / `deepseek-v4-pro`。Kimi 不再作为公开模型选择项，而是保留在模型注册表的 `internal` 层，继续服务 DeepSeek 的搜索、多模态等内部 helper 能力。

当前 LLM 分层以 `api` 而不是品牌 service 为主线：

- `AnthropicMessagesService`：Anthropic Messages 协议实现层，承接 DeepSeek 默认路线。
- `OpenAICompletionsService`：OpenAI Chat Completions 协议实现层，承接 OpenAI-compatible fallback 和普通 Kimi 内部调用。
- `KimiService`：兼容包装层，只保留 Kimi builtin `$web_search` 等内部 helper 入口，不再代表公开主模型职责。
- `DeepSeekService` / `DeepSeekAnthropicService`：兼容包装层，只兜底 provider 默认值；协议职责归属 `OpenAICompletionsService` / `AnthropicMessagesService`。

2026-05-29 后，DeepSeek 默认走 Anthropic-compatible 路线：主 Agent 默认模型为 `deepseek-v4-pro` 且默认开启 thinking；Kairos 默认模型独立为 `deepseek-v4-flash` 且默认开启 thinking。两条链路都会用 Anthropic Messages API，并由 DeepSeek provider-native server tool `web_search_20250305` 执行联网搜索。原有 OpenAI-compatible 路线和 Kimi 辅助工具路线继续保留，可通过 `DEEPSEEK_API_FORMAT=openai` 显式回退。

## 设计目标

- 公开 UI 只让用户在 DeepSeek `deepseek-v4-flash` / `deepseek-v4-pro` 之间选择。
- Kimi 继续作为内部 helper 能力，不进入公开主模型选择器。
- DeepSeek 作为主模型且使用 OpenAI-compatible 路线时，如果配置了 Kimi API Key，则通过应用级工具补齐搜索、网页读取和多模态识别。
- DeepSeek 作为主模型且使用 Anthropic-compatible 路线时，通过 DeepSeek server `web_search_20250305` 直接联网搜索，避免再暴露同名 Kimi-backed 本地 `web_search`。
- DeepSeek 没有 Kimi API Key 时仍可正常使用本地文件类工具，只是不暴露联网搜索与多模态工具。
- 供应商细节不泄露给主模型。DeepSeek 不需要知道 `$web_search`、`moonshot/web-search:latest` 或 `kimi-k2.6`。
- 首版不引入复杂 Capability Router，只使用工具定义上的轻量暴露属性和少量 provider 判断。

## 非目标

- 不支持第三个真实 provider。
- 不做通用模型能力市场。
- 不把 Kimi Formula 作为首版统一工具平台。
- 不把 Kimi Formula `web-search` 的 encrypted output 直接返回给 DeepSeek。
- 不把 Kimi 原生能力强行注册成普通 ToolManager 工具。
- 不把 DeepSeek Anthropic server `web_search_20250305` 注册成普通 ToolManager 工具。
- 不引入新的 Agent runtime 来承载搜索子代理。
- 不重新开放 Kimi 作为公开主模型选项。

## 核心模型

系统中有三层边界：

1. **模型元数据层**
   - `MODEL_REGISTRY` 区分 `api`、`provider`、`visibility`。
   - `api` 决定协议服务：`anthropic-messages` 或 `openai-completions`。
   - `provider` 决定供应商身份、凭据和默认 base URL：`deepseek` 或 `kimi`。
   - `visibility` 决定是否出现在公开 UI；Kimi 当前为 `internal`。

2. **协议服务层**
   - 由 `AnthropicMessagesService` / `OpenAICompletionsService` 实现 provider-neutral `LLMService`。
   - 消息转换、工具转换、usage 归一、流式事件组装都归协议服务和对应 convert 模块。
   - 品牌包装层不再承载协议转换职责，只做兼容入口。

3. **能力包装层**
   - Provider 原生能力由协议服务或内部 helper 在请求构造层处理，例如 DeepSeek server web search、Kimi `$web_search`。
   - 应用级工具由 ToolManager 暴露给主模型，例如 `read_file`、`grep`、`glob`、`web_search`、`analyze_media`。

这些层级不能混在一起。`api` 解决“用哪套协议和消息转换”的问题；`provider` 解决“用哪个供应商身份和凭据”的问题；应用级工具解决“主模型能在 actspace 中做什么”的问题。

## Provider 角色

### DeepSeek

DeepSeek 是低成本主力模型。它应看到稳定、供应商无关的工具。当前有两条实现路线：

**OpenAI-compatible 路线（显式回退）**

- 通过 `DEEPSEEK_API_FORMAT=openai` 启用。
- 普通对话由 `OpenAICompletionsService` 处理；`DeepSeekService` 只保留为兼容包装入口。
- 本地文件工具：默认可见。
- `web_search`：只有配置 Kimi API Key 时可见。支持 `query`（关键词搜索）和 `url`（读取网页）两种模式。
- `analyze_media`：只有配置 Kimi API Key 时可见。

DeepSeek 不直接处理 Kimi 的内置工具协议，也不直接消费 Kimi Formula 的 encrypted output。

**Anthropic-compatible 路线**

- 当前 DeepSeek 默认 API 路线，主 Agent 与 Kairos 都会沿用；主 Agent 默认模型为 `deepseek-v4-pro`，Kairos 默认模型为 `deepseek-v4-flash`。
- 由 `AnthropicMessagesService` 使用 Anthropic Messages API 真流式（`client.messages.stream`）调用 DeepSeek，逐增量转发 text/thinking/tool_use，结束后由流式累加器组装最终消息。
- `DeepSeekAnthropicService` 只保留为兼容包装层，不再是协议职责事实来源。
- 请求中声明 server tool：`{ type: "web_search_20250305", name: "web_search", max_uses: 3 }`。
- `web_search` 在 provider 侧执行，不进入本地 ToolManager，不产生本地 tool execution 事件。
- provider-native 搜索计数会记录到 usage metadata（如 `serverToolUse.webSearchRequests` / `serverToolUse.webFetchRequests`），用于判断是否真实触发搜索；它不是本地 `toolCallCount`。
- 不暴露 Kimi-backed 本地 `web_search`，避免与 provider-native server tool 同名。
- 本地工具通过 Anthropic client tools 暴露：provider-neutral `Tool` 会转成 `name/description/input_schema`，模型返回的 `tool_use` 会转成内部 `ToolCallContent`，工具执行结果会在下一轮转成 user `tool_result` 回放。

### Kimi

Kimi 当前是内部 helper provider，不出现在公开模型菜单。`kimi-k2.6` 仍保留在 `MODEL_REGISTRY` 中，`visibility: "internal"`，以便内部工具、旧配置解析和辅助能力继续复用同一份模型元数据。

Kimi helper 拥有两类原生能力：

- 联网搜索：通过 `builtin_function.$web_search`。
- 多模态：通过图片/视频 content parts。

普通 Kimi OpenAI-compatible 调用复用 `OpenAICompletionsService`。`KimiService` 只保留 `streamWithBuiltinWebSearch` 等内部 helper 入口，用来封装 Kimi builtin `$web_search` 的请求细节。

## 工具暴露规则

在工具定义上增加一个可选字段：

```ts
exposeOnlyTo?: "deepseek" | "kimi";
```

语义：

- 缺省：两个主模型都可以看到。
- `"deepseek"`：只暴露给 DeepSeek，且隐含需要 Kimi API Key。
- `"kimi"`：只暴露给 Kimi。当前 Kimi 是 internal helper，公开主 Agent 通常不需要注册 Kimi-only 普通工具。
- `DEEPSEEK_API_FORMAT=anthropic` 时，DeepSeek 不暴露 Kimi-backed 本地 `web_search`，因为联网搜索由 provider-native server tool 承担。

示例：

```ts
export const readFileDefinition = {
  name: "read_file",
  description: "...",
  category: "file",
  isReadOnly: true,
};

export const webSearchDefinition = {
  name: "web_search",
  description: "...",
  category: "search",
  isReadOnly: true,
  exposeOnlyTo: "deepseek",
};
```

筛选逻辑应保持简单：

```ts
function shouldExposeTool(tool, runtime) {
  if (!tool.exposeOnlyTo) return true;
  if (tool.exposeOnlyTo !== runtime.primaryProvider) return false;
  if (tool.exposeOnlyTo === "deepseek" && runtime.apiFormat === "anthropic" && tool.name === "web_search") return false;
  if (tool.exposeOnlyTo === "deepseek") return runtime.hasKimiKey;
  return true;
}
```

这个函数可以调整命名和类型，但不应扩展成多层策略框架。等第三个 provider 真正出现后，再重新评估是否抽象 Capability Profile。

## DeepSeek 的 Kimi 辅助工具

DeepSeek 需要的是干净的应用级工具结果，而不是 Kimi 平台协议细节。

Kimi 系统提示词是 executor 内部资产，统一放在：

```txt
packages/agent-core/src/prompt/kimi-assistants/
  web-search.ts
  analyze-media.ts
```

边界：

- `definition.description` 给 DeepSeek 看，帮助它判断何时调用工具。
- `prompt/kimi-assistants/*` 给 Kimi 辅助调用看，约束 Kimi 如何搜索、摘要或识别。
- 主 Agent 的 `ContextManager` system prompt 不包含这些内部提示词，避免把供应商实现细节暴露给主模型。

### web_search

`web_search` 的实现应是一个很薄的 Kimi 搜索函数：

1. DeepSeek 调用 `web_search({ query })`。
2. executor 读取 `prompt/kimi-assistants/web-search.ts` 中的系统提示词。
3. executor 调用 Kimi Chat Completions。
4. Kimi 请求声明 `builtin_function.$web_search`。
5. 使用 `$web_search` 时禁用 thinking。
6. 如果 Kimi 返回 `$web_search` tool call，应用按 Kimi 协议把 arguments 原样作为 tool message 回填。
7. Kimi 继续生成自然语言结果。
8. executor 返回给 DeepSeek：
   - 查询词。
   - 摘要。
   - sources。
   - 搜索时间。

这个函数可以叫“搜索子代理”，但它不是独立 Agent runtime：没有独立记忆、没有工具调度器、没有上下文压缩。

### URL 读取（已合并到 web_search）

> **已废弃**：`web_fetch` 工具已移除。URL 阅读能力现在统一由 `web_search` 工具的 `url` 参数提供。

Kimi `$web_search` builtin 内置了 search + crawl 双能力。独立的 `web_fetch` 工具（本地 fetch HTML → Kimi summarize）引入了复杂的 htmlToText 链路，容易超时且结果质量差。合并后：

1. `web_search` executor 接收 `url` 参数时，构造读取 prompt 传给 `searchWithKimi`。
2. Kimi 通过 `$web_search` builtin 原生 crawl URL，返回内容摘要。
3. 无需本地 HTTP fetch、HTML 解析或额外 summarize 调用。

### analyze_media

`analyze_media` 给 DeepSeek 补齐图片/视频理解能力。

首版原则：

- DeepSeek 只看到工具名和文本/JSON 结果。
- Kimi 调用使用 `prompt/kimi-assistants/analyze-media.ts` 约束输出结构。
- 图片可由 Kimi Vision 直接处理。
- 视频优先按 Kimi 文件上传协议处理，再用 `ms://file_id` 引用。
- 返回结果必须包含内容摘要、关键细节、限制说明。
- 不把大体积 base64 原文写入 session 或日志。

## Kimi 内部 helper 原生能力

Kimi 不作为公开主模型暴露给用户。内部 helper 需要联网时，不通过 ToolManager 再包装一层 Kimi-only 普通工具，而是在 Kimi 请求参数中声明：

```json
{
  "type": "builtin_function",
  "function": {
    "name": "$web_search"
  }
}
```

并在同一请求中禁用 thinking：

```json
{
  "thinking": {
    "type": "disabled"
  }
}
```

图片/视频输入也不走公开主模型的 `analyze_media` wrapper，而是在 Kimi helper 的 user message 中构造 content part 数组。这样 Kimi 能在内部辅助调用里直接理解多模态输入，再把结果降级成 DeepSeek 可读的工具结果。

## DeepSeek Anthropic 原生联网搜索

DeepSeek Anthropic-compatible 路线解决的是“DeepSeek 自己已经能在 Anthropic Messages API 协议下使用 server web search”的场景。

配置方式：

```env
# 默认路线
DEEPSEEK_API_FORMAT=anthropic
DEEPSEEK_ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic

# 临时回退到旧 OpenAI-compatible 路线时使用
# DEEPSEEK_API_FORMAT=openai
# DEEPSEEK_BASE_URL=https://api.deepseek.com
```

边界：

- `ContextManager` 继续产出 provider-neutral `Context`，不感知 Anthropic 协议。
- `AnthropicMessagesService` 负责把 `Context` 转成 Anthropic `system/messages/tools`。
- `LLMConfig.provider="deepseek"` 只提供供应商身份、密钥和默认 base URL，不决定消息转换算法。
- Anthropic adapter 转换用户文本、图片、assistant 文本、带签名的 thinking、本地 `toolCall` 和本地 `toolResult`。
- assistant `ToolCallContent` 回放为 Anthropic `tool_use`；internal `ToolResultMessage` 回放为 user `tool_result`。
- server `server_tool_use`、`web_search_tool_result` 只作为 provider 响应块处理，不映射成本地 ToolManager 事件。
- 本地工具接入不修改 Context 模块的数据所有权；Context 仍只表达 provider-neutral messages/tools。

## 为什么不直接用 Formula web-search 给 DeepSeek

Kimi Formula 的官方工具适合构建统一工具平台，例如接入：

- `moonshot/web-search:latest`
- `moonshot/fetch:latest`
- `moonshot/code_runner:latest`
- `moonshot/date:latest`

但首版不使用 `moonshot/web-search:latest` 作为 DeepSeek 的裸搜索实现，原因是：

- `web-search` 是 protected，结果可能在 `context.encrypted_output`。
- encrypted output 更适合回填给 Kimi，而不是给 DeepSeek 直接阅读。
- DeepSeek 需要的是可审计、可引用、可裁剪的自然语言搜索结果。

因此首版选择 Kimi `$web_search` + Kimi 自然语言总结，再返回给 DeepSeek。

Formula 可以作为后续扩展方向，但应单独设计“托管工具平台接入”，不要混入本轮双模型能力计划。

## 安全与观测原则

- API Key 只能在 main/agent-core 运行时读取。
- renderer 不接触 Kimi 或 DeepSeek API Key。
- session 事件不能写入 API Key、Authorization header、base64 大图原文或 encrypted output。
- 日志可以记录：
  - provider。
  - api format。
  - model。
  - 工具名。
  - 是否配置 Kimi key 的布尔状态。
  - provider-native server tool 是否发生的结构化计数（只记录请求次数，不写入未裁剪网页全文或 provider tool result 原文）。
  - 错误分类。
- 日志不能记录：
  - 密钥。
  - 完整 Authorization header。
  - 大型原始多模态 payload。
  - 未裁剪网页全文。

## 测试原则

- Kimi provider 测试使用 fake client，不依赖真实网络或真实密钥。
- `$web_search` 测试必须覆盖 tool call 回填协议。
- DeepSeek Anthropic service 测试使用 fake SDK client，不依赖真实网络或真实密钥。
- Anthropic route 测试必须覆盖请求中声明 `web_search_20250305`，以及 `server_tool_use` / `web_search_tool_result` 不被误映射成本地工具调用。
- `web_search` 工具测试必须验证返回给 DeepSeek 的是纯文本/JSON，而不是 Kimi 私有 tool call 结构。
- `analyze_media` 测试必须验证多模态 content part 保持结构化数组，不被字符串化。
- 工具暴露测试必须覆盖：
  - DeepSeek 无 Kimi key。
  - DeepSeek 有 Kimi key。
  - Kimi 主模型。

## 决策记录

- 2026-05-24：DeepSeek 与 Kimi 是首版仅支持的两个真实 provider。这个限制能保持实现集中，避免过早抽象。
- 2026-05-24：工具定义使用 `exposeOnlyTo?: "deepseek" | "kimi"` 表达主模型暴露范围。字段缺省表示两个模型都可用。
- 2026-05-24：DeepSeek 专用 Kimi 辅助工具隐含需要 Kimi API Key。缺 key 时不注册这些工具，而不是把失败工具暴露给模型反复调用。
- 2026-05-24：Kimi 原生 `$web_search` 和多模态输入由 Kimi provider adapter 管理，不进入普通 ToolManager。
- 2026-05-24：首版 DeepSeek 搜索工具调用 Kimi `$web_search` 并返回自然语言摘要与 sources，不直接消费 Formula `web-search` 的 protected/encrypted 结果。
- 2026-05-24：Kimi 辅助调用的三个系统提示词作为工具 executor 内部资产独立版本化；2026-05-25 起统一集中到 `packages/agent-core/src/prompt/kimi-assistants/`。
