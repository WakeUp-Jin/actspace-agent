# 本次重构收尾：文档清理结果

2026-10-04：第二轮文档校准已实施，最终校验与本轮执行状态见[摘要](../../exec-runs/20261004-agent-storage-and-cleanup/execution-summary.md)。配套[代码清理](agent-refactor-code-cleanup-review.md)。

## 保护与方法

histories、learnings 保留，不删除、不搬迁、不改原文；本轮可新增必要学习记录。前端工作台、产品概念和其他并行修改不纳入清理。当前规范解释实现，历史决定解释取舍，执行记录解释验证；不继续复制完整架构与完成表。

第一批删除/合并结果继续以[第一批摘要](../../exec-runs/20261004-agent-refactor-cleanup/execution-summary.md)为准。以下是本轮处置，不把第一批收益重复计算。

## 原 D01–D15 清单结算

| ID | 文件或主题 | 处置与内容归属 |
| --- | --- | --- |
| D01 | plugin assembly / startup | 改为 Desktop/CLI/Host → TaskLedger/RunFactory 真实入口；移除旧 attach/followup 主链 |
| D02 | runtime architecture | 唯一 bootProfileRuntime、无 facade aliases、失败重试和存储所有权 |
| D03 | Agent Core | 保留语义不变量，删除重复迁移步骤和未来包清单；当前入口链接 startup/总览 |
| D04 | Agent/Subagent、Scope | 用户输入归 TaskLedger，保留后台 task_notification Inbox 与子 Agent 作用域 |
| D05 | Session Core/Persistence | 重写为中性读写/list/fork/recovery/provider 契约、资源与性能边界 |
| D06 | Session/Context | 缩为独有设计理由；格式、事件、Context 字段回到各自规范 |
| D07 | 写入/读取投影四文档 | 导航收敛为写入恢复/读取投影两个入口；修正旧磁盘 checkpoint、offset、冷读免扫描等已失效承诺，保留详细 DTO/水位规范 |
| D08 | Service Definition/Provider/Consumer | 保留接口/所有权原则，删除机械三对象迁移要求 |
| D09 | Profile/Bundle/Patch | 校准 createProfileComposition 与唯一启动结果，保留简单组合/Run pin，拒绝旧共享树优化 |
| D10 | package ledger / generated matrix | 手工长表改身份规则；实际 package/manifest 来源生成矩阵，产物不手改 |
| D11 | matrix generation | 明确源清单、领域事件、真实负向检查与未实现语义分析，不虚构全量证明 |
| D12 | foundation / profile-first | 缩为历史理由，旧 API 和实施步骤退役；原文保留 Git 回溯方式 |
| D13 | Cordis adoption | 缩为采用范围、Effect 资源回收与不能回滚外部副作用的边界；制品门禁引用实际证据 |
| D14 | DSH / capability research | 保留研究快照，明确不能作为当前实现路径，不全文删除未核实内容 |
| D15 | 专题/执行导航 | 当前路线清晰，删除旧 pending 计数与已替代下一步；真实欠账移交结算文档 |

原文件都保留稳定路径；重写/缩短文件的历史原文可使用 `git show 1bc434d:<原路径>` 回溯。未提交的新增材料没有声称可由 Git 恢复。没有为降低文件数把详细领域规范合成巨文。

## 旧计划与过程资料

六个旧后端 active 计划（共12份 Markdown）缩为历史入口，从待执行表移出。逐文件路径、独有目标、取消方案和未完成门禁见[旧计划结算](../../exec-runs/20261004-agent-storage-and-cleanup/legacy-plan-resolution.md)。原路径保留保障 histories/learnings 和其他旧记录引用；不修改保护区链接。

七个独立未来功能计划保持；Composer queue 旧短页仅回溯。CLI deterministic retry/error 进程 fixture 仍缺，明确登记技术债；不能因删除旧计划正文将它标为完成。

exec-runs 第一批已合并本次重构的部分重复轮次。本轮不再按日期清理其他任务截图、JSON或执行过程：未逐个核实独有失败、环境和外部门禁，暂留。本次只维护必要的执行过程、摘要、逐项CU、统计和结算，不复制所有历史测试表。

## 覆盖边界

本轮重点校准 Host/Harness/Run、Task、Session 存储与读模型，以及相关启动和服务规范。未逐字审核所有 LLM/provider、工具细节、英文学习、前端、站点文档和所有 exec-runs 资源；保留不代表确认完全同步。

当前链接/资源、矩阵字节一致、事件模式及负向校验分别运行，结果见本轮摘要。链接检查不证明所有叙述正确；矩阵源完整性不证明实际插件都已激活。最终内容哈希核对保护区，行数和文档字符差额由本轮 before/after 统计报告。
