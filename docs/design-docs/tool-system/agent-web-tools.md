# Web 工具设计：web_fetch 与 web_search

本文是当前 v2 的 `web_fetch`、`web_search` 与 Chat 模式 `web` 门面的事实来源；2026-10-05 对照实现校准。

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

一次调用并行执行两条搜索通道：

```text
web_search(query, max_results?)
  ├─ 国内：Zhipu search_pro
  └─ 国际：Tavily → TinyFish → Exa
```

仅配置了 Key 的 Provider 参与。`max_results` 默认 5，限制在 1..10；每个 Provider 请求 timeout 15 秒，snippet 上限 800 字符。

| Provider | 请求入口 |
| --- | --- |
| Zhipu | `POST https://open.bigmodel.cn/api/paas/v4/web_search` |
| Tavily | `POST https://api.tavily.com/search` |
| TinyFish | `GET https://api.search.tinyfish.ai` |
| Exa | `POST https://api.exa.ai/search` |

国际通道按顺序尝试：请求失败进入下一家，首个正常响应结束该通道，包括正常空列表。实现不再依赖旧 `ProviderUnavailableError` 分类器。国内通道独立执行，单通道失败不丢掉另一通道的结果。

输出国际通道在前，跨通道按去掉尾部 `/` 的 URL 去重；标题只标 Provider 和 international/domestic，不附静态权威性评分。尾部保留失败 Note 及使用 `web_fetch` 精读的提示。两路均无结果返回 `WEB_SEARCH_FAILED`，原因区分请求失败与无匹配。

## 配置、预览与安全

Desktop 从 `ModelRuntimeService.getToolEnvironment().searchCredentials` 创建 Host 端口；CLI 通过自己的配置入口注入。工具执行器不直接读取全局环境。Key 由 main-only 凭据服务管理，设置 UI 归入“工具 → 联网能力”。

`ToolUiPreview.kind=web_search` 是 Client 投影结果，不是 ToolDefinition 注册字段；`mode=query|url` 区分搜索与抓取。遵循[工具预览规范](agent-tool-preview-design-guidelines.md)。

网页与搜索结果是不可信内容，不扩展权限。错误对外返回受控信息，凭据不进入 Journal 或 renderer。

## 实现与验证入口

- `packages/tools/web-tools/src/plugin.ts`：工具定义、permission 和生命周期。
- `packages/tools/web-tools/src/node-ports.ts`：供应商、双通道、抓取、SSRF 防线与缓存。
- `apps/desktop/src/main/runtime-v2/tool-host-services.ts`：Desktop 凭据注入。
- `packages/core/agent/src/agent-mode-policy.ts`：模式暴露。
- `packages/tools/web-tools/src/test/`：fake fetch、生命周期、重定向、双通道与失败边界。

自动化不使用真实凭据；真实 Provider 与 Browser 验收属于不同门禁。
