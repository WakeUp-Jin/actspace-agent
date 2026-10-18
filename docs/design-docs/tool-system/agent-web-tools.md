# Web 工具设计：web_fetch 与 web_search

本文是当前 v2 的 `web_fetch`、`web_search` 与 Chat 模式 `web` 门面的事实来源；2026-10-18 对照实现校准。

## 工具职责与模式

| 工具 | 职责 | 执行依赖 |
| --- | --- | --- |
| `web_fetch` | 抓取 URL，将 HTML 转为 Markdown | Host 网络端口，无搜索 Key 要求 |
| `web_search` | 关键词搜索，返回结构化来源列表 | 至少一个已配置搜索 Provider |
| `web` | `action=search` 复用搜索，`action=open` 复用抓取 | 按 action 使用对应依赖 |

主 Agent 使用 `actspace.main`，模式决定工具白名单：Chat 提供 `web`；Agent / Plan 提供 `web_search`、`web_fetch`。这些工具不通过额外 LLM 总结网页，不挂 Kimi 原生 `$web_search`。

插件注册时贡献全部三个工具，凭据不会改变 schema 注册。缺少搜索凭据时调用返回不可重试的 `WEB_SEARCH_NOT_CONFIGURED`；`web_fetch` 仍可执行。Runtime 还会应用 Scope、模式和显式工具白名单。

## web_fetch

调用链为 URL 校验 → DNS 公网检查 → 手动重定向与逐跳复验 → 有界读取 → charset 解码 → HTML 清洗与 Turndown 转换。

- 仅接受 HTTP/HTTPS，URL 最长 2,000 字符，禁止内嵌用户名和密码。
- 拒绝 localhost、`.local`、loopback、link-local 和私网地址；重定向最多 5 次，每个目标都重新检查。
- 当前按输入协议请求，不自动升级 HTTPS，也不针对 Cloudflare challenge 更换 UA 重试。固定 UA 为 `actspace-agent`。
- 每次 fetch 的 timeout 为 30 秒，并响应调用 abort；响应体最多 5 MiB。
- 接受 text、JSON、XML、JavaScript 及未声明 MIME 的内容；明确二进制类型拒绝。
- charset 顺序为 Content-Type → HTML meta → UTF-8。
- HTML 移除非正文元素后转 Markdown；正文最多 50,000 字符，截断时附提示。
- 输出包含 URL、可用 Title、Content-Type、Fetched at 和正文；HTTP 失败、超限、无可读文本返回结构化错误。
- 每个 Host 端口实例持有 15 分钟、最多 32 项的缓存；dispose 清理缓存。

此能力不运行页面 JavaScript。需要浏览器状态的页面应使用 Browser capability。

## web_search

一次调用并行执行已启用且有凭据的三条独立搜索通道：

```text
web_search(query, max_results?)
  ├─ DeepSeek
  ├─ 国内：Zhipu search_pro
  └─ 国际：Tavily → TinyFish → Exa
```

Desktop 仅启用且配置了 Key 的 Provider 参与；旧来源缺省保持开启，新增 DeepSeek 缺省关闭，即使已有模型 Key 也不会自动搜索。`max_results` 默认 5，限制在 1..10；每个 Provider 请求 timeout 15 秒，snippet 上限 800 字符。

| Provider | 请求入口 |
| --- | --- |
| DeepSeek | `POST https://api.deepseek.com/v1/tools/search` |
| Zhipu | `POST https://open.bigmodel.cn/api/paas/v4/web_search` |
| Tavily | `POST https://api.tavily.com/search` |
| TinyFish | `GET https://api.search.tinyfish.ai` |
| Exa | `POST https://api.exa.ai/search` |

国际通道按顺序尝试：请求失败进入下一家，首个正常响应结束该通道，包括正常空列表。实现不再依赖旧 `ProviderUnavailableError` 分类器。国内与 DeepSeek 通道独立执行，单通道失败不丢掉其他通道的结果。DeepSeek query 最多128个Unicode字符，超限只让该通道失败，不静默截断用户查询。Search 显式设置 need_content=false，按需再用抓取工具读取正文。

输出采用 RRF 排名融合：每路排名从1开始，贡献 1/(60+rank)，不比较供应商原始评分。URL解析后去掉fragment和尾部斜杠去重，同一路重复URL只贡献一次；跨路命中合并来源。按融合分数降序，平分保持稳定顺序，最终整体截取 max_results。尾部保留失败 Note 与精读提示；所有通道均无结果返回 WEB_SEARCH_FAILED。

## 可选 DeepSeek 抓取

`tools.deepseekFetchEnabled` 默认 false。启用后 Host 每次调用注入独立的 `deepseekFetchApiKey`，工具先校验公网URL，再调用 `POST https://api.deepseek.com/v1/tools/fetch`。有搜索凭据不等于授权抓取。

- 返回 Markdown，不额外调用模型；保留5MiB响应上限和50,000字符输出上限。
- 403安全策略拒绝、私网URL和主动取消不回退；其余获取失败回退本地，输出标记实际来源及回退。
- 远端、本地缓存以实现前缀隔离；开关从下一次调用生效，已开始的请求使用启动时配置。
- 官方当前 Search/Fetch 均为每1,000次成功且有结果的请求5元；多路搜索各自计费，不做付费重排。价格来源：[官方说明](https://api-docs.deepseek.com/zh-cn/guides/search/)，核对日期2026-10-18。


## 配置、预览与安全

Desktop 从 `ModelRuntimeService.getToolEnvironment().searchCredentials` 创建 Host 端口；CLI 通过自己的配置入口注入。工具执行器不直接读取全局环境。Key 由 main-only 凭据服务管理，设置 UI 归入“能力 → 搜索与网页读取”。DeepSeek 与模型共享官方 Key，模型和搜索/抓取的启用状态独立；设置页明确共享与更换影响。关闭联网搜索总开关时Host不注入任何搜索凭据，Chat的web(action=search)也不可绕过；网页读取仍独立可用。搜索来源和抓取开关通过 tools namespace 持久化，每次调用读取，不要求重启Runtime。CLI/Node Host 需显式设置 ACTSPACE_DEEPSEEK_SEARCH=1 或 ACTSPACE_DEEPSEEK_FETCH=1 才使用 DEEPSEEK_API_KEY，单独存在Key不会启用任何付费Web能力。Desktop 不把 DeepSeek Key 写入环境变量。

`ToolUiPreview.kind=web_search` 是 Client 投影结果，不是 ToolDefinition 注册字段；`mode=query|url` 区分搜索与抓取。遵循[工具预览规范](agent-tool-preview-design-guidelines.md)。

网页与搜索结果是不可信内容，不扩展权限。错误对外返回受控信息，凭据不进入 Journal 或 renderer。

## 实现与验证入口

- `packages/tools/web-tools/src/plugin.ts`：工具定义、permission 和生命周期。
- `packages/tools/web-tools/src/node-ports.ts`：供应商、多通道融合、抓取、SSRF 防线与缓存。
- `apps/desktop/src/main/runtime-v2/tool-host-services.ts`：Desktop 凭据注入。
- `packages/core/agent/src/agent-mode-policy.ts`：模式暴露。
- `packages/tools/web-tools/src/test/`：fake fetch、生命周期、重定向、多通道与失败边界。

自动化不使用真实凭据；真实 Provider 与 Browser 验收属于不同门禁。
