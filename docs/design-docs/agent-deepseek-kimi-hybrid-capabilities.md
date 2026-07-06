# DeepSeek + Kimi 混合能力设计

## 当前状态

本文档是 `actspace` Agent Core 中 DeepSeek 与 Kimi 混合能力接入的设计事实来源。对应 execution plan 为：

- `docs/exec-plans/completed/actspace-deepseek-kimi-hybrid-capabilities.md`

当前仓库的公开主模型为 DeepSeek `deepseek-v4-flash` / `deepseek-v4-pro`，并在 2026-06-08 起把 Kimi `kimi-k2.6` 也提升为公开主模型（`visibility: "public"`），作为 DeepSeek 降智时的备用模型。Kimi 同时仍承担 DeepSeek 的搜索、多模态等内部 helper 能力——这两类用途共用同一份模型元数据。

> 历史说明：在 2026-06-08 之前 Kimi 是 `internal` 模型，不出现在公开选择器，仅作为 DeepSeek 的内部 helper。本文部分小节仍保留当时“Kimi 仅内部”的描述作为背景，但权威结论以「当前状态」与「决策记录」最新条目为准。

当前 LLM 分层以 `api` 而不是品牌 service 为主线：

- `AnthropicMessagesService`：Anthropic Messages 协议实现层，承接 DeepSeek 默认路线。
- `OpenAICompletionsService`：OpenAI Chat Completions 协议实现层，承接 OpenAI-compatible fallback 和普通 Kimi 内部调用。
- `KimiService`：兼容包装层，只兜底 Kimi 的 provider 默认值；普通对话复用 `OpenAICompletionsService`（Kimi 主模型的 `$web_search` 回填循环也在协议服务主入口内实现）。
- `DeepSeekService` / `DeepSeekAnthropicService`：兼容包装层，只兜底 provider 默认值；协议职责归属 `OpenAICompletionsService` / `AnthropicMessagesService`。

2026-05-29 后，DeepSeek 默认走 Anthropic-compatible 路线：主 Agent 默认模型为 `deepseek-v4-pro` 且默认开启 thinking；Kairos 默认模型独立为 `deepseek-v4-flash` 且默认开启 thinking。两条链路都会用 Anthropic Messages API。原有 OpenAI-compatible 路线继续保留，可通过 `DEEPSEEK_API_FORMAT=openai` 显式回退。

2026-07-06 起，DeepSeek 的联网搜索不再使用 provider-native server tool `web_search_20250305`。原因：DeepSeek Anthropic 网关在「server 搜索 + 本地工具混用」的轮次会稳定触发 DSML 泄漏（模型的本地工具调用被当正文吐出），导致整轮失败且自动重试无效。移除 server tool 后所有工具调用统一走标准 `tool_use` 链路，泄漏触发器消失。

同日晚些时候，Kimi-backed 的本地 `web_search`（`searchWithKimi` 借道 `$web_search` 做 search + crawl）也被拆除——`$web_search` 对给定 URL 爬取不可靠、页面不可达时会幻觉内容，且嵌套一层 LLM 导致质量与 token 消耗不可控。现在联网能力由两个不依赖 Kimi 的独立工具承担：`web_fetch`（本地确定性抓取转 Markdown，始终注册）与 `web_search`（智谱 + Tavily/TinyFish/Exa 双通道外部搜索 API，任一搜索 key 存在时注册）。设计事实来源见 `agent-web-tools.md`。Kimi 保留的 DeepSeek 辅助能力只剩 `analyze_media`（多模态）。

## 设计目标

- 公开 UI 让用户在 DeepSeek `deepseek-v4-flash` / `deepseek-v4-pro` 与 Kimi `kimi-k2.6` 之间选择；Kimi 作为 DeepSeek 降智时的备用主模型。
- Kimi 同时继续作为内部 helper 能力（DeepSeek 的多模态 `analyze_media`），与公开主模型用途共用元数据。
- Kimi 作为主模型时，联网搜索由 Kimi provider-native `$web_search` 在 LLM service 层承担（本地 `web_search`/`web_fetch` 工具按各自门控正常注册）。
- 跨模型续聊：DeepSeek（Anthropic）与 Kimi（OpenAI-compatible）之间切换由 `transform-messages` 归一兜底（thinking 降级为文本、tool call id/signature 标准化），避免格式不兼容导致崩溃。
- 联网搜索与网页读取由独立的 `web_search` / `web_fetch` 工具承担（见 `agent-web-tools.md`），不依赖 Kimi key；配置了 Kimi API Key 时额外补齐多模态识别（`analyze_media`）。
- 供应商细节不泄露给主模型。DeepSeek 不需要知道 `$web_search`、`moonshot/web-search:latest` 或 `kimi-k2.6`。
- 首版不引入复杂 Capability Router，只使用工具定义上的轻量暴露属性和少量 provider 判断。

## 非目标

- 不支持第三个真实 provider。
- 不做通用模型能力市场。
- 不把 Kimi Formula 作为首版统一工具平台。
- 不把 Kimi Formula `web-search` 的 encrypted output 直接返回给 DeepSeek。
- 不把 Kimi 原生能力强行注册成普通 ToolManager 工具。
- 不把 Kimi 主模型的 `$web_search` 注册成普通 ToolManager 工具（仍由 LLM service 层在请求构造时声明并内部回填）。
- 不引入新的 Agent runtime 来承载搜索子代理。

## 核心模型

系统中有三层边界：

1. **模型元数据层**
   - `MODEL_REGISTRY` 区分 `api`、`provider`、`visibility`。
   - `api` 决定协议服务：`anthropic-messages` 或 `openai-completions`。
   - `provider` 决定供应商身份、凭据和默认 base URL：`deepseek` 或 `kimi`。
   - `visibility` 决定是否出现在公开 UI；DeepSeek 两档与 Kimi `kimi-k2.6` 当前均为 `public`。

2. **协议服务层**
   - 由 `AnthropicMessagesService` / `OpenAICompletionsService` 实现 provider-neutral `LLMService`。
   - 消息转换、工具转换、usage 归一、流式事件组装都归协议服务和对应 convert 模块。
   - 品牌包装层不再承载协议转换职责，只做兼容入口。

3. **能力包装层**
   - Provider 原生能力由协议服务在请求构造层处理，例如 Kimi 主模型的 `$web_search`（DeepSeek server web search 已于 2026-07-06 移除）。
   - 应用级工具由 ToolManager 暴露给主模型，例如 `read_file`、`grep`、`glob`、`web_search`、`web_fetch`、`analyze_media`。

这些层级不能混在一起。`api` 解决“用哪套协议和消息转换”的问题；`provider` 解决“用哪个供应商身份和凭据”的问题；应用级工具解决“主模型能在 actspace 中做什么”的问题。

## Provider 角色

### DeepSeek

DeepSeek 是低成本主力模型。它应看到稳定、供应商无关的工具。当前有两条实现路线：

**OpenAI-compatible 路线（显式回退）**

- 通过 `DEEPSEEK_API_FORMAT=openai` 启用。
- 普通对话由 `OpenAICompletionsService` 处理；`DeepSeekService` 只保留为兼容包装入口。
- 本地文件工具与 `web_fetch`：默认可见。
- `web_search`：任一搜索 provider key（智谱 / Tavily / TinyFish / Exa）存在时可见，与 Kimi key 无关（见 `agent-web-tools.md`）。
- `analyze_media`：只有配置 Kimi API Key 时可见。

DeepSeek 不直接处理 Kimi 的内置工具协议，也不直接消费 Kimi Formula 的 encrypted output。

**Anthropic-compatible 路线**

- 当前 DeepSeek 默认 API 路线，主 Agent 与 Kairos 都会沿用；主 Agent 默认模型为 `deepseek-v4-pro`，Kairos 默认模型为 `deepseek-v4-flash`。
- 由 `AnthropicMessagesService` 使用 Anthropic Messages API 真流式（`client.messages.stream`）调用 DeepSeek，逐增量转发 text/thinking/tool_use，结束后由流式累加器组装最终消息。
- `DeepSeekAnthropicService` 只保留为兼容包装层，不再是协议职责事实来源。
- 2026-07-06 起不再声明 server tool `web_search_20250305`；联网搜索与 OpenAI-compatible 路线一致，走独立的 `web_search` / `web_fetch` 工具（搜索 key 门控见 `agent-web-tools.md`）。历史 session 中的 `server_tool_use` / `web_search_tool_result` 响应块仍按 provider 响应块处理，不映射成本地工具事件。
- `usage.serverToolUse` 字段保留（Kimi 主模型内部 `$web_search` 仍在使用），DeepSeek 轮次此计数恒为 0。
- 本地工具通过 Anthropic client tools 暴露：provider-neutral `Tool` 会转成 `name/description/input_schema`，模型返回的 `tool_use` 会转成内部 `ToolCallContent`，工具执行结果会在下一轮转成 user `tool_result` 回放。

### Kimi

Kimi 自 2026-06-08 起既是公开主模型（`kimi-k2.6`，`visibility: "public"`），又继续作为 DeepSeek 的内部 helper provider，两类用途共用同一份模型元数据。

Kimi 原生能力：

- 联网搜索：通过 `builtin_function.$web_search`。
- 多模态：通过图片/视频 content parts。

普通 Kimi OpenAI-compatible 调用复用 `OpenAICompletionsService`。`KimiService` 只是兼容包装层（provider 默认值兜底）；`searchWithKimi` 与 `streamWithBuiltinWebSearch` 已随 Kimi-backed web search 一并移除，`$web_search` 仅在 Kimi 作为公开主模型时由协议服务主入口使用。

**Kimi 主模型的 thinking 与联网搜索互斥**：Kimi K2.6 的 `$web_search` 要求禁用 thinking（`thinking.type: "disabled"`），而 K2.6 的深度思考走 `thinking.type: "enabled"` 且结果在流式 `reasoning_content` 字段。二者不能同时开，因此主入口按用户的 thinking 开关二选一：

- 用户**开启** Thinking（`options.thinkingEnabled === true`）：发 `thinking: { type: "enabled" }`，**不挂** `$web_search`，思考增量经 `reasoning_content` → `thinking_delta` 正常显示。
- 用户**关闭** Thinking（默认，`thinkingDefault: false`）：挂 `builtin_function.$web_search` 并发 `thinking: { type: "disabled" }`，走下面的回填循环。

**Kimi 作为公开主模型时的联网搜索**：当 Thinking 关闭时，`OpenAICompletionsService` 的主入口 `stream(context)` 检测到 `provider === "kimi"` 会在请求里追加 `builtin_function.$web_search`，然后在 service 内部完成 `$web_search` 的回填循环：

1. 模型本轮只触发 `$web_search`（无本地工具调用）时，把 assistant 的 tool_calls + 原样 arguments 作为 `role:tool` 追加进消息序列，再次请求；
2. builtin `$web_search` 的 `tool_call_delta` 不向上层（agent loop / UI）暴露，避免被当成本地工具调用；
3. 跨轮 usage 累加，搜索次数记入 `usage.serverToolUse.webSearchRequests`（与 DeepSeek server web search 对齐）；
4. 设有最大回填轮数兜底，异常时不死循环。

这条路径只在主 Agent 入口启用；`streamMessages` 等 helper 路径保持原有单次行为，不触发内部循环。

## 工具暴露规则

工具定义上有两个可选门控字段：

```ts
exposeOnlyTo?: "deepseek" | "kimi";        // 主模型范围；缺省 = 两个主模型都可见
requiresKey?: "kimi" | "webSearch";        // 依赖的外部 key；缺 key 时不注册
```

筛选逻辑保持简单（`tools/exposure.ts`）：

```ts
function shouldExposeTool(spec, runtime) {
  if (spec.exposeOnlyTo && spec.exposeOnlyTo !== runtime.primaryProvider) return false;
  if (spec.requiresKey === "kimi" && !runtime.hasKimiKey) return false;
  if (spec.requiresKey === "webSearch" && !runtime.hasWebSearchKey) return false;
  return true;
}
```

当前使用：`analyze_media` 声明 `exposeOnlyTo: "deepseek"` + `requiresKey: "kimi"`；`web_search` 只声明 `requiresKey: "webSearch"`（任一搜索 provider key 存在即注册，与主模型无关）；`web_fetch` 无门控。这个函数不应扩展成多层策略框架，等第三个 provider 真正出现后，再重新评估是否抽象 Capability Profile。

## DeepSeek 的 Kimi 辅助工具

DeepSeek 需要的是干净的应用级工具结果，而不是 Kimi 平台协议细节。

Kimi 系统提示词是 executor 内部资产，统一放在：

```txt
packages/agent-core/src/prompt/kimi-assistants/
  analyze-media.ts
```

边界：

- `definition.description` 给 DeepSeek 看，帮助它判断何时调用工具。
- `prompt/kimi-assistants/*` 给 Kimi 辅助调用看，约束 Kimi 如何识别。
- 主 Agent 的 `ContextManager` system prompt 不包含这些内部提示词，避免把供应商实现细节暴露给主模型。

### web_search / web_fetch（已迁出 Kimi）

> **2026-07-06 起联网搜索与网页读取不再是 Kimi 辅助工具**。`searchWithKimi`、`prompt/kimi-assistants/web-search.ts` 已删除；两能力由独立工具承担：`web_fetch`（本地确定性抓取转 Markdown）与 `web_search`（智谱 + Tavily/TinyFish/Exa 双通道外部搜索 API）。设计事实来源见 `agent-web-tools.md`。当前 Kimi 辅助工具只剩 `analyze_media`。

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

Kimi 内部 helper（当前只剩多模态）不通过 ToolManager 再包装一层 Kimi-only 普通工具：图片/视频输入在 Kimi helper 的 user message 中构造 content part 数组，Kimi 在内部辅助调用里直接理解多模态输入，再把结果降级成 DeepSeek 可读的工具结果。

`builtin_function.$web_search`（声明时须同时 `thinking: { type: "disabled" }`）现在只在 Kimi 作为**公开主模型**时由协议服务主入口使用，不再作为内部 helper 能力。

## DeepSeek Anthropic 路线与联网搜索（历史：server web search 已移除）

> **2026-07-06 起 DeepSeek 不再使用 Anthropic server web search**。原因：DeepSeek Anthropic 网关在「server 搜索 + 本地工具混用」的轮次会稳定把模型的本地工具调用以 DSML 标记文本泄漏成正文（见决策记录 2026-06-08 / 2026-07-06），整轮失败且自动重试无效。联网搜索改走本地 `web_search` 工具（当前实现为外部搜索 API 双通道，见 `agent-web-tools.md`）；DSML guard 与 LLM 自动重试保留作二道防线。

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
- `AnthropicMessagesService` 负责把 `Context` 转成 Anthropic `system/messages/tools`；请求 tools 只包含 client tools，不再追加 provider-native server tool。
- `LLMConfig.provider="deepseek"` 只提供供应商身份、密钥和默认 base URL，不决定消息转换算法。
- Anthropic adapter 转换用户文本、图片、assistant 文本、带签名的 thinking、本地 `toolCall` 和本地 `toolResult`。
- assistant `ToolCallContent` 回放为 Anthropic `tool_use`；internal `ToolResultMessage` 回放为 user `tool_result`。
- 历史 session 中的 server `server_tool_use`、`web_search_tool_result` 响应块仍只作为 provider 响应块处理，不映射成本地 ToolManager 事件。
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

因此首版选择 Kimi `$web_search` + Kimi 自然语言总结，再返回给 DeepSeek（该方案已于 2026-07-06 被独立 web 工具取代，见 `agent-web-tools.md`；本节保留作历史决策背景）。

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
- DeepSeek Anthropic service 测试使用 fake SDK client，不依赖真实网络或真实密钥。
- Anthropic route 测试必须覆盖请求中**不**声明 server tool（tools 只含 client tools、`web_search` 只出现一次），以及历史 `server_tool_use` / `web_search_tool_result` 响应块不被误映射成本地工具调用。
- DSML 泄漏兜底测试必须覆盖：裸 DSML tool-call 标记被识别为可重试 `server_error` 且不落库；正常正文与含 “DSML” 词的普通正文不被误判。
- Kimi 主模型 `$web_search` 测试必须覆盖：主入口声明 builtin `$web_search` 且禁用 thinking；`$web_search` 回填循环在 service 内部完成、不向 agent loop 暴露 builtin tool_call、跨轮 usage 累加并记入 `serverToolUse.webSearchRequests`。
- `web_search` / `web_fetch` 工具测试约定见 `agent-web-tools.md`。
- `analyze_media` 测试必须验证多模态 content part 保持结构化数组，不被字符串化。
- 工具暴露测试必须覆盖：
  - `analyze_media`：DeepSeek 有/无 Kimi key、Kimi 主模型。
  - `web_search`：有/无搜索 provider key（与 Kimi key 无关）。

## 决策记录

- 2026-05-24：DeepSeek 与 Kimi 是首版仅支持的两个真实 provider。这个限制能保持实现集中，避免过早抽象。
- 2026-05-24：工具定义使用 `exposeOnlyTo?: "deepseek" | "kimi"` 表达主模型暴露范围。字段缺省表示两个模型都可用。
- 2026-05-24：DeepSeek 专用 Kimi 辅助工具隐含需要 Kimi API Key。缺 key 时不注册这些工具，而不是把失败工具暴露给模型反复调用。
- 2026-05-24：Kimi 原生 `$web_search` 和多模态输入由 Kimi provider adapter 管理，不进入普通 ToolManager。
- 2026-05-24：首版 DeepSeek 搜索工具调用 Kimi `$web_search` 并返回自然语言摘要与 sources，不直接消费 Formula `web-search` 的 protected/encrypted 结果。
- 2026-05-24：Kimi 辅助调用的三个系统提示词作为工具 executor 内部资产独立版本化；2026-05-25 起统一集中到 `packages/agent-core/src/prompt/kimi-assistants/`。
- 2026-06-08：把 `kimi-k2.6` 提升为公开主模型（`visibility: "public"` + CNY 计价），作为 DeepSeek 降智时的备用模型。Explore 子代理与 Kairos 自主模式也放出 Kimi 选项（默认仍是便宜的 DeepSeek Flash，UI 提示 Kimi 偏贵，Kairos 依赖既有额度护栏控成本）。
- 2026-06-08：Kimi 主模型联网搜索走 provider-native `$web_search`，在 `OpenAICompletionsService` 主入口内部完成回填循环，不经过 ToolManager、不暴露本地 `web_search`，与 DeepSeek server web search 的“原生能力归 service 层”原则一致。
- 2026-06-08：DeepSeek Anthropic 网关偶发把模型原生 DSML tool-call 标记泄漏成正文（未转成结构化 tool_use），`AnthropicMessagesService` 检测到 `acc.toolCalls 为空但正文含 ｜｜DSML｜｜tool_calls/invoke` 时，按可重试 `server_error` 处理并丢弃裸标记正文（保留 usage），而不是把垃圾正文落库展示。
- 2026-06-08：Kimi K2.6 的 thinking 与 `$web_search` 互斥（搜索要求禁用 thinking）。主入口按用户 Thinking 开关二选一：开 → `thinking: enabled` 且不挂搜索（思考走 `reasoning_content`）；关 → 挂 `$web_search` 且 `thinking: disabled`。聊天框 Thinking 默认关（`thinkingDefault: false`），即默认带联网搜索，用户可手动切到思考模式。
- 2026-07-06：移除 DeepSeek Anthropic 路线的 server tool `web_search_20250305`。实测（session-mr8mkw9b-in655o）server 搜索与本地工具混用的轮次会稳定触发网关 DSML 泄漏，自动重试三次全部失败；移除后所有工具调用统一走标准 `tool_use` 链路，泄漏触发器消失。联网搜索两条 DeepSeek 路线统一走 Kimi-backed 本地 `web_search`（`query`/`url` 双模式，`$web_search` 内置 search + crawl），暴露规则回归纯 `hasKimiKey` 门控。DSML guard 与 LLM 自动重试保留作二道防线。
- 2026-07-06：无 Kimi key 时 `web_search` 与 `analyze_media` 一致——不注册工具；executor 内保留缺 key 兜底错误（配置指导 + 本轮禁止重试约束），防御手动构造 ToolManager 漏传门控的情况。前端 `web_search` 两种模式统一显示 `Web Search <query 或 url>`。
- 2026-07-06（同日后续）：拆除 Kimi-backed `web_search`。`$web_search` 对给定 URL 爬取不可靠（页面不可达时幻觉内容），且嵌套一层 LLM 导致质量与 token 消耗不可控。联网能力改由独立工具承担：`web_fetch`（本地确定性抓取，始终注册）+ `web_search`（智谱 + Tavily/TinyFish/Exa 双通道外部搜索 API，`requiresKey: "webSearch"` 门控）。删除 `searchWithKimi`、`KimiService.streamWithBuiltinWebSearch`、`prompt/kimi-assistants/web-search.ts`；`analyze_media` 显式声明 `requiresKey: "kimi"`。Kimi 主模型的 provider-native `$web_search` 不受影响。设计事实来源迁至 `agent-web-tools.md`。
