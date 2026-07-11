# Plan 2：TeamRuntime 与长期运行成员循环

状态：待执行

依赖：Plan 0、Plan 1

产物消费方：Plan 3-6

## 目标

在 `agent-core` 中实现可由 desktop 托管的 TeamRuntime：管理扁平成员列表、成员独立上下文、Task 调度、长期 idle/wake 生命周期、租约续期、成员 transcript 和恢复；复用现有 `runAgentLoop`，不复用 Explore 专用 runner。

## 附加必读

- `.agents/skills/llm-agent-dev/references/agent-runtime/agent-patterns.md`
- `docs/design-docs/agent-form-team.md`
- `docs/design-docs/agent-subagent-runtime.md`
- `packages/agent-core/src/engine/loop.ts`
- `packages/agent-core/src/engine/types.ts`
- `packages/agent-core/src/tools/tools/agent/runner.ts`
- `packages/agent-core/src/context/manager.ts`

## 允许修改的文件

- `packages/agent-core/src/team/runtime/team-runtime.ts`（新增）
- `packages/agent-core/src/team/runtime/member-runtime.ts`（新增）
- `packages/agent-core/src/team/runtime/member-context.ts`（新增）
- `packages/agent-core/src/team/runtime/task-scheduler.ts`（新增）
- `packages/agent-core/src/team/runtime/recovery.ts`（新增）
- `packages/agent-core/src/team/runtime/events.ts`（新增）
- `packages/agent-core/src/team/runtime/test/*.test.ts`（新增）
- `packages/agent-core/src/team/index.ts`
- 必要的 `engine/types.ts` 小幅通用化
- 对应文档和 history

不得注册模型工具、IPC 或 renderer UI。

## Runtime 边界

`TeamRuntime` 通过依赖注入获取：

- Team stores。
- `createMemberLlm(tier)`。
- `createMemberToolManager(member)`（Plan 3 注入；本阶段测试使用 fake manager）。
- `eventSink(RuntimeStreamEvent)`。
- `now()` 和 timer factory。
- ApprovalGate（由后续 ToolManager 消费）。

不得从 agent-core 内部读取 Electron `userData` 或 BrowserWindow。

## 任务清单

### 2.1 TeamRuntime 状态机

实现：

- `load()`：读取 snapshot/state/tasks，执行 lease 恢复。
- `spawnMember(presetId, name, writeScopeOverride?)`。
- `stopMember(memberId, mode)`：graceful / force。
- `getState()` / `listMembers()` / `listTasks()`。
- `dispatchTask(taskId, memberId)`。
- `claimNextTask(memberId)`。
- `sendMessage(message)`。
- `sendUserMessage(memberId, text)`，同时写 Leader mirror notice。
- `finalizeTeamWork()`：只在静默条件满足时成功。
- `shutdown()`：abort 全部成员、flush state/transcript。

每次状态变更先写 Store，再 emit stream event；UI 不能先看到无法恢复的乐观状态。

### 2.2 MemberRuntime

每个成员持有：

- 独立 `ContextManager`。
- 独立 ToolManager。
- 生命周期 AbortController 和当前 turn AbortController。
- Inbox wake signal。
- 当前 Task 和 assignmentVersion。
- transcript append sink。

成员循环：

```text
starting
→ 恢复/创建上下文
→ 检查 shutdown/control
→ 检查用户消息、Leader 消息、Peer 消息
→ 检查已分配 Task / self-claim
→ runAgentLoop
→ 更新 Task 或进入 waiting/idle
→ 等待 wake
```

不得 busy loop。使用可取消 Promise 等待 Inbox/Task wake；文件轮询只作为恢复兜底。

### 2.3 复用 runAgentLoop steering/follow-up

- Team 消息转换为现有 `Message`，通过 `getSteeringMessages` 和 `getFollowUpMessages` 注入。
- 控制消息不伪装成普通 Peer 文本；shutdown 在安全边界触发生命周期停止。
- 用户直接消息使用 user role 和 `source:"team_user_direct"`。
- Leader/Peer 消息使用清晰的 system reminder/XML wrapper，包含 from 和 taskId。
- 成员普通最终文本只进入成员 transcript，不自动成为 Task completion。

### 2.4 成员上下文恢复

- 新成员：MemberPreset system prompt + Team communication addendum + Task brief。
- 重启恢复：从成员 transcript 重建 Message[]，跳过损坏事件并记录 recovery error。
- Task brief 必须包含目标、验收标准、依赖结论、ownerId、assignmentVersion、writeScope 和结果格式。
- 成员上下文达到阈值时复用现有压缩机制；压缩事件只写成员 transcript。

### 2.5 Task 调度和成员状态

- 一个成员最多一个 `in_progress` Task。
- `pending` 且依赖完成才可运行。
- writeScope 冲突时成员进入 `waiting(write_scope_conflict)`。
- 依赖未满足时进入 `waiting(task_dependency)`。
- 权限等待由 ToolScheduler 事件映射为 `waiting(permission_approval)`。
- Task 完成后成员清 `currentTaskId` 并进入 idle。
- LLM/tool failure 不直接 completed；写 `lastFailure`，由 Leader 决定 failed 或 retry。

### 2.6 租约

- Task 进入 in_progress 时写 lease。
- 每个成员 turn 开始、工具开始和工具结束时续约。
- 长后台 Bash 由 task update/heartbeat adapter 续约；如果无法保证，V1 TeamMember 禁止把当前 Task 留给无监控后台进程后进入 idle。
- runtime load 时先 release expired lease，再启动成员。

### 2.7 事件输出

统一 emit Plan 0 定义的四类 RuntimeStreamEvent：

- 成员状态变化。
- Task 变化。
- Message 写入/已读。
- 成员 transcript event。

同一状态变更不得 emit 两种互相冲突的完整快照。

## 测试要求

- 两个 readonly 成员并行运行互不污染上下文。
- 同一成员连续接两个 Task，第二个能看到自身历史但不继承其他成员历史。
- 成员文本回复不自动 completed Task。
- completion 必须通过 TaskStore 且 assignmentVersion 匹配。
- 用户直聊成员后 Leader 收到 mirror notice。
- stop graceful 在 turn 边界停止；force 立即 abort。
- 重启恢复后 idle 成员可再次被唤醒。
- `finalizeTeamWork()` 在 runnable pending、active member、pending approval 或 unread control message 时拒绝。

## 验证命令

```bash
pnpm --filter @actspace/agent-core test -- src/team/runtime/test
pnpm --filter @actspace/agent-core test -- src/engine/test/loop.test.ts
pnpm --filter @actspace/agent-core typecheck
```

## 完成标准

- fake LLM 环境下可完整运行 Leader 外部编排的多成员 Task 流程。
- MemberRuntime 不依赖 renderer 或 Electron。
- Solo 和现有 Agent/Explore runner 测试无回归。

