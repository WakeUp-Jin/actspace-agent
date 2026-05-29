# Provider 原生能力与 Agent 工具不要混在一起

来源：`docs/histories/2026-05/20260524-1509-deepseek-kimi-hybrid-capabilities.md`

## 是什么

LLM Agent 里常见两类“工具”：

- **Provider 原生能力**：模型供应商在 Chat Completions 协议里内置的能力，例如 Kimi 的 `builtin_function.$web_search`、图片/视频 content parts。
- **Agent 应用级工具**：你的产品暴露给主模型的稳定能力，例如 `web_search`、`analyze_media`、`read_file`。

它们看起来都像“工具”，但职责完全不同。Provider 原生能力回答“如何调用这个供应商的平台能力”；应用级工具回答“这个 Agent 产品允许主模型做什么”。

## 为什么需要分层

如果把 Kimi `$web_search` 直接暴露给 DeepSeek，会出现三个问题：

1. 主模型被迫理解供应商私有协议。
2. 工具列表会混入 `$web_search`、Formula URI、模型名等实现细节。
3. 将来换实现时，模型 prompt 和工具 schema 都会被牵连。

更稳的设计是：DeepSeek 只看到 `web_search`；`web_search` executor 内部再调用 Kimi `$web_search`，把结果整理成 DeepSeek 能读的文本。

## 怎么用

应用级工具定义：

```ts
export const webSearchDefinition = {
  name: "web_search",
  description: "Search the public web for current or external information...",
  parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  exposeOnlyTo: "deepseek",
};
```

Provider 原生调用留在 Kimi service/helper 中：

```ts
service.streamWithBuiltinWebSearch(messages, {
  tools: [{ type: "builtin_function", function: { name: "$web_search" } }],
  thinking: { type: "disabled" },
});
```

工具暴露规则保持小：

```ts
if (!tool.exposeOnlyTo) return true;
if (tool.exposeOnlyTo !== primaryProvider) return false;
if (tool.exposeOnlyTo === "deepseek") return hasKimiKey;
```

## 核心要点

- 主模型应该看到产品能力，不应该看到供应商实现细节。
- Provider 原生能力放在 provider adapter/request builder，不进入普通 ToolManager。
- 跨模型补能力时，用 wrapper executor 把供应商结果转成主模型可读结果。
- 简单工具暴露字段比早期 Capability Router 更容易维护。

## 实现模式：让协议适配层吃掉格式差异

来源补充：`docs/histories/2026-05/20260529-1336-deepseek-anthropic-service.md`

DeepSeek 同时存在 OpenAI-compatible 与 Anthropic-compatible 两条路线时，不要让 Context 或 ToolManager 直接输出两套 provider 协议。更稳的分层是：

```txt
Context / ToolManager
  provider-neutral messages + tools
        |
        v
LLM service adapter
  OpenAI format / Anthropic format / provider-native server tools
```

也就是说，`apiFormat` 决定具体 service adapter，而不是改变上游数据结构。Anthropic adapter 负责：

- 把 `Context.systemPrompt` 转成 Anthropic top-level `system`。
- 把 user/assistant 历史转成 Anthropic `messages`。
- 把 provider-native `web_search_20250305` 声明在请求里。
- 把本地工具定义转成 Anthropic client tools，并在历史里完整回放 `tool_use/tool_result`。
- 对 provider-native 工具名做防御性过滤，避免同一个 `web_search` 同时以 server tool 和 client tool 出现。

这个模式的好处是：新增一个供应商兼容格式时，上游 Agent loop 不需要立刻大改；风险被约束在 provider adapter 里。

## 兼容 API 的验证陷阱

来源补充：`docs/histories/2026-05/20260529-1152-deepseek-web-search-probe.md`

“兼容 OpenAI/Anthropic”只代表基础请求形状相似，不代表供应商原生工具都被转发支持。判断 provider 原生联网搜索时，要看协议里真正的执行证据：

- Anthropic web search 需要响应里出现 `server_tool_use` 和 `web_search_tool_result`，只返回普通 `text` 不足以证明搜索执行过。
- OpenAI-compatible chat completions 即使接受了未知参数，也可能只是普通聊天成功；需要看是否有搜索 annotation、tool call 或供应商明确的 usage 字段。
- 请求返回 200 不是能力验证终点。很多 provider 会忽略未知字段，或者用普通模型知识回答一个“看起来像联网”的问题。
- 探针脚本应打印响应 block 类型和裁剪后的证据字段，而不是只打印最终文本。

## 观测陷阱：本地工具计数不等于 provider 工具计数

来源补充：`docs/histories/2026-05/20260529-1336-deepseek-anthropic-service.md`

provider-native server tool 不由 Agent 的 `ToolManager` 执行，所以它不会产生本地 `tool_call` / `tool_result` 事件，也不会让本地 `toolCallCount` 增长。DeepSeek Anthropic 的 server web search 应该看 `usage.server_tool_use`，在内部日志里映射成：

```ts
serverToolUse: {
  webSearchRequests?: number;
  webFetchRequests?: number;
}
```

因此排障时要分两层看：

- `toolCallCount`：Agent 本地工具调用次数，例如 `read_file`、`grep`、`bash`。
- `serverToolUse`：provider 在自己侧执行的 server tool 次数，例如 DeepSeek Anthropic web search / web fetch。

如果日志里 `toolCallCount: 0` 但 `serverToolUse.webSearchRequests > 0`，说明模型确实用了 provider-native 搜索，只是没有调用本地工具。

## 常见陷阱

- 把内置工具当普通 function tool 执行。Kimi `$web_search` 的 tool call 参数需要按协议原样作为 tool message 回填，再让 Kimi 继续生成答案。
- 把 Formula protected output 直接给另一个模型。加密或供应商私有结构通常只适合同供应商回填。
- 把工具内部 prompt 塞进主 Agent system prompt。这样会污染主模型上下文，也暴露不该让主模型关心的实现细节。
- 看到“API 兼容”就默认“内置工具兼容”。工具能力要按具体 content block、tool type、annotation 和 usage 逐项验证。
- 只看本地工具计数判断是否联网。provider-native 搜索需要看 provider usage metadata 或响应 block，而不是本地 ToolManager 事件。

## 自检问题

1. 这个能力是供应商 API 协议的一部分，还是产品希望主模型看到的能力？
2. 如果明天替换供应商，主模型看到的工具名和 schema 是否能保持稳定？
3. 工具输出是否已经从供应商私有结构转换成主模型能直接阅读、引用和裁剪的内容？
