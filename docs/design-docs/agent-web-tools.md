# Web 工具设计：web_fetch 与 web_search

本文是 `web_fetch`（URL 精读）与 `web_search`（关键词搜索）两个工具的设计事实来源。

代码位置：

- `packages/agent-core/src/tools/tools/web-fetch/`：`definition.ts`、`executor.ts`、`html-to-markdown.ts`
- `packages/agent-core/src/tools/tools/web-search/`：`definition.ts`、`executor.ts`、`providers.ts`

## 背景：为什么放弃 Kimi-backed web_search

2026-07-06 之前，联网能力由单个 `web_search` 工具承担（`query` / `url` 双模式），内部调用 Kimi 的 builtin `$web_search`（search + crawl），由 Kimi 总结后返回自然语言。实际使用中暴露三个问题：

1. **URL 爬取不可靠**：`$web_search` 本质是搜索工具而非爬虫。给定 URL 时 Kimi 经常搜不到原文，甚至在页面不可达时**幻觉出内容**，主模型无法分辨真假。
2. **嵌套一层 LLM 导致复杂且不可控**：结果质量、token 消耗、时延都取决于 Kimi 的内部行为，无法审计（一次 `web_search` 可能触发多轮 `$web_search` 回填）。
3. **能力与 key 耦合**：搜索必须有 Kimi key，且供应商细节泄漏到了工具层。

因此拆成两个职责单一的工具，**都不经过任何 LLM 中间层**：

| 工具 | 职责 | 依赖 | 暴露条件 |
| --- | --- | --- | --- |
| `web_fetch` | 抓取单个 URL，HTML → Markdown 原样返回 | 无（纯本地 HTTP） | 始终注册 |
| `web_search` | 关键词搜索，返回结构化结果列表 | 外部搜索 API | 至少配置一个搜索 provider key（`hasWebSearchKey`） |

两者配合的模式写进了工具描述与输出里：`web_search` 找到候选 URL → `web_fetch` 精读页面全文。

> Kimi 作为**公开主模型**时也不再挂 provider-native `$web_search`。所有模型的联网搜索统一走本地 `web_search` / `web_fetch` 工具链。

## web_fetch：本地确定性网页抓取

流程：纯 HTTP fetch → charset 探测 → HTML 清洗 → Turndown 转 Markdown。实现参考 claudecode（`getURLMarkdownContent`）、opencode（`webfetch`）与 firecrawl 的 fetch 引擎（仅学习实现思路，不引入其付费服务）。

### 关键决策

- **URL 校验**：仅 http/https；拒绝内嵌凭据（`user:pass@`）；hostname 必须含 `.`（或 localhost）；URL 长度上限 2000。
- **https 升级**：http URL 先尝试升级 https，网络层失败再回退原 http（参考 claudecode）。
- **Cloudflare 403 挑战**：响应头 `cf-mitigated: challenge` 时换诚实 UA（`actspace-agent`）重试一次——TLS 指纹与浏览器 UA 不匹配时，伪装反而更容易被拦（参考 opencode）。
- **charset 探测**：Content-Type header → HTML `<meta charset>` → utf-8 兜底，对 GBK/GB2312 中文老站点尤其重要（参考 firecrawl）。
- **内容类型**：只处理 text-like（text/*、json、xml、javascript）；二进制类型直接报错，不猜。
- **限额**：响应体 5MB、超时 30s、返回 Markdown 上限 50k 字符（head 截断 + 提示行）。
- **缓存**：进程内 15 分钟 TTL、32 条 LRU-ish（满了淘汰最旧插入），同 URL 重复读不重复请求。
- **输出格式**：头部元信息（URL / Title / Content-Type / Fetched at）+ 正文 Markdown；HTML 清洗在 `html-to-markdown.ts`（剔除 script/style/nav/footer 等非正文元素后交给 Turndown）。
- **失败语义**：JS 渲染页（无可读文本）、HTTP 非 2xx、超时均返回带指导的结构化错误，不返回空成功。

## web_search：双通道并行搜索

一次调用并行打两条通道，结果合并；**部分成功也返回**，单通道失败只降级为输出尾部的 Note。

```text
web_search(query)
  ├─ 国内通道：智谱 search_pro（有 key 就参与）
  └─ 国际通道：Tavily → TinyFish → Exa（按优先级取第一个可用）
        └─ ProviderUnavailableError（quota/auth/rate_limit）→ 同一次调用内降级下一家
```

### provider 适配层（providers.ts）

每个 provider 是一个薄适配器：`query → WebSearchResultItem[]`（title/url/snippet/publishedDate），不做任何 LLM 加工。统一 15s 超时、snippet 800 字符截断。

| provider | 通道 | 接口 | 计费 | 选择原因 |
| --- | --- | --- | --- | --- |
| 智谱 Web Search | 国内 | `POST open.bigmodel.cn/api/paas/v4/web_search`（search_pro） | ¥0.03/次按量 | 独立 REST、中文覆盖好、按次计费 |
| Tavily | 国际 P1 | `POST api.tavily.com/search` | 每月 1000 credits 免费 + 按量 | LLM 场景专用、有 `/usage` 额度接口 |
| TinyFish | 国际 P2 | `GET api.search.tinyfish.ai` | 目前免费（按套餐限速） | 免费兜底 |
| Exa | 国际 P3 | `POST api.exa.ai/search` | 按量 | opencode 同款、语义搜索 |

错误分类（`classifyHttpFailure`）：401/403 → `auth`；402/432/433 → `quota`（432/433 是 Tavily 的 plan/PAYG limit 专用码）；429 → `rate_limit`。这三类抛 `ProviderUnavailableError` 触发国际通道降级；其余错误（网络/超时）也降级，但保留错误信息用于整体失败报错。

### 编排（executor.ts）

- `resolveSearchLanes()` 按 env 中已配置的 key 解析两条通道；`Promise.all` 并行执行，通道内部消化自己的失败（不 reject）。
- **国际线为主参考**：输出中国际组排在国内组之前；跨通道按 URL 去重（去掉尾部 `/` 归一）时优先保留国际线条目。理由：中文搜索结果的来源权威性普遍较弱，重复内容以英文来源为准；国际线没覆盖到的中文独有内容仍由智谱补位。
- 分组标题携带渠道特性说明（`PROVIDER_TRAITS`），两通道都有结果时额外标注 `primary`（国际）/`supplementary`（国内），单通道时不标注避免误导。示例：`## tavily (international — primary; LLM-optimized search, high-quality international sources)`、`## zhipu (domestic — supplementary; best Chinese-content coverage; verify source authority before citing)`。
- 头部含 Query/Providers/Searched at，尾部提示用 `web_fetch` 精读。
- 两通道全部失败 → 返回拼接的失败原因；有 key 但 0 结果 → 提示换关键词。
- 完全没有 key 时的兜底错误（防御手动构造 ToolManager 漏传门控）：指导模型告知用户配置任一 provider key，并约束本轮不得重试。

### key 门控与配置链路

- env：`ZHIPU_API_KEY` / `TAVILY_API_KEY` / `TINYFISH_API_KEY` / `EXA_API_KEY`（`packages/agent-core/src/env.ts`）。
- 暴露门控：`ToolRuntimeConfig.hasWebSearchKey`（任一 key 存在即 true），由 `create-agent-deps.ts` 与 `kairos-bootstrap.ts` 注入；`requiresKey: "webSearch"` 在 `exposure.ts` 据此判断。`web_fetch` 无 key 要求，始终注册。
- 设置页：`packages/shared/src/settings.ts` 新增 `SearchProviderId`（zhipu/tavily/tinyfish/exa）与 `SecretProviderId = ProviderId | SearchProviderId`，密钥统一走 `setProviderKey`/`clearProviderKey` IPC，加密落盘后写回 env。设置页「模型」区新增「网络搜索」组，四个 provider 各一行连接/断开。
- Tavily 额度显示：main 进程 `getSearchUsage()` 调 `GET api.tavily.com/usage`，渲染层在 Tavily 已连接时显示「本周期已用 X / Y credits，剩余 Z」。其余 provider 无公开用量接口（TinyFish 免费、智谱/Exa 在各自控制台看账单）。

### 前端预览

两个工具共用 `previewKind: "web_search"`，bridge 层按 toolName 区分 displayText：`Web Fetch <url>` / `Web Search <query>`（`engine/bridge.ts`）。

## 测试约定

- `web-fetch-executor.test.ts`：URL 校验、HTML→Markdown、charset、content-type 拒绝、HTTP 错误、截断、缓存。
- `web-search-executor.test.ts`：mock `resolveSearchLanes`，覆盖双通道并行、国际线降级、URL 去重合并、部分成功、全失败报错、缺 key 兜底。
- `web-search-providers.test.ts`：provider 请求构造、响应映射、HTTP 状态码 → `ProviderUnavailableError` 分类。
- `exposure.test.ts` / `create-agent-deps.test.ts`：`hasWebSearchKey` 门控下 `web_search` 注册与否、`web_fetch` 始终注册。
- 所有测试用 fake fetch / mock，不依赖真实网络与真实密钥。

## 决策记录

- 2026-07-06：拆除 Kimi-backed `web_search`（删除 `searchWithKimi`、`KimiService.streamWithBuiltinWebSearch`、`prompt/kimi-assistants/web-search.ts`），改为 `web_fetch`（本地确定性抓取）+ `web_search`（外部搜索 API）两个独立工具，均不经过 LLM 中间层。
- 2026-07-06：`web_search` 采用双通道并行：国内智谱 + 国际 Tavily → TinyFish → Exa 优先级降级；quota/auth/rate_limit 触发同调用内 failover；结果按来源分组、跨通道 URL 去重（国内优先）。
- 2026-07-06：搜索 key 与 LLM key 统一进 `SecretProviderId` 密钥管理；`web_search` 暴露门控从 `hasKimiKey` 改为 `hasWebSearchKey`。
- 2026-07-09：图片理解不再通过独立 Kimi helper 工具兜底；模型是否接收图片由 `MODEL_REGISTRY.input` 统一声明，具体见 `agent-deepseek-kimi-hybrid-capabilities.md`。
- 2026-07-06：不引入 firecrawl（付费、非按量）与火山引擎搜索（与方舟模型 API 耦合的 server tool，非独立 REST）。
- 2026-07-07：`web_search` 输出以国际线为主参考——国际组排前、去重优先保留国际条目，分组标题附渠道特性说明与 primary/supplementary 标注（双通道有结果时）。放弃「按供应商给结果打静态数字比重」方案：数字权重会让模型直接忽略低分结果，而结果质量实际随 query 语言变化，且国际线内部是 failover（Tavily/TinyFish/Exa 不共存），静态权重只能区分两组，收益薄。描述性说明把判断权留给模型。
