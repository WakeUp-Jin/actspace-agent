# ActSpace v2 P10：main Agent、Turn / Step Loop、Inbox 与 Todo — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-10-main-agent-loop-inbox-and-todo.md`
- **执行模式**：交互
- **开始时间**：2026-08-22 21:15
- **结束时间**：2026-08-22 21:21

## 执行时间线

### 步骤 1：实现 Agent Registry 与 publication compensation

- **操作**：实现 AgentDescriptor、AgentHandle、AgentRegistry、ordered observer publication 和 reverse compensation。
- **决定**：Agent 必须在 scope/session/setup 完成后才发布；observer 失败会 unpublish、逆序通知 disposal 并关闭 Agent。
- **验证**：publication partial failure 的固定调用顺序通过。

### 步骤 2：实现 main Agent Loop

- **操作**：组合 P04 Session、P05 PreparedLlmCall、P06 ToolRuntime 和 P08 RequestAssembler，实现 user/Turn/Step/request snapshot/checkpoint/LLM/tool/terminal 流程。
- **决定**：一个 Session 同时只允许一个 active turn；request snapshot flush 成功前不 dispatch；tool body 仍由 P06 ordered scheduler 执行。
- **验证**：text-only 完整 Turn、duplicate active turn 和 terminal relation 通过。

### 步骤 3：实现 durable Inbox 与 Todo

- **操作**：实现 Inbox enqueue/claim/discard fold，新增 Todo core codecs 和 revisioned Todo projection/service。
- **决定**：两者不写 sidecar；pending/revision/state 全部从 Journal 事件重建。
- **验证**：Inbox FIFO claim、Todo stale overwrite rejection 和 completed projection 通过。

## 遇到的问题

- **问题**：P08 原始 `assemble()` 内部只返回 metadata，无法把同一个 PreparedCall 交给 Loop dispatch。
  - **应对**：将 P08 分成 `assembleCandidate()` 与 `finalize()`；Loop 在中间捕获 exact PreparedCall，再把它的 registration metadata 固化进 snapshot。
- **问题**：Inbox claim 只能发生在 open Turn 的 pre-step boundary。
  - **应对**：Loop 在 `turn/started` 后、每个 `step/started` 前 claim `next-step`，保持 P04 relation invariant。

## 跳过或推迟的事项

- 完整 LLM retry facts、复杂 stream truncation repair 和多工具真实 executor parity 由 P15 故障注入覆盖。
- Subagent、Agent 与 Explore 由 P11 实现。
