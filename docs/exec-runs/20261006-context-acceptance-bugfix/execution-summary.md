# 上下文验收问题修复摘要

状态：原7项确认问题及复验新增B10已修复，定向自动化、真实桌面和数据复验完成。没有改写原历史Journal，没有提交或推送。

| 问题 | 修复与自动化依据 | 真实桌面/数据结果 |
| --- | --- | --- |
| B2 行号输出漏路径 | 接受read_file行号前缀；绝对、相对及裸文件名回归 | 9页实际结果保留106文件，连同manifest及Journal共108路径；active100、sleeping8 |
| B3 缺原历史路径 | SessionStorage可选journalPath；真实Cordis包装集成 | 原Journal绝对路径出现在导航中，模型实际read_file成功；没有生成摘录 |
| B4 索引混入普通引用 | 工具、摘要、恢复统一排除索引身份和路径 | 索引read对应空fact；连续2次compact后普通路径内索引数为0 |
| B5 fork/恢复重复计数 | 持久空fact、成功压缩事务边界及旧状态兼容 | sleeping文件读取后保持sleeping、计数1；下次compact恢复active。fork首次计数全0，新读取只计1，父会话不变；重启后cycle2/108路径/active2及file-002计数1不变，短请求完成 |
| B6 闲置英语开关失败 | Session绑定，显式main读取；子Agent及其他Session隔离 | 闲置开启成功，连续2个主Run有英文system，关闭后撤销；另一会话没有注入。子Agent隔离由自动化覆盖 |
| B8 Task累计超过1MiB阻断 | 聚合快照不套单事件限制；验证回滚与持久失败分开 | 原故障Journal副本可恢复、去重并继续提交；新桌面累计Task内容1141480字节，3块大输入、后续短请求及重启后原排队任务均完成，原任务只接受一次 |
| B9 压缩阈值与容量不符 | 使用prepared实际容量、输入/缓存/输出桶；未知容量不猜值 | Kimi256K/50%：input60535+output63未压缩；input130579+output134成功自动压缩，end/applied齐全 |
| B10 短暂写锁失败永久缓存 | 未取得Session或首次Harness SelectionStore写锁失败允许后续请求重试；恢复原选择并保留真实持久失败阻断 | 两层均有真实重启证据；Session并发与双Host磁盘租约红→绿回归通过，新版本重启后切换会话重新获取队列，继续执行原任务完成，没有删除锁或改写原任务 |

原B1首次静默暂停仍缺少具体错误，不能强行归因于B10。B7旧长任务影响后续模型推理的候选仍无输入/调度错误证据，不修改历史来掩盖模型行为。

验证：AgentService32、Context31、Compaction17、English20、AgentLoop37、Runtime51、Prompt8、JSONL5、Storage3、HarnessControl23，共227项测试通过。Runtime依赖闭包、受影响包类型检查、包边界、契约生成和文档检查已通过。源码与最终Runtime/Harness构建已撤除临时probe，撤除后AgentLoop37项再次通过，最终桌面启动构建0错误。

证据：

- [逐项桌面复验](ui-retest.md)：真实操作、复现路线、关键界面状态和未覆盖边界。
- [执行过程](execution-process.md)：根因、红→绿测试及同类调用点核查。
- [真实值核对](value-checks.json)：逐请求Context→LlmInput→prepared重算、管理状态隔离、导航位置、模型容量。
- [重启检查](restart-checks.json)：原排队任务去重完成、父子计数不变及阈值恢复80%。
- [大输入与压缩阈值](large-input-checks.json)：实际预算、自动压缩及累计Task超限后的Run终态。
- [披露状态检查](disclosure-checks.json)：父子状态、压缩序号和读取计数。
- [旧披露数据回放](old-data-replay.json)：旧父子会话恢复及幂等性。
- [原Task故障副本恢复](ledger-recovery.json)：原文件不变、重复提交、继续提交和重开。

Computer Use逐项覆盖由gpt-6.1-sol记录；主Agent负责修复与数据复核。真实验收与自动化验证分别列出，未执行的边界不记为通过。

19次普通真实模型请求均通过三阶段复算；管理status替换不影响模型输入，动态导航未写入system，活跃路径均为文件且不超过100。压缩utility请求不冒充包含在这19次中。测试隔离设置已恢复80%。

验证边界：英语目标切换、子Agent及语音队列没有专门做本轮Computer Use；子Agent隔离有自动化覆盖。其他模型容量、压缩失败/取消用例以自动化为依据，不声称全部重走桌面。旧格式索引补修由旧父子Journal回放验证；真实桌面采样使用本轮固定的验收Harness，新Host加载了两层启动锁修复，最终发布构建没有日志probe。

恢复显示观察：若首次队列读取发生在临时锁保护期，当前前端不会定时重新获取；切到另一会话再返回可刷新队列。本轮未扩展修改前端刷新策略。模型选择器重启回默认是当前内存状态初始化行为，是否跨重启持久化不在此次Context修复范围。

收尾：Computer Use通过应用菜单正常退出，应用库存已无目标实例；开发进程已结束。最终docs检查与diff检查通过。
