# P10：main Agent、Turn / Step Loop、Inbox 与 Todo

状态：已完成

父计划：[ActSpace v2 插件化 Agent Runtime 完整交付计划](./README.md)

依赖：P04、P05、P06、P08

消费方：P11-P15

Exec-run slug：`actspace-v2-plan-10-main-agent-loop-inbox-and-todo`

## 1. 目标

实现 ActSpace 自有 Agent Registry 与默认 Agent Loop：完整构造后发布 main Agent，按 Turn / Step 驱动 Request Assembly、PreparedLlmCall、Tool Runtime、checkpoint、termination 和 recovery，并提供 durable Inbox 与 Todo events。Host 只发命令和消费 projection，不实现第二套 loop 或 Session commit。

## 2. 必读与基线

- [Agent 与 Subagent](../../../design-docs/agent-plugin-runtime/agent-spec-agent-and-subagent.md)
- [Agent Core 目标边界](../../../design-docs/agent-plugin-runtime/agent-target-agent-core.md)
- `packages/agent-core/src/engine/`
- `packages/agent-core/src/runtime/`
- `packages/agent-core/src/tools/tools/todo/`
- `packages/shared/src/session.ts`

## 3. 文件与接口

```text
packages/agent-runtime/src/agent/
├── registry.ts
├── descriptor.ts
├── agent.ts
├── publication.ts
├── main-agent.ts
├── loop.ts
├── turn.ts
├── step.ts
├── inbox.ts
├── todo.ts
├── termination.ts
├── recovery.ts
├── errors.ts
└── test/
```

固定公共名：`AgentDescriptor`、`AgentRegistry`、`AgentHandle`、`AgentLoop`、`RunTurnInput`、`RunTurnResult`、`MainAgentInbox`、`TodoService`。main Agent descriptor id 固定为 `actspace.main`。

## 4. Loop 顺序

```text
publish user / claimed inbox fact
  -> turn/start
  -> for each step:
       step/start
       -> RequestAssembler candidate
       -> PreparedLlmCall + lease
       -> request snapshot append
       -> checkpoint
       -> stream / assembled assistant facts
       -> prepare Tool executions in model order
       -> bounded body dispatch
       -> ordered tool results
       -> step/end
  -> claim next-turn Inbox or turn/end
```

每个异常路径都必须追加最保守的 durable terminal facts，或由 P04 recovery 在重启时补齐；不能靠 renderer live state 判断是否完成。

## 5. 任务

### 10.1 Agent Registry 与有序发布

- 在 unpublished child Scope 中 await 完成 Session、Prompt、Tool、LLM 和 Agent setup。
- publication 按固定 observer order 发布；部分通知后失败时执行 reverse compensation 并发出配对 disposal。
- 同一 main Session 同时只允许一个 active turn；重复 run 返回 typed conflict，不启动第二个 Loop。

### 10.2 Turn / Step Loop

- 建立稳定 agentRunId、turnId、stepId、llmCallId、tool callId 关系并写入核心事件。
- LLM stream chunk 和 assembled assistant message 均有 codec；模型看见的完整 message 可从 Surface 重建。
- tool body 可以有界并行，prepare/finalize/commit 保持模型顺序。
- termination 覆盖 stop、tool-use continue、length、failure、abort、concludes-turn 和 Host stop guard。

### 10.3 Durable Inbox

- `next-step` 在当前 active Turn 的下一 Step 前 claim；`next-turn` 在当前 Turn terminal 后 claim 并启动新 Turn。
- enqueue、claim、discard 都是 Session facts；pending queue 是按 seq FIFO 的 projection，不另建 queue 文件。
- pending message 可取消；abort 默认 discard 未 claim 项，显式 keepPending 才保留；Runtime dispose 前 discard 本实例拥有的 pending 项。
- resume 从 Journal 重建 pending 并只领取一次；重复 crash/recovery 不重复消费。

### 10.4 Todo durable events

- `todo_read` / `todo_write` 作为 main Agent 可见工具注册，但状态完全由 Session Todo events 投影。
- update 使用 item identity 和 revision，拒绝 stale overwrite；读取不依赖旧 `TodoStore` sidecar。
- Todo tool 同样经过 Tool Runtime admission、projection 和 Scope lifecycle。

### 10.5 Abort、恢复与 shutdown

- abort signal 级联到 active LLM、approval wait 和 tool body；每条路径写清 completed / aborted / outcome-unknown。
- checkpoint 失败、stream truncate、tool unknown outcome、open Step/Turn 的恢复与 P04 repair 对齐。
- shutdown 先拒绝新 turn，再协作取消，flush Journal，等待 Agent Scope 静止。

### 10.6 合同测试

- 覆盖 text-only、单工具、多工具乱序 body、approval、checkpoint fail、LLM retry、abort、Inbox 两种 target、Todo revision、crash recovery、publication compensation 和 duplicate active turn。
- 所有 tests 通过 fake Host ports；不导入 Electron、TTY 或 CLI。

## 6. 允许修改

- `packages/agent-runtime/src/agent/**`，但不含 `agent/subagent/**`
- P04/P05/P06/P08 的组合接口与 core codecs
- `packages/shared/src/runtime-v2/agent.ts`
- 测试、exec-run、设计勘误和 history

禁止迁移普通 tools、实现 Agent/Explore child、修改 Host、旧 engine 或默认 Runtime。

## 7. 失败与回滚

- 无法证明 logical request checkpoint 早于 wire/tool side effect 时停止。
- publication compensation 失败必须使 Agent 创建失败并暴露 diagnostics，不能发布 degraded main Agent。
- 回滚删除新 Agent module；v1 runtime 仍为默认。

## 8. 验证

```bash
pnpm --filter @actspace/agent-runtime test -- src/agent --exclude src/agent/subagent
pnpm --filter @actspace/agent-runtime typecheck
pnpm --filter @actspace/agent-runtime build
pnpm check:docs
pnpm check:secrets
git diff --check
```

## 9. 完成标准

- main Agent 全流程可从 Session facts 重建。
- Inbox / Todo 无 sidecar truth，恢复和重复执行均有幂等测试。
- Agent Registry、Loop 和 Host 边界不存在 Electron/stdout/process.exit 依赖。
