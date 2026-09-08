# P06：Tool Runtime、审批与有序提交

状态：已完成

父计划：[ActSpace v2 插件化 Agent Runtime 完整交付计划](README.md)

依赖：P00、P04

消费方：P07-P15

Exec-run slug：`actspace-v2-plan-06-tool-runtime`

## 1. 目标

实现与具体工具无关的 Tool Runtime：稳定 identity、definition / executor 分离、effect-owned registration、one-shot prepared execution lease、JSON Schema validation、pre-policy、Host approval、不可绕过 guard、durability checkpoint、body、post/finalizer、Core normalization 和按模型 tool-call 顺序提交 Journal。

本计划不迁移任何现有 executor，不实现 Agent/Explore/Todo，也不提供 renderer component。

## 2. 必读与基线

- [Tool Runtime ABI](../../../design-docs/agent-plugin-runtime/agent-spec-tool-runtime-abi.md)
- [Runtime Projection](../../../design-docs/agent-plugin-runtime/agent-spec-runtime-projection.md)
- `packages/agent-core/src/tools/manager.ts`
- `packages/agent-core/src/tools/scheduler.ts`
- `packages/agent-core/src/tools/permission-mode.ts`
- `apps/desktop/src/main/approval-registry.ts`

## 3. 文件与接口

```text
packages/agent-runtime/src/tools/
├── definition.ts
├── executor.ts
├── registry.ts
├── prepared-execution.ts
├── activation-lease.ts
├── argument-validator.ts
├── policy.ts
├── approval-port.ts
├── core-guards.ts
├── scheduler.ts
├── ordered-commit.ts
├── result.ts
├── redaction.ts
├── errors.ts
└── test/
```

固定公共名：`ToolDefinition`、`ToolExecutorRegistration`、`PreparedToolExecution`、`ToolPolicy`、`ApprovalBroker`、`ApprovalRequest`、`ToolExecutionResult`、`ToolFailure`、`ToolRuntime`。`toolId` 使用 `<pluginId>/<localName>`；`callId` 由 Agent Loop 为每次模型调用生成，不能用 tool name 代替。

## 4. 唯一合法执行顺序

```text
capture exact registration + lease
  -> materialize and validate arguments
  -> ordered pre-policy
  -> Host approval
  -> Core monotonic guards
  -> append dispatch fact
  -> durability checkpoint
  -> executor body
  -> ordered post hooks / finalizers
  -> Core normalization and redaction
  -> ordered Journal result commit
```

任何插件 hook 都不能跳过或重排 admission、Host approval outcome、Core guards、checkpoint、invariant validator 和 ordered commit。

## 5. 任务

### 06.1 Registry 与 prepared execution

- stable id / alias / definition version 冲突 fail-fast，不允许静默覆盖。
- `prepare()` 捕获 definition、executor、policy chain、middleware chain、redactor 和 registration lease。
- registration draining 后拒绝新 prepare；已 prepared call 继续使用捕获实现，直到完成或协作取消。
- replacement / dispose / abandoned prepare 的 lease 使用计数和 timeout 有结构化 diagnostics。

### 06.2 Validation、policy、approval 与 guard

- JSON Schema validator 拒绝 unknown/invalid args，并输出不包含 secret 的 field path。
- policy 顺序按 composition layer、numeric order、stable id；deny 单调，普通 hook 不能把 deny 改为 allow。
- ApprovalBroker 只返回 exact request id 的 allow/deny；stale、duplicate、timeout 和 abort decision 都 fail-closed。
- Core guard 执行 workspace boundary、Host capability ceiling、side-effect classification 和 concurrency class 校验。

### 06.3 Checkpoint 与 scheduler

- 在 body 前先 append tool dispatch fact，再调用 P04 checkpoint；checkpoint 失败时 body invocation count 必须为 0。
- 默认 concurrency class 为 `exclusive`；只有显式 `read-only` 且 executor 声明 concurrency-safe 才进入有界池。
- 并行上限固定为 4；Host / Profile 可以收窄为 1-4，不能扩大。
- prepare / policy / approval / finalizer / commit 仍按模型 call 顺序；body 可以乱序完成，result commit 必须恢复模型顺序。

### 06.4 Result、取消与 outcome-unknown

- 终态固定为 completed、failed、denied、aborted、outcome-unknown。
- abort before dispatch 写 not-started；越过 body dispatch 且结果未知写 outcome-unknown，不自动重试有副作用工具。
- finalizer failure 不覆盖已经确认的 body outcome；单独记录 failure metadata 并继续 Core normalization。
- result 只含模型输出、generic summary/detail、artifact ref 和结构化 failure，不携带 renderer component、SessionEvent 或 mutable runtime bag。

### 06.5 合同和竞态测试

- 覆盖 duplicate id、invalid args、policy deny、approval stale/timeout、checkpoint failure、body/finalizer failure、replacement race、unload、shutdown、乱序 body、ordered commit、abort 和 secret redaction。
- 使用假的 Session 和 Approval ports 验证完整调用序列，不依赖 Desktop。
- property test 随机化 body settle 顺序，结果 seq 仍与模型 tool-call 顺序一致。

## 6. 允许修改

- `packages/agent-runtime/src/tools/**`
- `packages/agent-runtime/src/contracts/tool.ts` 的机械对齐
- `packages/shared/src/runtime-v2/tool.ts` 的 Host DTO
- P04 checkpoint port 的最小实现对接
- 对应测试、exec-run、设计勘误和 history

禁止修改现有 executor、Browser Bridge、Agent Loop、Desktop/CLI、旧 ToolManager 或默认 Runtime。

## 7. 失败与回滚

- 无法证明 checkpoint fail-closed、有序提交或 lease drain 时停止 P09-P15。
- 并行优化导致语义变化时退回 body 串行，不削弱安全顺序。
- 回滚删除新 Tool Runtime；不修改 v1 ToolManager、approval store 或用户设置。

## 8. 验证

```bash
pnpm --filter @actspace/agent-runtime test -- src/tools
pnpm --filter @actspace/agent-runtime typecheck
pnpm --filter @actspace/agent-runtime build
pnpm check:docs
pnpm check:secrets
git diff --check
```

## 9. 完成标准

- Tool Runtime 不知道具体工具、Electron、TTY 或 renderer。
- 每条安全顺序都能由测试中的调用轨迹证明。
- P09 只能通过 registration API 迁移 executor，P10 只能通过 ToolRuntime 调度。

## 10. 执行结果

- 2026-08-22：完成 definition/executor 分离、stable tool identity、registry conflict detection、prepared execution lease 和 ordered commit queue。
- 2026-08-22：完成 schema argument materialization、deny-monotonic policy、request-bound approval、Host/capability/workspace guards、checkpoint gate、redaction 和 bounded pool。
- 2026-08-22：44 个 `agent-runtime` 测试全部通过，其中 P06 执行轨迹测试 10/10；具体 executor、Browser Bridge、Desktop 和 renderer 均未迁移。
