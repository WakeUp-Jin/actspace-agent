# MN01–MN04 修复与定向复验

2026-10-16，基于main `00e5a159d2bc45fe6f6a7ec4d4da7a5162a9f745` 的未提交改动。用户确认4项修复方案后实施；未提交、未处理O01性能观察。原统一验收报告保留原版本事实，本文件记录修复后的结果。

## 修复结果

| 问题 | 修改及验证 |
| --- | --- |
| MN01 灰色错误行 | 正常与错误颜色互斥。真实隔离Electron中失败原因即时可见，浅色rgb(169,58,58)、深色rgb(240,138,138)，1440/480及刷新保持红色。 |
| MN02 部分正文丢失 | 失败/终止写入同messageId的部分正文及surface，流throw保留聚合，停止后的静默EOF也结算aborted；过滤未完成工具调用。隔离Electron受控SSE先输出再停止或报错，终态/刷新/进程重开正文均保留，消息只出现一次，chunk与消息ID一致。 |
| MN03 重试用时漏计 | llm/retry结算失败尝试，清空起点排除等待；后续header重新计时，统计版本升3拒绝旧缓存后重放。正式测试3秒失败+4秒成功=7秒，等待中停止=3秒，历史重放一致。 |
| MN04 搜索焦点丢失 | Esc/关闭按钮返回触发器，失焦关闭不抢外部焦点。正式测试与实际Electron键盘/点击复验通过，点击Composer后焦点仍在textarea。 |

## 测试与证据

- 正式回归在原实现上跑红：部分正文error/aborted/throw 3项、错误颜色2项、搜索焦点1项、重试统计2项。重试测试先修正了构造时缺少Journal必需事件的问题，最终红灯确认为实际用时0/4秒与预期3/7秒不符。
- AgentLoop全包41项、session-projection全包18项通过；含静默EOF停止、Journal surface重放和旧统计缓存版本拒绝。
- Desktop类型检查通过；全量236文件通过/2文件跳过，1920测试通过/7跳过。跳过项沿用工程环境及显式性能开关，不影响本次4项定向复验。
- 依赖、renderer、Electron构建通过；补充loop最终build和projection类型检查通过。token/theme/renderer-bridge/当前文档检查与git diff检查通过。
- 界面由gpt-6.1-sol执行。原生Computer Use工具因认证方式不支持而不可用，采用已批准的Playwright真实Electron；故障和停止使用本地兼容SSE服务，不冒充真实提供方故障测试。直接throw分支由正式AgentLoop测试覆盖。
- 本地证据根 `tmp/codex-fixes/20261016-main/`：red/green日志、desktop-full.log、build.log、typecheck.log及ui目录。截图/脱敏JSON为本地证据，不随仓库分发。
- 关键界面证据：`ui/stop-SIbbpB/results.json`、`ui/failure-final-ma7YOL/results.json`及对应终态/刷新/重开截图。UI完整路线及清理见 `ui/report.md`。服务计时字段不是正文出现时刻，不用于推算UI延迟。

## 同类检查与范围

检查了状态行3处颜色使用、搜索3种关闭入口、终止空消息及failedStreamOutput调用。状态行正常分支保持灰色；显式关闭恢复焦点、失焦关闭尊重外部焦点；尚未开始流的dispatch失败仍允许空结果，已开始迭代的异常在collectStream内保留聚合。部分工具调用只保留正文而不执行，正常工具链由原包测试覆盖。

修复影响之后的失败/停止持久化，不对过去已写空终态的用户历史进行回填。MN03旧统计从已有Journal重算。O01和原验收的DSH双页视觉、系统打开/Finder最终状态、远端等未覆盖条件继续保留，本次定向通过不等于整个产品无缺陷。

## 后续复验指引

如继续调整实现：先跑新增partial-output、facts、turn-status-color与sidebar-views回归；再从隔离会话输出正文→停止/报错→刷新→重开，确认正文和失败原因并存、只有一条消息且消息ID不变。统计按请求有效用时计算，不将重试等待混入模型用时；确认旧版本checkpoint被拒绝并重算。
