# P3 Computer Use 验收

2026-10-03，GPT-6.1 Sol；真实 Electron `com.actspace.desktop.dev.w2067fa05`，renderer `127.0.0.1:5173`。隔离数据 `/tmp/actspace-p2-electron-data`，本地 mock `127.0.0.1:18763`，无真实 Provider/凭据。本轮只验收与写本报告，没有修改产品代码或提交。

## 验收点与操作分组

- U1：正常启动、创建会话、读取 P2 历史，无白屏/初始化错误。
- U2：同会话 Plan 完成后切 Agent；排队、暂停、继续与停止。
- U3：工具审批、取消审批中的任务、继续后不误伤下一 Run。
- U4：`/compact`、后台会话与窗口重载，任务不重复领取。
- U5：退出重启后历史与结果可读，未完成任务不自动执行。

正常会话路线：P2 历史→新会话→选择工作区→Plan→Agent 等待→普通后续排队→停止→继续；覆盖 U1/U2，保留 Plan 完成与暂停截图。审批压缩路线：printf 审批通过→第二审批等待中排队→停止→继续→compact→等待运行切后台/回来→CmdR；覆盖 U3/U4，保留审批截图及 fresh AX。退出重启路线：最终构建后准备未完成任务→退出→同构建重启→历史/队列观察→手动继续，覆盖 U1/U5。日志/Journal 只辅助，不替代真实 UI。

## 中间构建结果

开发 session44577，日志 `/tmp/actspace-p3-dev.log`，新 Session `b598425e-2d4b-4410-8835-2601bdff4a96`。

| 子项 | 结果 | 真实 UI 证据 |
| --- | --- | --- |
| U1.1 启动与 P2 历史 | 通过 | 主会话历史响应、Stopped、PNG、批注、压缩按钮可读；无白屏。 |
| U1.2 新建会话 | 通过 | 新建→选 actspace-agent→提交→P2 本地测试响应与空闲。 |
| U2.1 Plan 完成后切 Agent | 通过 | plus→Plan→“P3 真正Plan模式完成验收”完成，Plan chip/响应截图；移除Plan→plus Agent→等待运行。首条 `/plan …` 只是普通文本，不冒充模式证据。 |
| U2.2 排队/停止/暂停 | 通过 | 等待运行中加入“P3 队列普通后续”；1条排队；停止后 Stopped、空闲、已暂停/继续发送截图。 |
| U2.3 继续 | 通过 | 继续发送→队列消失→后续响应/空闲。 |
| U3.1 工具审批通过 | 通过 | 等待审批，printf p2-acceptance、拒绝/运行截图；点击运行→Ran→P2响应。 |
| U3.2 审批中停止 | 通过 | 第二审批等待时加入“P3 审批取消后的后续”；停止后审批消失、空闲、队列已暂停。 |
| U3.3 下一Run | 通过 | 继续后“P3 审批取消后的后续”响应/空闲，没有被前Run取消误伤。 |
| U4.1 compact | 首尝试环境失败，待复验 | UI“上下文压缩失败 · Compaction LLM returned no terminal summary.”；主线程直接HTTP定位 mock 在tools=[]的摘要请求按历史“审批测试”误发 tool_calls。不是产品压缩失败结论。 |
| U4.2 后台/重载 | 发现问题，待定位复验 | “等待：P3 后台重载验收”运行→切P2历史（sidebar当前仍运行）→回来CmdR，重载后显示空闲/无停止，只有用户消息。Journal seq113start/114claim/119request-context后无finish、仅1claim；此辅助证据说明未重复领取，但不能将运行状态恢复标为通过。 |
| U5 | 待执行 | 最终构建重启路线尚未完成。 |

CUA各调用约60秒，截图后元素索引曾失效，fresh AX后动作成功，未造成重复提交。截图保留于CUA工具输出，没有另存图片。P3无启用页面，本报告不声称UI验证Patch、Host授权或选择恢复API；这些归工程测试。

## 最终构建定向复验与重启恢复

最终 dev PTY37360，日志 `/tmp/actspace-p3-final-dev.log`，Electron PID81734；重启 dev PTY9027，日志 `/tmp/actspace-p3-restart-dev.log`。主线程修复 renderer 从 Host task snapshot 恢复运行状态及过期快照保护；本子线程仅做真实应用复验，不把主线程自动化当作CU证据。mock 修复为摘要请求 tools=[] 时返回文本。

中间构建的 Host 指纹变化由主线程按设计发现不兼容，测试选择目录完整移到 `/tmp/actspace-p2-electron-data/harness-state-intermediate-20261003-215504`，P2 sessions保留；最终构建首次建立新内置选择。**这一次夹具基线重置不是用户数据迁移，不作为恢复通过证据。** 下方U5是在最终构建同一选择基线上退出/重启，期间没有再次重置。

| 子项 | 最终结果 | UI与辅助证据 |
| --- | --- | --- |
| U4.1 compact | 通过 | release临时放行摘要后发送 `/compact`，真实AX显示“上下文已压缩 · 17 条消息 · 0s”；最终截图同时可见该结果。Journal seq125/126/128压缩事务。固定摘要只验证链路，不证明摘要质量。 |
| U4.2 后台会话 | 通过 | 启动“等待：P3 最终后台重载复验”→切P2历史，当前会话sidebar仍运行中，P2历史可读。 |
| U4.3 窗口重载 | 通过 | 回当前会话→CmdR，fresh AX保持运行中、停止Agent可用；点击停止后空闲/Stopped。Journal seq130start/131claim，直到停止仅一组start/claim，seq137pause/141cancelled。中间构建UI丢状态Bug已修复并定向复验。 |
| U5.1 退出前状态 | 通过 | 启动“等待：P3 重启恢复未完成”，加入“P3 重启后手动继续后续”，UI运行中/1条排队；通过CmdQ退出测试Electron。 |
| U5.2 重启历史与结果 | 通过 | 同构建重启fresh AX可读Plan、审批结果、后续响应、压缩按钮、最终重载Stopped及退出Run的Stopped；无白屏。 |
| U5.3 未完成任务不自动执行 | 通过 | 重启后UI空闲、1条排队/已暂停/继续发送，后续仍在队列，没有响应；观察约两分钟后才手动点击继续。Journal seq157recover后至手动操作无claim。 |
| U5.4 手动继续 | 通过 | 点击继续→后续消息进入历史→“P2 本地测试响应。”、sidebar空闲、队列消失；终态截图保留。seq158resume、159start/160claim、170completed，单次领取。 |

U5前后选择文件校验由主线程提供（辅助工程证据）：`selections.jsonl`均1行、revision1，executionDigest `16bca1c2e78d679477069bf5ea425c6e9dde35caa83cedee0eb946bb14fb0ac6`；文件SHA256前后均 `4a1175c93a4bb0b52bda7eb4a3b5d52a3b077fcf4003cdbf4342d6ed1d5194d4`，说明本次恢复没有重新bootstrap。不将其声称为通过UI启用Patch。

## 按 U 项最终结论

- U1通过：真实启动、新会话与P2历史读取；最终重启后新历史/结果再次可读。
- U2通过：真正Plan模式完成→Agent；排队→停止暂停→继续普通后续。
- U3通过：printf审批通过、审批中停止、继续下一Run正常。
- U4通过（修复后复验）：compact完成、后台状态保留、重载恢复运行且可以停止，单任务没有重复领取。首次夹具错误和中间产品Bug证据保留在上文。
- U5通过：同最终构建退出重启后历史可读、未执行队列保持暂停、手动继续完成。

以上U1–U5没有未覆盖子项；真实Provider、摘要质量、Patch启用产品UI不在本轮覆盖范围。最终会话 `b598425e-2d4b-4410-8835-2601bdff4a96`空闲、无pending，Agent模式；release控制文件已删除。应用和本地mock继续运行。没有修改产品代码、summary/plan或提交/push。
