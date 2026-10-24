# F7-02 / 14-A1：流式恢复证据收口

2026-10-23，主智能体审查真实原生报告及关键截图/JSON后关闭BUG-047。两个父编号按下表完整要求恢复为通过；不据此签收性能、商业端点或其他恢复场景。

## 当前版本与方法

- `fix/settings-model-select` / HEAD `00d6b763` 加现有未提交源码；基线源码摘要 `6af5577e1e0199563186af48ec15665e33e6171c64ed1f7642d0b758ac64d0c5`。本次审查核对基线中全部非文档源码路径，无漂移。
- Desktop/Client制品514文件逐SHA256复核无漂移；构建摘要 `1559942b2f343c2892ef362e361bb859742582b75a070637869b814dbb10f7e3`，本地清单 `parallel-20261023/bug047-build.json`。
- 当前原生批次由明确指定的`gpt-6.1-sol`操作真实Electron，PID95881 / `com.actspace.acceptance.bug038` / CDP54838，固定dist无HMR；CDP仅只读导航/DOM/截图，HTTP仅控制本地Provider。
- [R47逐点报告](../../../tmp/codex-acceptance/20261022-acceptance-bugfix/bug047-native/report.md)；主审查摘要`tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/bug047-review.json`。本地证据不随仓库分发。

## 原要求逐步核对

| 编号/子步骤 | 实际证据与结论 |
| --- | --- |
| F7-02 输出中滚动/停止/切换/继续及跟随 | [原真实Electron](cu-electron-20261022.md)T1/T2真实长回复中滚动、A→B→A、停止后暂停队列与显式继续已有实测；当前R47-1再验普通流式切出/切回，R47-4原生停止保留8行，R47-5停止后经暂停队列显式继续完成。通过这些代表操作，不外推全部排列。 |
| F7-02 重载恢复当前状态 | R47-2与4两次原生CmdR，timeOrigin分别变化且navigation=reload；02/06截图在Provider挂起时直接显示已收8行、运行状态和可用Stop。R47-3完成24行、R47-4停止保留8行。通过，原BUG-047缺口已补齐。 |
| F7-02 工具/审批结构顺序 | [原真实工具/子/父路线](cu-electron-20261022.md)及[审批补批](host-git-followup-20261022.md)pending→Denied/Stopped历史与Journal结构语义一致，未见乱序。此次投影修复仅聚合未完成assistant/chunk，完整结构事件路径未改；Client41与Desktop相关62项回归保留完成交接/顺序检查。原真实证据继续支持该子项，不把工程检查写成新增原生动作。 |
| F7-02 完成块稳定 | 原报告“完成DOM稳定代表”两次间隔2秒，17个非空完成轨迹/工具元素标识与全文相同；本次R47-3/5完整消息替代片段后无文本重复。普通流式未开启新选项；不将静止代表扩张为逐绘制帧性能结论。 |
| 14-A1 输出中切走/切回 | 原真实长回复路线与当前R47-1连续01–08支持切回正文连续。原要求未把性能专项8k–12k汉字目标设为本行硬门槛，当前受控样例不冒称长负载性能。 |
| 14-A1 再发一条、输出中原生CmdR、运行/停止恢复 | 同一当前会话ONE完成后发送TWO；输出8行时原生CmdR，旧8行仍可见、Stop可用，实际Stop后保留8行/Stopped。R47-4通过。 |
| 14-A1 无重复与完整结束 | ONE/THREE各01–24严格有序且各一次；TWO停止8行。HTTP基线4→8只含标题1+主请求3；Journal对应3user、3request/header、56chunk、3assistant/message及completed/aborted/completed，无重载重发。R47-3/5通过。 |

## 相邻消费者及边界

[Web工程/源码报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/web/report.md)确认新Client选项默认false；Web有独立输出回放，当前27文件124测试与typecheck通过。真实Web运行中刷新另由WN批次验收，P2-W02不由Desktop证据代签。

设计/history已同步。原配置端点60183/v1、System主题、空Composer、右栏关闭及原起点会话均恢复，Provider无pending。BUG-047关闭；BUG-039及其余未覆盖项继续保留，Goal仍active。
