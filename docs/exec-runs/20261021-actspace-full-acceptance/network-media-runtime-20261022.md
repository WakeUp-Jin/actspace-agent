# 网络与媒体 Runtime 补验（2026-10-22）

固定主仓库当前构建，独立 CLI / data-dir / 工作区；受控回环 Provider 只决定工具调用，工具由真实 Runtime 执行。未配置付费搜索、图片生成服务，没有读取或使用真实 Key。不是 Desktop 界面验收。

| 子步骤 | 状态 | 实际结果与边界 |
| --- | --- | --- |
| 公共网页抓取与缓存 | 通过 | `web_fetch https://example.com/` 首次真实 HTTPS 返回 Example Domain 标题及正文；第二次 Journal summary 为 from cache，正文及 fetched-at 一致。没有用受控 HTML 冒充真实互联网。 |
| 私网 URL 边界 | 通过 | `http://127.0.0.1:12345/private` 返回 Local and private network addresses are not allowed，未伪造内容；Journal 为 WEB_FETCH_FAILED。仅覆盖该直接回环地址，不代表 DNS/重定向全部路径。 |
| 搜索未配置反馈 | 通过 | `web_search` 返回 WEB_SEARCH_NOT_CONFIGURED，并列出可配置来源，后续工具仍可执行。未调用商业搜索源，不能签收搜索成功链路。 |
| 图片分析非法 artifact | 通过 | `inspect_image` 使用合成非法 ID，返回 IMAGE_INSPECTION_FAILED / Invalid artifact id；没有报告图中内容。合法 Session artifact 的看图和视觉模型路由仍未覆盖。 |
| 图片生成未配置反馈 | 通过 | `generate_image` 返回 IMAGE_GENERATION_NOT_CONFIGURED，不生成假图片、不声称成功；后续轮次正常结束。真实生成及图片落盘/卡片未覆盖。 |
| 未开放工具边界 | 通过 | 当前 Agent scope 未开放 `web` 聚合入口，Provider 尝试调用后整个 batch denied，未执行；不把该项计为 web 参数校验通过。已开放的独立 web_search/web_fetch 正常按上表执行。 |

CLI exit=0、status=completed，8次模型请求、7次工具结果。整体任务正常结束不代表每次工具成功；失败状态及原因均保留在 Journal。本轮未确认新的产品 Bug。

证据：`tmp/codex-acceptance/20261021-actspace-full-acceptance/network-media-runtime-20261022/` 的 results.json、requests.json、stdout.json、stderr.txt、data 下 Journal；脚本位于同级 network-media-runtime-20261022.mjs。输入使用固定测试字符串，不含真实凭据。

对应 P2-D17、P2-R02 的已执行子步骤。Desktop 附件持久化/系统打开、真实搜索/图片服务、合法图片 artifact 及费用对账仍未覆盖，不以本表代签。
