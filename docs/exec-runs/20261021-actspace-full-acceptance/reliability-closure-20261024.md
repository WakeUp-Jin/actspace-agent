# P2-R01 原范围验收闭环（2026-10-24）

主侧沿正式计划 P2-R01 原文逐子步骤审查，并采纳独立 gpt-6.1-sol/high 的[只读证据审查](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/r01-closure-audit-high/report.md)，本项通过。原编号、复合范围、历史证据及方法边界保留；不把新增防重取证写成全部子点在最新构建重新执行。

| 子步骤 | 结果 | 实际证据与方法 |
| --- | --- | --- |
| 历史会话恢复 | 通过 | [完整应用历史恢复](desktop-models-settings-20261022.md)59 Journal正常重开；[10/24原生历史worktree](local-lifecycle-evidence-20261024.md)正文、树和Review归属正确，保留旧Journal80158B/SHA0bb3a2fe…b5e4。来源明确为10/22已有会话跨运行/构建恢复。 |
| 新会话恢复 | 通过 | 同完整应用报告的final-media新建、真实运行与main57964→76497→85664恢复相同会话/正文；本次Host新任务另有冷恢复，不代签Desktop界面。 |
| 附件恢复 | 通过 | final-media合法74B、2×2 PNG，生产公开导入/提交后真实Electron预览、两次正常重开，artifact及358B元数据哈希完全相同。准备为公开协议，预览为Electron/CDP，未声称原生选择/粘贴。 |
| 派生索引重建 | 通过 | 同报告隔离副本schema9→10生产完整应用重建、55会话ID及summary相同、59 Journal原哈希不变；[服务恢复](reliability-20261022.md)1132活动/117请求/1015工具/212918 Token、二启0批重读另列，默认SQLite与JSON缓存路径分开。 |
| 同ID重复请求防重 | 通过 | 下述当前生产Host/Client RPC与真实本地HTTP联合对账；租约互斥不作为唯一证明。 |
| 超大明细分页 | 通过 | [实际原生历史/Usage分页](performance-query-evidence-20261024.md)：101轮/1000工具历史40→202，Usage1101活动、111页、页2往返ID相同；[生产服务大数据](reliability-20261022.md)12000明细48页、11900路径119页、1380000B Unicode原文22页逐ID/字节对账。合成服务规模与原生代表路线分别注明。 |
| 损坏/截断Journal | 通过 | [生产adapter副本故障](reliability-20261022.md)：2901完整事件，尾损坏修复保留原字节forensic与完整事件；中间非法行拒绝误截，损坏副本/原事实哈希不变。不是损坏专属原生UI证据。 |
| 迁移异常保护与恢复 | 通过 | 同可靠性报告：非法15B settings真实完整应用可见加载失败、不覆盖原文；自有settings.json.tmp空目录触发真实原子写失败，原文/精确备份保留；仅移除fixture障碍后正常二启、settings哈希相同。未证迁移专属原因文案。 |

当前防重证据位于[r01-dedup-20261024](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/r01-dedup-20261024/result.json)：生产CLI Host、生产HostClient WebSocket RPC、独立dataRoot和动态loopback Provider，无mock或商业调用。session390e142c…af77，同submissionId四份receipt均指向task6639dbd5…091e；运行中、完成后、正常冷重开后都复用，冲突正文明确拒绝。三份完成/冷重开前后snapshot逐字段相同，仅1task/1Run/1主HTTP；Journal77744B/SHA f76ba7e863663f808e1c55edad391819fbeddcafe821ba695e14768735cd2efa，user/message、request/header、assistant/message各1。正常停机10917/16036均exit0，冷重开没有新增模型请求且Journal哈希不变；自有服务已结束。

取证夹具的两次错误如实保留：首次误断言不存在的request/start（run.log原始栈）；首次cold helper误取receipt.task.sessionId（attempt1-failure.json）。纠正为实际request/header和snapshot.sessionId后，仅重开既有任务，不新增模型调用、不降低产品断言。失败不是产品Bug。完整脚本、原始receipt/Journal/HTTP、修正过程及[版本清单](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/r01-dedup-20261024/frozen-build.json)均保留。

当前防重绑定HEAD00d6b763+未提交源码c5152219076369f534ca7472639655f08ecdcd8f86ae7cece18ebe45b09fbc90、制品d043744e3d6c382bc2d3a0f1348352c512adb440d7e7369d5d99d6365a8b2ce2（296源码/2342制品，保存顺序聚合），逐文件无漂移。10/24历史/查询原生证据为源码24a1e8a4…c926/制品56bbfa4f…6eda；10/22完整应用及服务保留当时的原始版本，不倒标为当前版本重跑。主侧核对后续变更和范围，本项没有因后续修复而失效的已知子证据；若相关行为再变化，仍须定向复验。

原文未要求指定未知旧发布版本、迁移专属提示或最终F9；旧报告后来追加的这几条不作为P2-R01额外门槛。未知发布版安装升级保留P2-R03，F6重建中间态/最终整合、本地Desktop unknown回执14-A3、原生文件选择和旧OS密文分别按原编号继续未覆盖，不由本项代签。

整表更新为165项104通过、0失败、61部分或未覆盖（63.0%）；50Bug中49关闭，仅BUG-039开放。无新产品Bug，Goal继续active。
