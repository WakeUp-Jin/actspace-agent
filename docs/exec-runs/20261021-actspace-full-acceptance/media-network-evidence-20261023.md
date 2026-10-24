# P2-D17 媒体与网络证据闭环（2026-10-23）

结论：P2-D17 原列要求已分别取得通过证据，勾选通过。各证据的方法与版本沿用原报告；不将受控 Provider、公开协议数据准备或磁盘对账改称原生操作，也不声称重新执行商业生成。

| 原要求 | 结果与证据 | 方法与边界 |
| --- | --- | --- |
| 实际搜索与抓取 | [真实 Electron 服务](cu-electron-20261022.md)的 W3C 搜索返回5个来源（含W3C/WHATWG）；[Runtime补验](network-media-runtime-20261022.md)实际 HTTPS 抓取 example.com，两次正文与 fetched-at 相同，第二次命中缓存。 | 前者真实服务，后者真实 CLI Runtime 工具，模型工具选择由回环 Provider 控制。不是所有搜索源或全部 URL 穷举。 |
| inspect_image 与 generate_image | [媒体补批](desktop-models-settings-20261022.md)合法 PNG 经实际 inspect_image、用途模型 openai/o3/high 和真实 HTTP 后成功；既有真实 generate_image 返回1/1、1024×1024及持久 artifact。 | 看图 HTTP 使用受控视觉服务，生成服务为既有商业实测；本批无新增生成请求。 |
| 附件持久化与系统打开 | 合法2×2附件在两次正常重开后哈希不变；既有生成图片的逐字副本在当前隔离 profile 原生点击后完整加载。M17-2 实际由系统“预览”打开，M17-3 Finder 实际选中同一 artifact。 | 前期附件准备经公开 import/submit；本次打开、原生菜单及系统应用交互由 gpt-6.1-sol 执行。源会话 Journal、artifact 及 metadata 三文件逐字复制，不复制设置或凭据。 |
| 不可用反馈及后续恢复 | Runtime 中未配置搜索/生成、非法看图 ID 与私网抓取分别给出明确失败，没有伪造成功内容；后续工具仍执行，任务以 completed 正常结束。Desktop 关闭搜索源后真实工具给 WEB_SEARCH_NOT_CONFIGURED，重新启用后设置恢复；BUG-038 V1–V5 覆盖看图配置首次添加、替换、移除拒绝、重新添加恢复及正常重开。 | 独立错误条件各自保留，不以任务 exit=0 代表每个工具成功。看图配置生命周期为真实原生 UI/HTTP/Journal 对账。 |
| 实际用量与凭据边界 | [BUG-026](bugs/BUG-026.md)修复后 Desktop 7主+2辅助=9请求/1080 Token、CLI 同轮9/1080、Host35/4200，HTTP/Journal/生产投影一致，正常重开无重复；[BUG-033](bugs/BUG-033.md)、[BUG-034](bugs/BUG-034.md)补全统计和轮尾展示。 | 仅对实际请求事实计量；未报告费用保留未知。回环日志不保存 Authorization，未为本批读取或变更真实 Key。真实 Key 断连专项仍归17-A5，未代签。 |

## 当前原生 M17-1–4

[逐点原始报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/media-system-native-20261023/report.md)四点全部通过。应用 com.actspace.acceptance.bug038，PID81046 / 根PTY69570；真实历史 session 34f723b4-c237-468f-b727-c5a535308ed7，artifact 28ab84ef-3b20-43be-a2a0-9659a7a40562。

- 原生图片预览完整呈现白底蓝圆；默认系统应用实际为 com.apple.Preview，AX URL 为当前隔离 profile 的同一 artifact；没有手动选择应用或 shell 打开。
- Finder 实际选中 artifact 本体（非 metadata），534436字节，SHA256 `dbec6bd87105cbacc142f613e3625405a41cf147572974ba10d003d35263ebf5`。源与副本三文件大小和SHA全部仍匹配 provenance。
- 仅关闭本批系统窗口和图片 Tab，原完成会话、System外观、390px右栏及空 Composer 恢复。没有发送新任务或更改模型设置。

关键证据为原始目录的 `01-history-preview.png`、`02-preview.png`、`02-preview-ax.txt`、`03-finder.png`、`03-finder-ax.txt`、`04-hashes.json`、`fixture-provenance.json`。网络错误批次 `results.json` 再核对为8模型请求、7工具结果、exit=0/status=completed，7条工具结果包含成功抓取、缓存与明确错误，未隐藏失败。

原报告中“尚未覆盖系统打开”和“OBS-001配置生命周期”是前一时点缺口，分别由本批与 BUG-038 补齐。不扩大到其他端系统打开、所有 DNS/重定向或服务组合。无新产品代码、回归测试或 Bug。
