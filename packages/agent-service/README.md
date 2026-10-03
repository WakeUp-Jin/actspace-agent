# Agent application service

Host 内唯一的 Session 任务调度所有者。依赖结构化 `RunFactory` 和 `RunLease`，不导入默认 Loop 或 Runtime。

- `task-ledger.ts`：串行 Journal mutation、持久回执、内容去重、CAS revision、领取和恢复。
- `task-projection.ts`：只投影 owning Session 的任务；fork 不继承活动队列。
- `run-manager.ts`：每会话一个执行槽；开始时选 Harness，停止并等待清理后归还租约。
- `execution-budget.ts`：审批等待暂停执行预算，绝对 deadline 保持生效。
- `service.ts`：Session manager 生命周期与共同任务操作。打开 Session 不创建 Loop。
- `codec.ts`：纯 required codec 入口；未知读取器不能忽略这些事件继续执行。

接纳必须 append + flush 成功后才回执和调度。`submissionId` 去重只保证任务接纳，不保证工具外部副作用恰好一次。终态后结果等待者还要等 Run 清理与租约释放完成；清理失败阻断后续运行。

状态变化观察通知为 `emit`，不能代替服务调用的持久化屏障。`/compact` 通过同一执行槽运行管理操作，不创建 Loop Run。窗口重载只读取 Host 投影；Host 重启将已领取任务标记中断，暂停未领取队列，等待明确继续。

验证：`pnpm --filter @actspace/agent-service test`。生产接线和验收范围见 [P2 计划](../../docs/exec-plans/active/20261003-agent-harness-host-refactor/phase-2.md)。
