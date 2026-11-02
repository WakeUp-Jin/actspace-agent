# 只读数据抽查

方法：真实隔离 Electron 产生文件；主控只读 Journal/transcript/SQLite/统计文件，不能替代 Computer Use。脱敏原始数值见本地 engineering/live-data-audit.json。

- U2 Provider 样本：主会话 d8e9de19、request 891f9371，input=7416、cacheRead=128、cacheWrite=null。按当前输入口径分母7544，命中率1.6967%；不是把未提供cacheWrite当作“命中率未知”。UI显示需另验。后续request可抽179+7552=7731，命中97.6846%。
- T4：当前4份新会话 transcript 均包含会话信息。对 Journal 中长度超过40字符的 reasoning原文逐段比对，未发现泄入；主会话停止轮有1条终态标记；侧聊继承区段通过父链接引用，不重复正文。仍需失败轮、刷新不重复与恢复后的抽查。
- T6：父会话已包含2个侧聊、1个子 Agent transcript链接；各子会话回链父会话。分叉/压缩待实际触发，不能据此签收完整T6。
- H13：真实Host已生成2026-11.jsonl，快照315条/81907字节，inventory/tool-owner/runtime三种元数据。递归检查无args/arguments/content/messages/prompt/apiKey/authorization/reasoning/text等正文或凭据字段。尚未对UI插件/运行tab签收，退出flush另验。
- H12/U6：当前尚未打开统计页，读模型表为0，待G5初始化后核对；不将此状态报告为Bug。

本次数字是短时快照，不推算月文件大小或长期内存。

补充快照（21:20）：已出现6份新transcript，其中两级分叉均回链直接父会话，父会话记录分叉/侧聊/委派分支；逐份未发现重复User/Assistant节锚点。该快照仍不是恢复/压缩子步骤的验收结论。

后台快照（21:29）：分叉660cc812中，45秒任务记录start6511→completed6673，通知同messageId从enqueue6672到claim6678，transcript只生成一个通知节；长任务停止记录settle7037=stopped/delivery=stopped，两个fixture脚本均无进程残留。停止通知7038当前只排入Inbox，不把enqueue误计为重复交付。见本地engineering/background-audit.json。

C5磁盘：d34c侧聊在seq146进入Plan、1167回Agent，write_file发生于1467，read_file发生于1554；Plan区间未调用写文件工具，磁盘最终plan-forbidden.txt为PLAN_WRITE加换行，与UI退出Plan后的执行一致。

完整重放比对（21:34）：7份新transcript与当前真实Journal及父子分支重放结果逐字一致；包括main/side-chat/fork/delegation、正常与aborted终态。按隔离secrets中凭据原文及Journal reasoning原文检查，泄露数均0；未在报告输出凭据或正文。该方法只验证投影持久化一致性，未把同源渲染重放当成独立格式正确性证明。失败轮/压缩与恢复仍待后续场景。

失败轮补充（21:43）：e89391a9第5轮read_file坏PNG后Provider400，Journal turn/end seq3216=failed；transcript含失败终态，7份仍全部逐字重放一致、泄露0。PNG的IDAT CRC错误已定位为本轮fixture问题，不计产品缺陷。

C2连续证据时间核对：C2-stream-01/02/up确实位于同一真实request的assistant/chunk之间；held/bottom已晚于流结束，不能支持“持续停住/回底恢复跟随”的过程结论，已交CU操作者补对应子步骤。以Journal时间关联截图，未仅凭结束态签收流式行为。


重启后快照（22:07）：9份新transcript正文/工具与分支内容仍匹配，无reasoning或凭据泄露。全Journal逐字重放有8份差异：7份仅Last activity行（退出新增end-seed，不能据此报Bug），1份还包含晚生成标题未同步，确认UA-004。此前“逐字一致”是重启前对应时点结果，不外推为未来仍逐字一致。


P4/P6开启后真实元数据（22:14）：新会话0ad548b2的createdWith.plugins含actspace.english-learning（16项），默认off时本轮主会话为15项且不含；CUA同时验证真实双语回复，不只依赖开关外观。Browser工具在未连接Chrome扩展时不要求出现在注册工具表。用户原NativeHost登记及support launcher的hash/mtime均与G4前一致；本机engineering/plugin-enabled-audit.json。


P6关闭重启后的请求快照：runtime133959f3的两个开关均false；默认off64个原始request/context副本无英语段，on2个中目标会话1个含english-learning/v1，恢复off后的3个新请求均无该段；三阶段无browser_*，符合未连接扩展。这些原始上下文数量含分叉复制，不作真实调用次数。23项普通工具正常，实际清单保存在本机engineering/plugin-context-audit.json；进程元数据未见bridge，源码确认off不构造服务与轮询，未声称做了进程堆内存检查。


R4/R2真实链路（22:28）：原生CUA配置本机隔离HTTP夹具，POST主动断连；实际Journal同turn有attempt1/2/3，retry两次且kind=network、目标127.0.0.1:50941，与服务端3POST和轨迹吻合。切真实DeepSeek后新发立即completed。夹具HTTP400 `invalid runtime output`只发1POST、kind=invalid-request/retryable=false、无超时误判；再切DeepSeekseq179completed。辅助标题走DeepSeek，不混入本地POST计数；本机engineering/R4-live-journal.json。真实timeout分支本轮未以断连样本代签。


G5精确UI交叉核对（22:39）：Usage 24h界面81请求、737758 Token、85.2%缓存命中率；同一时点只读库 input100199 + cacheRead578048 + 未提供cacheWrite按0 = 678247，命中85.2267684%，四舍五入一致。合并缺口7来自usage缺失，unknownCost=0；无token失败5不误算为未定价。对应本机engineering/usage-ui-crosscheck.json，后续请求不套用此时点数字。

手动压缩（22:45）：原生CUA执行/compact，主会话seq16291开始、16293替换上下文、16294结束，manual、5074ms、24255→15894 tokens；真实库harness_compaction=1。transcript设计约定在turn/end重写，手动压缩不结束轮次，当前未更新摘要不直接另列Bug；等待同会话下一轮结束与恢复后核对。


压缩后下一轮完成（22:47）：主会话transcript27544字节与实际Journal逐字重放一致，含1个压缩摘要与正确分隔；原文保留，reasoning/凭据泄露0。证据transcript-audit.json；无需为即时压缩重写另开Bug。C7定向补验真实捕获运行态，确认UA-006右栏缺模型，详见Bug台账。


G6增量与关闭采集（23:05）：H11同主会话request在14:50:38.125Z开始、14:51:04.399Z turn/end completed，前后截图14:50:44/14:52:11跨真实运行过程；页面保持运行Tab自动39→40轮，不把此正常增量代签UA-007首轮补齐。H14独立空库真实DeepSeek一轮完成；ACTSPACE_HARNESS_STATS=0时无运行时统计文件，正常退出后仍无文件，Journal与会话级request/turn各1、Usage2，切tab后UI会话指标正确。首次补齐后idle仍0请求已独立确认为UA-007。凭据/设置均0600，结束后清理。

H15真实UI仅归档/恢复：切走当前会话后R4可归档，归档前后request/turn/tool等执行计数保留；owner事件数与投影状态有归档事件引起的正常变化，不能把全表哈希变化当数据丢失。当前产品没有UI删除入口；后续离线隔离目录缺失夹具与重建只作为读模型集成证据，不代签CUA删除。


最终重建核对（23:15–23:18）：真实worker已将缺失源R4写入archived-sessions.jsonl，meta.deleted=1。正常退出后仅备份派生SQLite，再以冻结构建重启，从16份现存Journal与Harness归档重建；请求84、轮56、工具rollup408、委派6、压缩1五表行哈希与重建前完全相同。R4的6请求/4轮/46工具rollup行也全部保留。Usage按自己的源存在性规则移除R4旧7活动行，不能用它代签Harness永久保留语义。证据index-after-rebuild.json与rebuild-retention-audit.json；此为离线夹具+真实读模型集成结果，不是UI删除通过。

恢复后13份现存新transcript审计：去除设计允许的Last activity时间差后，仅UA-004会话存在已知标题差异，其余正文/工具/分支与冻结渲染重放一致；主会话包含1个压缩摘要，reasoning原文与实际凭据匹配泄露均0。重放方法只证明一致性，不是独立格式正确性。真实统计文件2026-11.jsonl当时425069字节/1636行，归档45967字节/1行；递归禁用正文键和实际凭据值检查均0。仍是短时样本，不能外推整月大小/长期内存。
