# F6-02 固定副本冷重建与二启（2026-10-24）

UR1、UR3、UR4通过，UR2构建期提示未覆盖，UR5最终整合未交付；F6-02整项保持未覆盖。实际派发gpt-6.1-sol/high，真实原生CU直接进入Settings→Usage，首次只见“正在读取使用记录…”纯loading，随后就绪，没有捕获检查/同步/重建阶段、计数或取消。没有人为延迟、扩充数据或循环删库碰状态，不将内部phase或完成截图签成过程通过。

版本为HEAD00d6b763+dirty源码c5152219076369f534ca7472639655f08ecdcd8f86ae7cece18ebe45b09fbc90、完整制品d043744e3d6c382bc2d3a0f1348352c512adb440d7e7369d5d99d6365a8b2ce2，296源码/2342制品逐文件复核不变。新usage-rebuild-native profile、55133被动观察，不Provider、无密钥；全部界面输入/两次CmdQ均为原生CU，旁路没有抢先发Usage业务查询。

| 子点 | 实际及证据 | 结论 |
| --- | --- | --- |
| UR1固定副本 | 已停机、无文件持有者的performance-native/profile-history，1 Journal/1751557B，100合成轮1000工具+1真实Provider轮；离线副本仅删除4项明确派生SQLite/sidecar/owner文件，保留41事实文件。 | 通过，主侧文件/进程旁证。 |
| UR2过程提示 | 原生首次点击后立即截图/AX仅见纯loading；自然就绪显示101请求/72299Token。阶段/计数/取消未取得，不判新Bug。 | 未覆盖。 |
| UR3结果对账 | 原生全部范围、空搜索、全部状态、明细显示1101活动、1–10/1101、1/111页；首次完成后只读SQLite全部活动ID、kind、requestId、seq、Token及费用与源基线完全相等。 | 通过。 |
| UR4正常二启 | main46669→原生CmdQ exit0→同profile正常冷启54279→原生同值明细→CmdQ exit0；无删库重跑、无新请求，41事实源/副本逐字一致。 | 通过。 |
| UR5最终整合 | 当前schema14结果不能签尚未交付的F9最终整合版本。 | 未覆盖。 |

精确汇总1101活动/101请求/1000工具，72299Token（input65279/output1004，另有cache口径），已知估算USD0.019624595999999998；合成100轮价格未知，不冒充真实商业负载。源Journal SHA e410683d7a8fb3447df6e5583f2cfaedfadbf925a35f4bfe64f1fef36ce5ceec始终不变；无新增request/header，无新模型请求，也没有独立HTTP监听来声称网络抓包。

[原生逐点报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/usage-rebuild-native-20261024/native-evidence/report.md)、[首次完整对账](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/usage-rebuild-native-20261024/first-reconciliation.json)、[最终恢复与版本保护](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/usage-rebuild-native-20261024/main-restoration-proof.json)分列原生与文件证据。主侧核两个main/renderer均已退出，桌面释放；104通过/0失败/61部分或未覆盖、50Bug49关闭不变，Goal继续active。
