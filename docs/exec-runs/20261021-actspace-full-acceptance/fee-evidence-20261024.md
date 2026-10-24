# F1-09 本地费用与标题辅助原生补验（2026-10-24）

FC1–FC5真实Electron Computer Use均通过。实际派发gpt-6.1-sol/high，所有设置、发送、模型切换、Usage/轨迹与两次CmdQ均由原生UI完成；[独立逐点报告及16对截图/AX](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/fee-native-20261024/native-evidence/report.md)保留完整路线。主侧只读生产快照、HTTP及Journal对账与界面证据分别注明，不签F1-09整项。

版本：HEAD00d6b763+未提交源码c5152219076369f534ca7472639655f08ecdcd8f86ae7cece18ebe45b09fbc90；制品d043744e3d6c382bc2d3a0f1348352c512adb440d7e7369d5d99d6365a8b2ce2，296源码/2342制品逐文件冻结、保存顺序聚合。独立fee-native profile/workspace，55112本地合成Provider/55113被动观察，main2725→正常CmdQ→19703冷启动→正常CmdQ。不接触用户配置或商业端点。

| 子点 | 结果 | 原生实际与账证 |
| --- | --- | --- |
| FC1目录价×0.5 | 通过 | 真UI倍率1→0.5；GPT-4o mini显示已×0.5，input0.075/output0.3/cacheRead0.0375每百万USD；首轮input10000/output2000，估算费用0.00135。 |
| FC2标题独立计量 | 通过 | 真轨迹显示独立标题生成/utility及尝试1；1100/300 Token、费用0.0001725，独立requestId，只计1请求，不新增Run。 |
| FC3手填不再乘倍率 | 通过 | 真UI在倍率仍0.5时填input2/output5，显示已修改/已保存；第二轮费用0.03，旧FC1与标题仍保留旧费率/费用快照。 |
| FC4未知价 | 通过 | 真UI切未知模型，12000 Token且成功；Usage费用未知、弹层暂无单价，顶部另有1次缺费用依据；Journal cost=null、pricingSnapshot=null、reason=model-price-unavailable。 |
| FC5汇总/冷恢复 | 通过 | 同会话3轮/3步，4请求/37400 Token、已知费用显示$0.03+未知1；正常冷启动后三模型请求快照、标题、Usage均保留，没有新增HTTP或重复Run/计数。 |

本地冻结目录updatedAt=2026-09-07T12:35:32Z，models.dev openai/gpt-4o-mini原价0.15/0.6/cache0.075；不是当前官网报价。Provider仅返回短文本，不提供价格/cost；10000/2000及1100/300为刻意合成报告用量，费用是目录或手填估算，不是真实字数或商业账单。runtime快照source=configured仅表示有效设置价格进入请求，不据此把目录来源误称手填；公开有效来源与原生已×0.5另有冻结证据。

[主侧对账](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/fee-native-20261024/main-reconciliation.json)确认HTTP4=3main+1title，4独立requestId，Run3，input31100/output6300，总37400；已知精确USD0.0315225，known3/unknown1。生产Usage逐requestId与Journal匹配，assistant/message和step/end同usage只计一次。冷启动前Journal前缀完全不变，正常退出仅追加生命周期事实。主侧亲自审阅新手填弹层与冷Usage截图。只读helper最初误传range=all被IPC正确拒绝，按契约total修正；不产生任务或HTTP。

[恢复证明](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/fee-native-20261024/main-restoration-proof.json)：两主进程exit0且旧PID消失，自有Provider2700按完整命令核对后停止；源码/制品无漂移，所有独立数据保留。初次UI选中文本未替换导致短暂10.5，首请求前已原生纠正0.5，无请求使用10.5。二启Composer显示默认GPT-4o mini而第三请求仍是未知模型，此观察已按[完整契约/源码/原生前后证据审查](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/model-selection-contract-high/report.md)解释：正式model-context规范明确本机Composer只在当前窗口内存保留，重启用Settings默认；历史request仍保留实际模型，符合契约，不登记Bug。远端会话有独立localStorage偏好，不能外推到本机；未重发额外模型请求。

其他供应商余额/错误分支、管理Key及未验用途计费仍按F1-09原子范围保留未覆盖。本批无确定新Bug，整表结论由可靠性单独回填，不把费用子步骤当整行完成。
