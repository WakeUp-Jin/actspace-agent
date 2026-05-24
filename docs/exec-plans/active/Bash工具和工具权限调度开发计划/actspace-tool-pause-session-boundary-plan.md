# actspace 工具暂停恢复与会话边界计划

## 目标

明确工具执行进入 `awaiting_approval` 后，Agent 运行如何暂停、恢复、取消，以及用户切换会话、刷新窗口、关闭应用或进程重启时 pending 工具状态如何处理。

本计划处理运行边界和恢复语义，不处理审核面板视觉，也不实现 Bash executor。

## 范围

- 包含：
  - pending approval 的运行时暂停模型。
  - approve/deny decision 如何恢复到对应 tool call。
  - 会话切换、窗口刷新、应用关闭、Agent abort 的处理规则。
  - pending tool call 是否落盘、落哪些字段。
  - 幂等、超时、取消和重复执行防护。
  - main / agent-core 边界职责。
- 不包含：
  - 审核 UI 组件样式。
  - Bash 安全规则细节。
  - 全局永久 allow list。
  - 后台长进程和交互式终端。

## 设计来源

- `docs/design-docs/agent-core/权限设计规则和原则.md`
- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-tool-permission-scheduler-plan.md`
- `.agents/skills/llm-agent-dev/references/tools/tool-scheduling.md`

## 相关代码路径

- `packages/agent-core/src/engine/loop.ts`
- `packages/agent-core/src/engine/agent.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/tools/manager.ts`
- `packages/agent-core/src/tools/scheduler.ts`（拟新增或等价模块）
- `packages/agent-core/src/persistence/session-store.ts`
- `packages/shared/src/session.ts`
- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/App.tsx`

## 核心规则

### 暂停模型

首版不做真正的系统进程暂停。进入 `awaiting_approval` 时，工具 executor 尚未启动。

暂停的是 Agent tool call 调度，不是已经运行中的 shell 进程。

流程：

1. LLM 请求工具调用。
2. scheduler 调用 `checkPermissions`。
3. 权限结果为 `ask`。
4. scheduler 生成 approval request。
5. engine 暂停当前 turn，等待 main 注入 decision。
6. approve 后再启动 executor。
7. deny/timeout/abort 后不启动 executor，工具结果为 cancelled。

### 会话切换

首版规则：

- 用户切换到其他会话时，当前 pending approval 保持可见状态，但不自动执行。
- 如果该 turn 仍在内存中等待 decision，切回会话后可以继续 approve/deny。
- 如果运行时已丢失，恢复时将 pending 标记为 `expired`，不静默继续执行。

### 窗口刷新或应用重启

首版安全优先：

- 不恢复执行等待中的高风险工具。
- session 中曾经 pending 的 approval 恢复为 `expired` 或 `cancelled` UI 状态。
- Agent 需要把取消结果写回上下文，或提示用户重新发起。

### 超时

- 每个 approval request 有 `expiresAt`。
- 超时后状态变为 `expired`。
- 超时后的 approve/deny decision 返回幂等失败，不执行工具。

### 幂等

每个 approval request 必须有稳定 ID。

- 第一次 approve 可以进入 executing。
- 第二次 approve 返回已处理结果，不重复执行。
- approve 和 deny 竞争时，以先落入状态机的决策为准。

## 重点问题

1. 当前 `agent:run-turn` 是 invoke 返回最终结果，pending 时如何保持调用？
   - 需要评估：长 Promise 等待、可恢复 continuation、或 turn 暂停返回 pending 状态。
2. 如果用户不处理 approval，composer 是否允许继续发新消息？
   - 倾向：允许输入，但当前 pending turn 有明确状态；后续消息是否排队另定。
3. pending 状态落 session 的粒度？
   - 倾向：落摘要、状态、request id、工具名、风险原因，不落完整敏感参数。
4. main 内存中 pending map 如何清理？
   - 超时、turn finished、session close、app quit 都必须清理。

## 里程碑

1. 定义 pending approval runtime model。
   - 验证：文档写清“暂停调度，不暂停进程”。
2. 增加 approval request id 与 pending registry。
   - 验证：main 能根据 id 找到等待中的 tool call。
3. 实现 approve/deny/timeout/abort 状态转换。
   - 验证：单测覆盖幂等和竞态。
4. 实现会话切换与恢复策略。
   - 验证：刷新或重启后 pending 不会执行，UI 显示 expired/cancelled。
5. 接入日志和 session 记录。
   - 验证：run log 可追踪状态变化，session 不泄露敏感参数。

## 验证方式

- `pnpm --filter @actspace/agent-core test`
- `pnpm --filter @actspace/shared test`
- `pnpm typecheck`
- Electron 手动验收：
  - 触发 Bash 审核。
  - 切换会话后返回，确认仍待决策或已安全过期。
  - 刷新/重启后确认命令未执行。
  - approve 后确认只执行一次。
  - deny 后确认不执行，并回填 cancelled。

## 与其他计划关系

- 依赖 `actspace-tool-permission-scheduler-plan.md` 的状态机和 approval request。
- 被 `actspace-bash-approval-ui-plan.md` 消费，用于展示 pending、expired、cancelled。
- 被 `actspace-bash-tool-plan.md` 间接消费，保证 Bash executor 只在 approve 后启动。

## 进度记录

- [ ] 定义暂停模型和恢复语义。
- [ ] 设计 pending registry。
- [ ] 设计 session 恢复时 pending 处理。
- [ ] 实现幂等 decision。
- [ ] 完成 Electron 验收记录。

## 决策记录

- 2026-05-24：首版暂停的是工具调度，不暂停已经启动的进程。原因是 Bash executor 只有在权限满足后才启动，能避免真实 shell 进程挂起和恢复的复杂度。
