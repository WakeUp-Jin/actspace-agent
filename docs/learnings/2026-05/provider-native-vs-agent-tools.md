# Provider 原生能力与 Agent 工具不要混在一起

来源：`docs/histories/2026-05/20260524-1509-deepseek-kimi-hybrid-capabilities.md`

## 是什么

LLM Agent 里常见两类“工具”：

- **Provider 原生能力**：模型供应商在 Chat Completions 协议里内置的能力，例如 Kimi 的 `builtin_function.$web_search`、图片/视频 content parts。
- **Agent 应用级工具**：你的产品暴露给主模型的稳定能力，例如 `web_search`、`web_fetch`、`analyze_media`、`read_file`。

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

## 常见陷阱

- 把内置工具当普通 function tool 执行。Kimi `$web_search` 的 tool call 参数需要按协议原样作为 tool message 回填，再让 Kimi 继续生成答案。
- 把 Formula protected output 直接给另一个模型。加密或供应商私有结构通常只适合同供应商回填。
- 把工具内部 prompt 塞进主 Agent system prompt。这样会污染主模型上下文，也暴露不该让主模型关心的实现细节。

## 自检问题

1. 这个能力是供应商 API 协议的一部分，还是产品希望主模型看到的能力？
2. 如果明天替换供应商，主模型看到的工具名和 schema 是否能保持稳定？
3. 工具输出是否已经从供应商私有结构转换成主模型能直接阅读、引用和裁剪的内容？
