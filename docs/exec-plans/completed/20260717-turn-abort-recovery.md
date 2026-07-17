# Agent Turn 中止与会话恢复修复计划

## 目标

让用户在 LLM 流式输出、工具审批等待或前台 Bash 执行期间点击 Stop 后，当前 turn 能快速收敛为明确的 `aborted` 终态，Composer 恢复输入，并且中断轮次在切换会话、下一次发送和应用重开后仍可从 `session.jsonl` 重建。

## 范围

- 包含：
  - 待审批工具随当前 turn abort 立即取消，不再等待五分钟超时。
  - Agent loop 使用独立终态表达 abort，不再从最后一条 assistant `stopReason` 猜测。
  - 前台 Bash 消费 turn 的 `AbortSignal` 并终止对应进程。
  - turn 开始时先追加用户消息，结束时追加 `turn_aborted` 等剩余事件，避免中断输入仅存在 renderer 内存。
  - renderer 对 aborted 结果重新读取 Session，并从持久化事件展示 `Stopped`。
  - 覆盖审批取消、引擎 abort、SessionEvent selector 和 renderer 恢复的回归测试。
- 不包含：
  - 允许同一 session 同时运行多个主 Agent turn。
  - 恢复应用重启前尚未执行的高风险审批。
  - 改造后台 Bash task 的独立生命周期；已经 backgrounded 的任务继续由 `bash_kill` 管理。
  - UI 样式、颜色或布局调整。

## 背景

- 相关文档：
  - `docs/design-docs/agent-turn-layers.md`
  - `docs/design-docs/core-storage-and-observability.md`
  - `docs/design-docs/agent-testing.md`
  - `docs/FRONTEND_VERIFICATION.md`
  - `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-tool-pause-session-boundary-plan.md`
- 相关代码路径：
  - `packages/desktop/src/main/agent-turn.ts`
  - `packages/desktop/src/main/approval-registry.ts`
  - `packages/desktop/src/renderer/App.tsx`
  - `packages/agent-core/src/engine/{loop,bridge,types}.ts`
  - `packages/agent-core/src/tools/{scheduler,manager}.ts`
  - `packages/agent-core/src/tools/tools/bash/{index,executor}.ts`
  - `packages/agent-core/src/persistence/session-store.ts`
  - `packages/shared/src/{session,session-selectors}.ts`
- 已知约束：
  - renderer 不直接读写 session 文件。
  - pending approval 被 abort 后绝不能启动 executor。
  - SessionEvent 追加格式必须向前兼容，旧 session 不需要迁移。
  - Main Process 仍是唯一会话持久化层。

## 风险

- 风险：abort 与用户点击 Allow 同时发生，可能造成竞态执行。
  - 缓解方式：PendingApprovalRegistry 先到先得地删除 pending entry；scheduler 在收到允许决策后再次检查 signal。
- 风险：用户消息预写后，正常 turn 又重复写一次。
  - 缓解方式：main 路径显式关闭 bridge 的 user event 聚合，bridge 默认行为保持兼容测试和纯内存调用。
- 风险：AbortSignal 监听残留到 background Bash task，导致后续 turn abort 误杀后台任务。
  - 缓解方式：Bash executor 在前台等待结束或转后台前移除监听。
- 风险：新增 SessionEvent 导致 selector 或恢复 switch 漏分支。
  - 缓解方式：shared selector 与 agent-core adapter 同步补测试，未知旧事件行为保持不变。

## 里程碑

1. 契约与取消作用域：新增 abort decision、AgentLoopResult status 和 `turn_aborted` 事件。
2. 后端执行链：取消 pending approval、传播 Bash signal、预写用户消息并持久化终态。
3. renderer 恢复：所有终态统一重读 Session，Composer 在 abort 收敛后恢复。
4. 验证与文档：运行分层测试、typecheck/build，并完成 Electron 真实链路检查。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/shared test`
  - `pnpm --filter @actspace/agent-core test`
  - `pnpm --filter @actspace/desktop test`
  - `pnpm typecheck`
  - `pnpm build`
- 手工检查：
  - 触发需要审批的 Bash，点击 Stop，确认审批卡立即结束且 Composer 恢复。
  - 切换到其他 Session 再返回，确认用户输入、工具过程和 `Stopped` 仍存在。
  - 再发送一轮消息，确认前一中断轮次不会被 streamingBlocks 覆盖。
- 观测检查：
  - `session.jsonl` 中同一 turn 只有一条 `user_message`，末尾存在 `turn_aborted`。
  - run log 中 abort 到 `turn_result_persisted` 不再等待 approval timeout。

## 进度记录

- [x] 复现并确认审批等待五分钟、状态误判和 renderer 内存态覆盖三条根因。
- [x] 完成共享契约和取消作用域修改。
- [x] 完成持久化与 renderer 恢复修改。
- [x] 完成分层自动化测试和 Electron 真实交互验收。
- [x] 同步设计文档、history、learning，并归档本计划。

## 决策记录

- 2026-07-17：采用显式 `AgentLoopResult.status`，不再把最后一条 assistant message 当作 turn 终态，因为 abort 可能发生在 tool/approval 阶段。
- 2026-07-17：采用 append-only `turn_aborted` SessionEvent，并在 turn 开始时先写用户消息；这让中断状态可以跨 renderer 内存和应用重开恢复。
- 2026-07-17：后台 Bash task 不随主 turn abort 自动终止；只有仍处于前台等待阶段的 Bash 进程消费当前 turn signal。
- 2026-07-17：renderer 的最终消息列表统一从 `getSession` 恢复；streaming blocks 只承担运行中展示，任何终态都不再把它当作历史来源。

## 验证记录

- `pnpm --filter @actspace/shared test`：通过，35 tests。
- `pnpm --filter @actspace/desktop test`：通过，50 files / 397 tests。
- abort 相关 agent-core 定向测试：通过，覆盖 loop、bridge、scheduler approval、Bash、adapter 和 session persistence。
- agent-core 全量测试：802 tests 通过；既有 `subprocess.test.ts` 的 shell child timeout 用例单独运行仍失败（期望 stdout `ready`，实际为空），与本次 abort 传播路径无代码交集。
- Kairos controller 在全量并发测试中曾失败一次，单文件复跑 20 tests 全部通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- Electron 开发版：Bash 审批出现后点击 Stop，约 2.3 秒内回到 Idle；Composer 可立即再次输入，切换 Session 再返回后用户消息仍存在。
- 实际 `session.jsonl`：同一 turn 恰好一条 `user_message`，并按顺序持久化取消后的 `tool_result`、`turn_aborted` 与 `context_snapshot`；`meta.turnCount` 为 1。
