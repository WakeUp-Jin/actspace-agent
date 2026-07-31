# DeepSeek + Kimi 混合能力设计

> 本文仍是当前 DeepSeek / Kimi 已落地行为的事实来源。DeepSeek / Kimi / OpenRouter 多供应商目标态见 `docs/design-docs/model-context/agent-multi-provider-llm.md`；本文历史决策中的“只支持两个 provider”仅代表当时阶段边界，不再约束下一阶段设计。

## 当前状态

本文档是 `actspace` Agent Core 中 DeepSeek 与 Kimi 混合能力接入的设计事实来源。对应 execution plan 为：

- `docs/exec-plans/completed/actspace-deepseek-kimi-hybrid-capabilities.md`

当前仓库的公开主模型为 DeepSeek `deepseek-v4-flash` / `deepseek-v4-pro`，并在 2026-06-08 起把 Kimi `kimi-k2.6` 也提升为公开主模型（`visibility: "public"`），作为 DeepSeek 降智时的备用模型。模型是否支持图片输入只看 `MODEL_REGISTRY.input`：当前 DeepSeek 两档为 `["text"]`，Kimi `kimi-k2.6` 与 `kimi-k2.7-code` 为 `["text", "image"]`。

> 历史说明：在 2026-06-08 之前 Kimi 是 `internal` 模型，不出现在公开选择器，仅作为 DeepSeek 的内部 helper。本文部分小节仍保留当时“Kimi 仅内部”的描述作为背景，但权威结论以「当前状态」与「决策记录」最新条目为准。

当前 LLM 分层以 `api` 而不是品牌 service 为主线：

- `AnthropicMessagesService`：通用 Anthropic Messages 协议实现层；不再承接内置 DeepSeek 模型。
- `OpenAICompletionsService`：OpenAI Chat Completions 协议实现层，承接当前 DeepSeek 与 Kimi 普通调用。
- `KimiService`：兼容包装层，只兜底 Kimi 的 provider 默认值；普通对话复用 `OpenAICompletionsService`。
- `DeepSeekService` / `DeepSeekAnthropicService`：兼容包装层，只兜底 provider 默认值；协议职责归属 `OpenAICompletionsService` / `AnthropicMessagesService`。

2026-07-31 起，DeepSeek 内置模型与 provider 固定走 OpenAI-compatible Chat Completions，默认 Base URL 为 `https://api.deepseek.com`。主 Agent 默认模型仍为 `deepseek-v4-pro`，Kairos 默认模型仍为 `deepseek-v4-flash`；两者默认开启 Thinking，并显式使用 `reasoning_effort=max`。Composer 只提供 `High` / `Max` 两档，不提供 Auto。旧 `DEEPSEEK_API_FORMAT` / `DEEPSEEK_ANTHROPIC_BASE_URL` 已退出运行时配置，精确的官方 `/anthropic` 设置地址会迁移回 provider 默认根地址。

2026-07-06 起，DeepSeek 的联网搜索不再使用 provider-native server tool `web_search_20250305`。原因：DeepSeek Anthropic 网关在「server 搜索 + 本地工具混用」的轮次会稳定触发 DSML 泄漏（模型的本地工具调用被当正文吐出），导致整轮失败且自动重试无效。移除 server tool 后所有工具调用统一走标准 `tool_use` 链路，泄漏触发器消失。

同日晚些时候，Kimi-backed 的本地 `web_search`（`searchWithKimi` 借道 `$web_search` 做 search + crawl）也被拆除——`$web_search` 对给定 URL 爬取不可靠、页面不可达时会幻觉内容，且嵌套一层 LLM 导致质量与 token 消耗不可控。现在联网能力由两个不依赖 Kimi 的独立工具承担：`web_fetch`（本地确定性抓取转 Markdown，始终注册）与 `web_search`（智谱 + Tavily/TinyFish/Exa 双通道外部搜索 API，任一搜索 key 存在时注册）。设计事实来源见 `docs/design-docs/tool-system/agent-web-tools.md`。

2026-07-09 起，Kimi 不再作为 DeepSeek 的隐藏多模态 helper。`analyze_media` 工具与图片预分析链路已删除；如果当前主模型 `input` 不包含 `image`，Agent 不会偷偷调用 Kimi 代看图片，而是在用户消息后缀注入最小 runtime model 状态并明确要求模型不要做视觉判断。用户需要视觉能力时应切换到 `input` 包含 `image` 的模型。

## 设计目标

- 公开 UI 让用户在 DeepSeek `deepseek-v4-flash` / `deepseek-v4-pro` 与 Kimi `kimi-k2.6` 之间选择；Kimi 作为 DeepSeek 降智时的备用主模型。
- Kimi 作为主模型时也不挂 provider-native `$web_search`；联网搜索统一由本地 `web_search` / `web_fetch` 工具承担。
- 跨模型续聊：DeepSeek 与 Kimi 当前都走 OpenAI-compatible；`transform-messages` 仍负责 thinking 降级、tool call id/signature 标准化和历史 Anthropic 消息兼容，避免旧会话或后续跨协议模型切换崩溃。
- 联网搜索与网页读取由独立的 `web_search` / `web_fetch` 工具承担（见 `docs/design-docs/tool-system/agent-web-tools.md`），不依赖 Kimi key。
- 图片输入按 `MODEL_REGISTRY.input` 显式路由：支持 `image` 的主模型直接接收图片 content parts；不支持 `image` 的主模型只接收附件元信息和“不应做视觉判断”的文本提示。
- 供应商细节不泄露给主模型。DeepSeek 不需要知道 `$web_search`、`moonshot/web-search:latest` 或 `kimi-k2.6`。
- 首版不引入复杂 Capability Router，只使用工具定义上的轻量暴露属性和少量 provider 判断。

## 非目标

- 不支持第三个真实 provider。
- 不做通用模型能力市场。
- 不把 Kimi Formula 作为首版统一工具平台。
- 不把 Kimi Formula `web-search` 的 encrypted output 直接返回给 DeepSeek。
- 不把 Kimi 原生能力强行注册成普通 ToolManager 工具。
- 不再使用 Kimi 主模型的 provider-native `$web_search`；搜索能力统一收敛到 ToolManager 管理的 `web_search` / `web_fetch`。
- 不引入新的 Agent runtime 来承载搜索子代理。

## 核心模型

系统中有三层边界：

1. **模型元数据层**
   - `MODEL_REGISTRY` 区分 `api`、`provider`、`visibility`、`input`。
   - `api` 决定协议服务：`anthropic-messages` 或 `openai-completions`。
   - `provider` 决定供应商身份、凭据和默认 base URL：`deepseek` 或 `kimi`。
   - `input` 决定模型能否接收 `image` content parts，是 Browser Use / Computer Use / 附件图片路由的唯一事实来源。
   - `visibility` 决定是否出现在公开 UI；DeepSeek 两档与 Kimi `kimi-k2.6` 当前均为 `public`。

2. **协议服务层**
   - 由 `AnthropicMessagesService` / `OpenAICompletionsService` 实现 provider-neutral `LLMService`。
   - 消息转换、工具转换、usage 归一、流式事件组装都归协议服务和对应 convert 模块。
   - 品牌包装层不再承载协议转换职责，只做兼容入口。

3. **能力包装层**
   - Provider 原生能力由协议服务在请求构造层处理；DeepSeek server web search 与 Kimi `$web_search` 均已移除，联网搜索统一走本地工具。
   - 应用级工具由 ToolManager 暴露给主模型，例如 `read_file`、`grep`、`glob`、`web_search`、`web_fetch`。

这些层级不能混在一起。`api` 解决“用哪套协议和消息转换”的问题；`provider` 解决“用哪个供应商身份和凭据”的问题；应用级工具解决“主模型能在 actspace 中做什么”的问题。

## Provider 角色

### DeepSeek

DeepSeek 是低成本主力模型。它应看到稳定、供应商无关的工具。当前只有一条内置运行路线：

**OpenAI-compatible 路线**

- 内置模型和 provider 固定选择 `openai-completions`，无需协议开关。
- 普通对话由 `OpenAICompletionsService` 处理；`DeepSeekService` 只保留为兼容包装入口。
- Thinking 开关映射为 `thinking: { type: "enabled" | "disabled" }`；开启时强度只允许 `reasoning_effort: "high" | "max"`，默认显式发送 `max`。
- 本地文件工具与 `web_fetch`：默认可见。
- `web_search`：任一搜索 provider key（智谱 / Tavily / TinyFish / Exa）存在时可见，与 Kimi key 无关（见 `docs/design-docs/tool-system/agent-web-tools.md`）。
- DeepSeek 当前模型元数据声明为 `input: ["text"]`，不能接收图片附件或 Computer Use 截图。Browser Use / Computer Use 的提示词应根据 `<runtime_model>.input` 选择策略：支持 `image` 时可直接使用截图；text-only 时优先 DOM、accessibility tree、URL、可见文本和结构化状态，必要时请用户切换到 image-capable 模型。

DeepSeek 不直接处理 Kimi 的内置工具协议，也不直接消费 Kimi Formula 的 encrypted output。

**Anthropic-compatible 路线（历史兼容）**

- 内置 DeepSeek 模型、provider 注册表和 env 已不再选择该路线。
- 由 `AnthropicMessagesService` 使用 Anthropic Messages API 真流式（`client.messages.stream`）调用 DeepSeek，逐增量转发 text/thinking/tool_use，结束后由流式累加器组装最终消息。
- `DeepSeekAnthropicService` 只保留为兼容包装层，不再是协议职责事实来源。
- 2026-07-06 起不再声明 server tool `web_search_20250305`；联网搜索与 OpenAI-compatible 路线一致，走独立的 `web_search` / `web_fetch` 工具（搜索 key 门控见 `docs/design-docs/tool-system/agent-web-tools.md`）。历史 session 中的 `server_tool_use` / `web_search_tool_result` 响应块仍按 provider 响应块处理，不映射成本地工具事件。
- `usage.serverToolUse` 字段保留，用于兼容历史 provider-native server tool 用量；当前主线搜索不再写入该字段。
- 本地工具通过 Anthropic client tools 暴露：provider-neutral `Tool` 会转成 `name/description/input_schema`，模型返回的 `tool_use` 会转成内部 `ToolCallContent`，工具执行结果会在下一轮转成 user `tool_result` 回放。

### Kimi

Kimi 自 2026-06-08 起既是公开主模型（`kimi-k2.6`，`visibility: "public"`），又继续作为 DeepSeek 的内部 helper provider，两类用途共用同一份模型元数据。

Kimi 主模型能力：

- 多模态：通过图片/视频 content parts。

普通 Kimi OpenAI-compatible 调用复用 `OpenAICompletionsService`。`KimiService` 只是兼容包装层（provider 默认值兜底）；`searchWithKimi`、`streamWithBuiltinWebSearch` 与 Kimi 主模型 provider-native `$web_search` 回填循环均已移除。

**Kimi 主模型的 thinking 参数策略**：仅当用户显式开启 Thinking（`options.thinkingEnabled === true`）时发送 `thinking: { type: "enabled" }`，思考增量经 `reasoning_content` → `thinking_delta` 正常显示。关闭或未传 Thinking 时不发送 `thinking` 字段，不再发送 `thinking: { type: "disabled" }`。

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

当前使用：`web_search` 声明 `requiresKey: "webSearch"`（任一搜索 provider key 存在即注册，与主模型无关）；`web_fetch` 无门控。这个函数不应扩展成多层策略框架，等第三个 provider 真正出现后，再重新评估是否抽象 Capability Profile。

## 图片输入与 runtime model 状态

每轮用户输入会追加最小模型状态后缀：

```xml
<runtime_model>
model_id: deepseek-v4-pro
input: text
</runtime_model>
```

或：

```xml
<runtime_model>
model_id: kimi-k2.6
input: text,image
</runtime_model>
```

该后缀只表达当前模型事实，不写 Browser Use / Computer Use 策略。工具、Skill 或系统提示词中的 Browser Use / Computer Use 指南应读取 `<runtime_model>.input`：

- `input` 包含 `image`：可把截图作为视觉观察输入，模型可以直接基于截图判断 UI。
- `input` 只有 `text`：不得基于截图做视觉判断；Browser Use 应优先 DOM / accessibility tree / URL / 可见文本 / 结构化 browser state；Computer Use 的纯视觉任务应要求用户切到 image-capable 模型。

图片附件的原始文件内容不写入 session。支持图片的模型在 turn 边界临时把本地图片读成 data URL 放入 LLM 请求；持久化的 `user_message.payload.attachments` 只保存附件元信息和预览 URL。

工具返回图片也走同一类结构化 content part，而不是把图片当普通文本或 base64 dump 塞回上下文。`read_file` 读取支持的图片文件时会返回 text + image content；bash 前台输出如果是完整 `data:image/...;base64,...`，执行循环会保留 image content。OpenAI-compatible 路线会保留原 `tool` 文本结果用于 tool-call 对账，并追加一条 user visual observation 承载图片；Anthropic-compatible 路线可在 `tool_result` block 内直接携带图片。

## Kimi 内部 helper 原生能力

Kimi provider-native `builtin_function.$web_search` 不再使用。联网搜索统一走本地 `web_search` / `web_fetch` 工具，避免 provider 隐式回填循环与本地工具链分叉。

## DeepSeek Anthropic 路线与联网搜索（历史：主线已退休）

> 该节记录 2026-07-31 之前的兼容实现。当前内置 DeepSeek 已固定使用 OpenAI Chat Completions；Anthropic service、转换器与 DSML guard 仅为通用协议能力、历史测试和旧记录保留。

配置方式：

```env
# 当前唯一路线
DEEPSEEK_BASE_URL=https://api.deepseek.com
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

因此首版选择 Kimi `$web_search` + Kimi 自然语言总结，再返回给 DeepSeek（该方案已于 2026-07-06 被独立 web 工具取代，见 `docs/design-docs/tool-system/agent-web-tools.md`；本节保留作历史决策背景）。

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
- DeepSeek OpenAI-compatible 请求测试必须覆盖默认 Max、显式 High 和关闭 Thinking；历史 Anthropic service 测试继续使用 fake SDK client，不依赖真实网络或真实密钥。
- Anthropic route 测试必须覆盖请求中**不**声明 server tool（tools 只含 client tools、`web_search` 只出现一次），以及历史 `server_tool_use` / `web_search_tool_result` 响应块不被误映射成本地工具调用。
- DSML 泄漏兜底测试必须覆盖：裸 DSML tool-call 标记被识别为可重试 `server_error` 且不落库；正常正文与含 “DSML” 词的普通正文不被误判。
- Kimi 主模型测试必须覆盖：默认不声明 builtin `$web_search`，关闭或未传 Thinking 时不发送 `thinking: disabled`，显式开启 Thinking 时发送 `thinking: enabled`。
- `web_search` / `web_fetch` 工具测试约定见 `docs/design-docs/tool-system/agent-web-tools.md`。
- 附件图片测试必须覆盖：image-capable 模型收到结构化 image content part；text-only 模型只收到附件元信息和 runtime model 状态。
- 工具暴露测试必须覆盖：
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
- 2026-07-06（同日后续）：拆除 Kimi-backed `web_search`。`$web_search` 对给定 URL 爬取不可靠（页面不可达时幻觉内容），且嵌套一层 LLM 导致质量与 token 消耗不可控。联网能力改由独立工具承担：`web_fetch`（本地确定性抓取，始终注册）+ `web_search`（智谱 + Tavily/TinyFish/Exa 双通道外部搜索 API，`requiresKey: "webSearch"` 门控）。删除 `searchWithKimi`、`KimiService.streamWithBuiltinWebSearch`、`prompt/kimi-assistants/web-search.ts`；`analyze_media` 显式声明 `requiresKey: "kimi"`。Kimi 主模型的 provider-native `$web_search` 不受影响。设计事实来源迁至 `docs/design-docs/tool-system/agent-web-tools.md`。
- 2026-07-09：删除 `analyze_media` 工具、Kimi media helper 和附件图片预分析链路。模型多模态能力改由 `MODEL_REGISTRY.input` 显式声明：支持 `image` 的主模型直接接收 image content parts；不支持 `image` 的主模型不再隐式调用 Kimi，只接收附件元信息和 runtime model 后缀。DeepSeek 未来支持图片时，只需把对应模型的 `input` 调整为 `["text", "image"]` 并验证 provider 协议即可启用图片输入。
- 2026-07-09（同日后续）：Kimi 主模型不再挂 provider-native `$web_search`，联网搜索统一使用本地 `web_search` / `web_fetch` 工具。Kimi OpenAI-compatible 请求也不再发送 `thinking: { type: "disabled" }`；只有显式开启 Thinking 时才发送 `thinking: { type: "enabled" }`，避免 `kimi-k2.7-code` 这类只接受 enabled 的模型被 disabled 参数拦截。
- 2026-07-31：DeepSeek 内置模型与 provider 从 Anthropic Messages 主线迁移到 OpenAI Chat Completions；移除运行时协议开关与 Anthropic 专用 env，精确迁移旧官方 `/anthropic` 设置。Thinking 只提供 High / Max，默认显式 Max；通用 Anthropic 协议实现与历史测试继续保留。
