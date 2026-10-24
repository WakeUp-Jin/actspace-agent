# 普通发送明确失败恢复：2026-10-24

本批只补原09-P6-1/G7的普通发送明确失败恢复，不签unknown回执、IME或拖放。实际 `gpt-6.1-sol` / `high` 子智能体执行完整Electron与原生Open；主侧只准备隔离数据、保护和恢复实际原生选择源，并被动对账。没有产品代码改动或商业调用。

版本为HEAD `00d6b763` 加当前未提交源码，296源码聚合 `c5152219076369f534ca7472639655f08ecdcd8f86ae7cece18ebe45b09fbc90`、2342构建制品聚合 `d043744e3d6c382bc2d3a0f1348352c512adb440d7e7369d5d99d6365a8b2ce2`，结束逐文件一致。实例main68019/renderer68067，独立send-reject-native profile/workspace，55152拒绝型观察服务、55153被动取证。配置仅复制已停机Fee专用假凭据，不读取用户Key。

| 点 | 实际现象与结论 | 证据 |
| --- | --- | --- |
| SF1 | 原生输入精确 `SF_REJECT_20261024_KEEP_TEXT`，通过Open侧栏Desktop选择唯一自有74B PNG；同屏文字、缩略图及Send enabled。通过。 | 原生sf1-ready、Open截图及完整AX；主侧sf1-draft-snapshot核实际attachment ID/path，pending0 |
| SF2 | 确认实际path后主侧原子改名该PNG，原生仅发送一次。显示“附件准备失败，草稿已保留”及自然ENOENT，原文字/原attachment ID和缩略图保留，可继续发送。通过。 | sf2-failure截图/完整AX、SF2-send-once、fault-proof、sf2-draft-snapshot |
| SF3 | Task/Run/request-header/HTTP/pending全部0，只有新空Session header；源原字节恢复后原生追加_EDITABLE验证可编辑，移除附件/清空草稿，最终Send disabled，没有第二次发送。通过。 | failure-reconciliation、sf3-editable/cleared截图和完整AX |
| SF4 | 原生CmdQ于20:38:57.510Z，main20:38:57.806Z正常exit0、renderer已退出，源码/制品未变。保护源SHA后仅删除本批唯一PNG及新目录，精确结束guard67991。通过。 | app-exit、main-restoration-proof |

[原生逐点报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/send-reject-native-20261024/native-evidence/report.md)、[主侧恢复证明](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/send-reject-native-20261024/main-restoration-proof.json)。证据同目录保留实际HTTP空日志、完整冻结清单及两次草稿快照。

Session为 `3b0fc702-f8e9-46d0-a0e5-5cc8655387de`；失败时只有header，SHA `b739d5cde4e6e9975717f91f1cfd4a26022f2f4f7e7435d1ae911f97867332a7`。正常退出只追加 `session/end-seed`、lastSeq=-1；最终SHA `f5388bb15a504171f9c4077f4845b3ccaeca389a50b9753ed94f3df5183f558c`，原header精确不变。辅助检查起初预期“退出后完全不追加”而失败，审查实际两行后改为显式允许正常end-seed，仍拒绝任何Task/Run/request等额外事实；不是降低产品断言。另一次辅助脚本将header codec名称误写session-header，已按真实codec修正并保留记录。

这是真实接纳前附件准备明确失败恢复，不是Provider运行失败，也不是unknown。原G7没有强制真实断网门槛；既有存储注入仍不作本批证据。09-P6-1因真实IME和拖放仍未覆盖，14-A3未知回执时序不由本批代签。清空后错误提示仍可见只记观察，没有合同依据新增Bug。总数仍104/0/61、50Bug49关闭，Goal继续。
