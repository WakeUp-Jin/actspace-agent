# 子委派 DURABILITY_BLOCKED 修复

2026-10-18，承接轨迹验收 OBS-01。用户要求把遗留失败继续修复；当前分支实施，未提交。

## 根因和证据

不是磁盘写入失败。真实 Electron 复现中，子任务已成功执行 read_file，但子 Journal 在 claim 之后、finish 之前多了一条 queue/recover。TaskLedger.finish 增量投影处理这条恢复事件，将运行状态改成 interrupted，后续 finish 触发 INVALID_EVENT，再被外层包装为 DURABILITY_BLOCKED。

底层诊断捕获：finish 前 lastSeq=157、ledger revision=2；append 后 seq=158；cause 为 TaskError/INVALID_EVENT，堆栈指向 projectTasks 的 active 校验。Journal 中 accept/start/claim 为 seq0/1/2，recover 为 seq8，finish 为 seq158。诊断只加在临时 dist，已恢复并重新构建，未保留运行时调试输出。

读取路径为 Desktop 任务刷新 → AgentApplication.taskCommand(snapshot) → AgentService.snapshot → #manager → TaskLedger.open。子任务由独立 Provider 持有 Ledger，但未登记到 AgentService；读取因此错误建立第二调度器并执行恢复。

## 修复

AgentService 增加 provider-owned Ledger 的显式登记：snapshot 返回该 Ledger 已确认的状态，不执行恢复；调度修改拒绝 SESSION_BUSY。Subagent lease 在提交任务前登记，释放时解除登记。不存在第二份事实状态，也不绕过 flush 或放松 finish 状态校验。

实际改动为两个实现文件与两个测试文件：service.ts、agent-runtime-plugin.ts、lifecycle.test.ts、default-harness.test.ts。

## 验证

- AgentService 全量 34 项通过；覆盖并发只读观察、不追加 recover、拒绝第二调度器、正常完成和解除登记。
- Runtime 定向 5 项通过；实际 Harness 子执行期间读取 Host tasks，验证仍 running、事件数量不变并最终完成。
- Subagent 全量 12 项通过，包含失败、取消与资源释放路径。
- Desktop 依赖闭包构建通过。
- 真实 Electron 定向复验见[验收记录](acceptance.md)。

## 同类路径排查

仓库生产代码 TaskLedger.open 只有 AgentService 建立自有调度器，以及 Subagent lease 接纳两处。前者对已登记外部所有者拒绝接管；后者显式登记。RPC/Host/前端所有 snapshot 仍复用 AgentService，因此同一只读保护覆盖这些入口。主会话已有调度器仍沿用其缓存 Ledger；原恢复/持久化失败测试继续通过。

## 最终结果

P1–P5 真实界面全部通过：Explore 与 Agent 各一次委派成功，子 read_file 成功且 Schema 可见，最终答案正确；Explore 重载后父子状态、结果仍保留。修复后的父子 Journal 均正常 finish，无运行中 recover。主智能体复核重载截图与日志；51 项相关测试、依赖构建与 Desktop 类型检查通过。隔离应用已退出，临时数据与凭据已删除。旧的失败日志不改写。
