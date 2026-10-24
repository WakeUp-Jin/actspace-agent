# P2-D15 原要求与证据复核（2026-10-23）

本项按原计划的用户行为要求签收，不把内部终端ID、订阅计数、所有平台或精确Dock入口追加为终端项门槛。方法分别标明；历史截图未显示两万行终点的限制保留，终点由本次真实原生补齐。

| 原要求 | 已执行结果与方法 | 证据 |
| --- | --- | --- |
| 创建、多终端、输入与调整尺寸 | 真实Electron/CDP创建双zsh，输入得到PID/cwd；切换和resize后内容保留。当前原生另创建两个不同shell并输入成功。 | [工作台](desktop-workbench-20261022.md) D15；[T15原生报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/terminal-end-native-20261023/report.md) T15-1–3 |
| 输出背压的用户行为 | 受限连续输出中实际Ctrl-C，出现KeyboardInterrupt，writer退出而shell仍可输入；另一活动输出中关闭后writer/shell都退出。当前原生有限20000行到R15_LOAD_020000及R15_END_020000，随后R15_AFTER_LOAD执行成功。 | [后续补批](host-git-followup-20261022.md) 终端输出有限补验；T15-2截图及DOM |
| 关闭、重开与归属 | 三会话、两工作区分别创建shell，切换返回marker、PID/cwd匹配；活动关闭重开无旧输出。当前原生40122关闭消失，新44501无旧输出，再关闭也消失。 | 后续补批closeout/terminal-ownership.json及queue-memory；T15-3及03-processes.json |
| 关窗/正常退出无本轮孤儿 | 原生CmdW后shell63259消失、同应用88701重开可用且旧终端不恢复；既有正常app.quit逐PID核对主进程、helper、shell和writer全部退出。 | [原生生命周期报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/native-lifecycle-remaining-20261023/report.md)；后续补批lifecycle与cleanup-final.json |

P2-D15通过并勾选。确切Dock点击由11-A2/P2-D19继续保留未覆盖；不据此代签这些复合项。本批原生操作者gpt-6.1-sol，根代理只读ps核对；无Provider请求、产品源码修改或用户终端操作，当前两shell已回收，System/390px/空草稿及原会话已恢复。
