# DeepSeek + Kimi 混合能力设计

## 当前状态

本文档是 `actspace` Agent Core 中 DeepSeek 与 Kimi 混合能力接入的设计事实来源。对应 execution plan 为：

- `docs/exec-plans/completed/actspace-deepseek-kimi-hybrid-capabilities.md`

当前仓库已经有 DeepSeek provider、mock provider、工具注册与执行框架。下一阶段要引入 Kimi，但目标不是把系统泛化成任意多模型平台，而是用很小的抽象稳定支持两个明确角色：

- DeepSeek：低成本主力推理模型。
- Kimi：生态能力更完整的主模型候选，也可作为 DeepSeek 的联网搜索和多模态辅助模型。

## 设计目标

- 用户可以在 DeepSeek 与 Kimi 之间选择主模型。
- Kimi 作为主模型时，直接使用 Kimi 原生联网搜索与多模态能力。
- DeepSeek 作为主模型时，如果配置了 Kimi API Key，则通过应用级工具补齐搜索、网页读取和多模态识别。
- DeepSeek 没有 Kimi API Key 时仍可正常使用本地文件类工具，只是不暴露联网搜索与多模态工具。
- 供应商细节不泄露给主模型。DeepSeek 不需要知道 `$web_search`、`moonshot/web-search:latest` 或 `kimi-k2.6`。
- 首版不引入复杂 Capability Router，只使用工具定义上的轻量暴露属性和少量 provider 判断。

## 非目标

- 不支持第三个真实 provider。
- 不做通用模型能力市场。
- 不把 Kimi Formula 作为首版统一工具平台。
- 不把 Kimi Formula `web-search` 的 encrypted output 直接返回给 DeepSeek。
- 不把 Kimi 原生能力强行注册成普通 ToolManager 工具。
- 不引入新的 Agent runtime 来承载搜索子代理。

## 核心模型

系统中有两类能力：

1. **Provider 原生能力**
   - 由模型供应商在 Chat Completions 请求内支持。
   - 例如 Kimi `builtin_function.$web_search`、Kimi 图片/视频 content parts。
   - 这类能力由 provider adapter 负责组装请求和处理协议。

2. **应用级工具**
   - 由 `actspace` 的 ToolManager 暴露给主模型。
   - 例如 `read_file`、`grep`、`glob`、`web_search`、`analyze_media`。
   - 这类工具必须有稳定名称、清晰 schema 和可裁剪结果。

这两个层级不能混在一起。Provider 原生能力解决“这个 provider 如何调用自己平台能力”的问题；应用级工具解决“主模型能在 actspace 中做什么”的问题。

## Provider 角色

### DeepSeek

DeepSeek 是低成本主力模型。它应看到稳定、供应商无关的工具：

- 本地文件工具：默认可见。
- `web_search`：只有配置 Kimi API Key 时可见。支持 `query`（关键词搜索）和 `url`（读取网页）两种模式。
- `analyze_media`：只有配置 Kimi API Key 时可见。

DeepSeek 不直接处理 Kimi 的内置工具协议，也不直接消费 Kimi Formula 的 encrypted output。

### Kimi

Kimi 可以作为主模型。它拥有两类原生能力：

- 联网搜索：通过 `builtin_function.$web_search`。
- 多模态：通过图片/视频 content parts。

Kimi 主模型不需要看到 DeepSeek 专用的 Kimi 辅助工具。Kimi 的联网搜索和多模态由 Kimi provider adapter 在请求构造层处理。

## 工具暴露规则

在工具定义上增加一个可选字段：

```ts
exposeOnlyTo?: "deepseek" | "kimi";
```

语义：

- 缺省：两个主模型都可以看到。
- `"deepseek"`：只暴露给 DeepSeek，且隐含需要 Kimi API Key。
- `"kimi"`：只暴露给 Kimi。首版通常不需要。

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
  if (tool.exposeOnlyTo === "deepseek") return runtime.hasKimiKey;
  return true;
}
```

这个函数可以调整命名和类型，但不应扩展成多层策略框架。等第三个 provider 真正出现后，再重新评估是否抽象 Capability Profile。

## DeepSeek 的 Kimi 辅助工具

DeepSeek 需要的是干净的应用级工具结果，而不是 Kimi 平台协议细节。

三个辅助工具的 Kimi 系统提示词是 executor 内部资产，统一放在：

```txt
packages/agent-core/src/prompt/kimi-assistants/
  web-search.ts
  web-fetch.ts
  analyze-media.ts
```

边界：

- `definition.description` 给 DeepSeek 看，帮助它判断何时调用工具。
- `prompt/kimi-assistants/*` 给 Kimi 辅助调用看，约束 Kimi 如何搜索、摘要或识别。
- 主 Agent 的 `ContextManager` system prompt 不包含这些内部提示词，避免把供应商实现细节暴露给主模型。

### web_search

`web_search` 的实现应是一个很薄的 Kimi 搜索函数：

1. DeepSeek 调用 `web_search({ query })`。
2. executor 读取 `prompts/web-search.ts` 中的系统提示词。
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
- Kimi 调用使用 `prompts/analyze-media.ts` 约束输出结构。
- 图片可由 Kimi Vision 直接处理。
- 视频优先按 Kimi 文件上传协议处理，再用 `ms://file_id` 引用。
- 返回结果必须包含内容摘要、关键细节、限制说明。
- 不把大体积 base64 原文写入 session 或日志。

## Kimi 主模型原生能力

Kimi 主模型不通过 `web_search` wrapper 联网。它的 provider adapter 在请求参数中声明：

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

图片/视频输入也不走 `analyze_media`，而是在 Kimi user message 中构造 content part 数组。这样 Kimi 能直接在主模型上下文中理解多模态输入，不需要把视觉结果先降级为工具文本。

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
  - model。
  - 工具名。
  - 是否配置 Kimi key 的布尔状态。
  - 错误分类。
- 日志不能记录：
  - 密钥。
  - 完整 Authorization header。
  - 大型原始多模态 payload。
  - 未裁剪网页全文。

## 测试原则

- Kimi provider 测试使用 fake client，不依赖真实网络或真实密钥。
- `$web_search` 测试必须覆盖 tool call 回填协议。
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
