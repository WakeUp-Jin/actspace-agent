# F1-09 用途已知费用原生补验（2026-10-24）

NC0–NC4按限定费用范围通过。实际派发`model=gpt-6.1-sol`、`reasoning_effort=high`，设置、系统Open选图、唯一任务发送、替我审批、一次`/compact`、轨迹/Usage及两次CmdQ均由真实Electron Computer Use完成。[原生逐点报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/purpose-cost-native-20261024/native-evidence/report.md)保留23组关键状态；主侧亲自审阅压缩摘要与完整Usage截图，另对账HTTP/Journal/公开只读Usage/SQLite，不能互相代签。

版本为HEAD00d6b763及未提交源码SHA256 c5152219076369f534ca7472639655f08ecdcd8f86ae7cece18ebe45b09fbc90，296源码；制品SHA256 d043744e3d6c382bc2d3a0f1348352c512adb440d7e7369d5d99d6365a8b2ce2，2342制品，按原manifest保存顺序聚合。独立purpose-cost-native profile/workspace，main90132→正常退出→6234冷启动→正常退出，固定file renderer、无HMR。合成Provider52267/PID98744，fixture-main/fixture-vision是明确的本地模型；假Key及新profile提示词，不接触用户配置或商业端点。

| 子点 | 结果 | 实际行为与证据 |
| --- | --- | --- |
| NC0设置/导入 | 通过 | 原生两模型分别手填每百万USD input2/output5、倍率1，读回有效用途及价格；系统Open经Desktop侧栏导入唯一自有74B PNG。 |
| NC1图像识别 | 通过 | 唯一任务实际inspect_image，真实图片进入独立vision HTTP；轨迹显示父工具及100入/20出，独立费用USD0.0003。 |
| NC2自动审核 | 通过 | 同Run真实bash经独立auto-review（23/7，USD0.000081），实际printf输出PURPOSE_COST_SAFE_ACCEPTANCE，sandboxed=true/exit0/cwd正确。固定批准仅验证管道。 |
| NC3压缩 | 通过 | 原生仅一次/compact，实际压缩5条消息并显示164字摘要；独立utility压缩17/5、USD0.000059，不新增Run。 |
| NC4冷恢复/对账 | 通过 | 暖冷原生Usage均7请求/9日志/2工具/451入95出=546Token；同历史、摘要、1轮3步与逐条金额不变。正常冷启动不新增HTTP/Run。 |

[逐ID主侧对账](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/purpose-cost-native-20261024/main-reconciliation.json)确认：3主请求各100/20、USD0.0003，title11/3、USD0.000037，vision100/20、USD0.0003，review23/7、USD0.000081，compact17/5、USD0.000059；合计7请求、546Token、known7/unknown0、估算USD0.001377（浮点0.0013770000000000002）。assistant/message与step/end重复携带主usage只计一次，四辅助start/end各配对一次；真实HTTP7且无额外请求。Session c86034db-8094-44c2-9293-940ec11cc991、Run5a7fc6d4-6935-4dca-b374-07340ae86cab，1Task/1Run/3主步骤/2工具。压缩前6请求524Token与压缩后差额22Token/USD0.000059一致。公开Usage与SQLite逐activityId完全一致。

视觉与审核的logicalRequestId和attemptId不同，机器对账分别保留；公开Usage requestId按实际attemptId核对，不把逻辑ID误当额外请求。vision实际routeId=default、model=fixture-vision，审核routeId=auto-review；不把设置用途名硬写成实际路由。所有costProvenance均basis=estimated、有效配置价2/5、cacheRead回退2、multiplier1。Provider只返回合成provider-reported Token，不返回cost，不能冒称商业扣款；UI总额$0.00是舍入，逐条精确金额另可见。

新会话是lazy创建，发送前没有权限控件。在0POST时先记录合同调整，再仅给自有Provider首main响应加等待门：唯一正常发送自然建Session→原生选择替我审批→主侧只读确认真实permission/mode-set→释放同一HTTP。无API建会话、代设权限或额外任务，未修改产品；72秒首响应等待不用于性能结论。[门闩证据](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/purpose-cost-native-20261024/native-permission-gate-proof.json)与前后Provider冻结清单保留。只读对账脚本初次将run终态误期望end，按真实契约finish更正；恢复脚本首轮未将Provider相对命令解析成绝对路径，拒绝清理后修正路径核对，均非产品失败。

[恢复证明](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/purpose-cost-native-20261024/main-restoration-proof.json)确认两主进程exit0且PID消失、Provider按精确命令结束、296源码/2342制品逐文件不变。首次退出至冷启动最终退出Journal字节完全一致，SHA256 09b040a4d49da3ec1d356f2acc63b1a9262cb6cb4a16a53b1f874b276a957d12，7HTTP不增。源PNG仍保持原SHA256 f61eb2acfd02f7a571aa5df0c35ae878fb96d6b9c0eb9c3b0beefa70df111865，暂保留给独立观察定位：暖态历史附件Preview enabled，冷态disabled（原生12/13/20 AX第41行），尚未直接归Bug或签附件恢复通过。

explore复用[已有真实请求/生产投影审查](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/purpose-cost-evidence-20261024/report.md)：旧Electron/CDP父子请求及原样Journal副本中子请求100/20、USD0.0001146、7请求逐ID无重计。保留旧方法/版本，不把它称当前原生或商业调用，不为同一数值分支额外请求。结合[FC1–5](fee-evidence-20261024.md)，已知用途费用缺口收窄；商业余额/管理Key及供应商错误仍是F1-09独立未覆盖范围，不新增全用途商业扣款门槛。整行及总数仍104通过/0失败/61部分或未覆盖，Goal未完成。
