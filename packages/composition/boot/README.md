# Boot 与 Harness 组合生命周期

现有 boot/config 入口继续负责默认应用启动。Harness 模块已作为独立导出能力接入 Runtime 的启动链路，并由 Harness Control 与 HMR 复用；Desktop、Headless 和真实 Run 仍通过各自的 Runtime/Host 入口消费，不由本包直接持有产品运行状态。

## 装配与选择

`mountHarness(parent, { composition, artifacts, sharedServices })` 消费现有 ResolvedComposition，捕获请求快照，重新验证固定产物、manifest/条目及 Host 能力，然后先检查全部 codec 再导入 behavior，最后建立组合 scope 和隔离 Loader 树。codec 必须满足声明、owner、唯一性及基本运行契约；纯 codec 无副作用仍是插件编写约定。

`HarnessGenerations` 管理组合引用，不持有任务队列或业务运行状态：

1. `prepare(harnessId, expectedRevision, request)` 完成候选装配，尚不影响当前选择。
2. `activate(candidate)` 同步检查归属、状态和基线 revision，成功后递增 revision。冲突候选由调用方 discard 后重新准备。
3. `acquire(harnessId)` 同步捕获当前实例并增加引用，返回子 scope、绑定 context、服务查询和幂等 release。
4. 旧组合退役后，最后一个租约 release 才清理。当前组合零引用仍保留；成功释放的记录从管理器移除。
5. `close()` 停止接纳，处理准备中的候选，等待持有者主动 release，然后清理；不取消任务。调用方必须先结束任务、归还租约，再等待 manager.close，最后关闭 Host root。

候选使用不可伪造的对象归属，不能通过重新拼 JSON 来启用。generationId 表示实例，executionDigest 包含组合描述摘要、产物身份及共享服务；revision 表示一次选择提交。即使重新选回相同内容，revision 也增加，防止过期候选误通过基线检查。

启用成功后，旧实例清理失败不回滚选择。release/close 返回清理错误，inspect 保留 cleanup-failed 诊断；不自动重试可能有副作用的 disposer。prepare 错误以 PREPARE_FAILED 包装并保留 cause；其余操作区分 CLOSED、NO_CURRENT、BASELINE_CONFLICT 和 INVALID_CANDIDATE。

## 消费边界

租约应在真实 Run 实际开始时获取，在 finally 中释放。P2 将接入这个规则，本阶段测试仅模拟持有者。不能在同一 Run 中改绑，也不能把组合固定到整个 Session。lease.scope 供注册和子 scope 使用，lease.context 供 scoped 事件使用；具体服务仍是组合级实例，需要调用方传递 Run scope。释放后不得保留服务对象继续调用。

插件可变状态属于 apply/fiber，模块全局变量跨相同产物实例共享。候选准备可能调用已批准的 Host 能力，插件不得借 prepare 修改全局策略或产生真实用户工具副作用；进程内 API 不提供安全沙箱。

本阶段无选择持久化、崩溃恢复、磁盘 GC、运行中替换、RPC 或权限审批接入。Profile/Bundle/Patch 描述仍由 composition 负责。详见[执行摘要](../../docs/exec-runs/20261003-agent-harness-host-refactor/execution-summary.md)。
