# 后台任务：后台 Bash、后台子智能体与任务工具

> 状态：当前事实（2026-10-22 实现，分支 `feat/background-tasks`）。执行计划见 [`20261022-background-tasks`](../../exec-plans/completed/20261022-background-tasks.md)，Electron 人工验收见[执行摘要](../../exec-runs/20261022-background-tasks/execution-summary.md)。

参考：Kimi Code `packages/agent-core-v2/src/agent/task/`（统一任务登记表 + TaskList / TaskOutput / TaskStop / WaitFor）、OpenCode `packages/core/src/job.ts`（只做后台 + 完成通知、反轮询）。本设计取两者交集里最简单的部分。

## 要解决什么

1. `bash` 已能转后台（`blockMs` 超时或 `blockMs=0`），但完成通知只在下一步开头被读到：Agent 一旦给出最终回复，通知就躺到用户下次发消息为止。
2. 子智能体 `agent` / `explore` 只能阻塞执行，没有后台模式。
3. Agent 没有统一的方式查看、停止、等待后台工作；`bash_output` / `bash_kill` 只覆盖 Bash。
4. 上下文压缩或隔了很久之后，模型不知道还有哪些后台任务在跑。

## 已确认的决定

| 编号 | 决定 |
|---|---|
| D1 | 后台通知要叫醒 Agent：回合内收件箱有通知时不结束回合；会话空闲时 Host 用通知开一轮新 Run。用户消息优先，通知随用户 Run 一起被读到。用户停止主会话不停止后台任务。队列因用户停止而暂停时不自动唤醒，通知留到下次 Run |
| D2 | Host 层一个统一的后台任务登记表，每会话一份视图，Bash 与子智能体是两种 kind |
| D3 | 工具 `task_list` / `task_output` / `task_stop` / `task_wait`；删除 `bash_output` / `bash_kill` |
| D4 | 运行中子智能体的 `task_output` 给进度摘要：步数、工具调用数、最近 3 次工具调用 |
| D5 | 子智能体完成通知内联最终文本（UTF-8 超过 8KB 截断并附子会话引用）；`task_wait` 已报告或 `task_stop` 停掉的任务不再发通知；`task_output` 只读，照常通知 |
| D6 | 后台子智能体与父回合的中断信号解耦；Host 关闭时停止；重启后标记 `lost` 并提醒模型；每会话最多 4 个运行中的后台子智能体（Bash 维持 8 个） |
| D7 | 不做「前台转后台」按钮，子智能体只支持一开始 `background: true` |
| D8 | 新上下文插件 `packages/context/background-tasks`：每轮开始更新一次清单，只列运行中任务、写绝对开始时间；全部结束写收尾文本；子智能体不注入 |
| D9 | 卡片状态沿用现有状态（子智能体：运行中/已完成/失败/已停止；Bash：运行/成功/失败/取消），后台只多一个「后台」标签；Bash 原来三种后台徽标合并为这一个标签 |
| D10 | 空闲唤醒的那一轮在聊天里以一行细分隔行开头：`⟲ 后台任务 · <kind>: <标题> · <状态>`，可展开看通知原文 |
| — | 子智能体工具这期不变（只读四件套、不嵌套） |

## 总体结构

```text
Harness 侧（随 Harness 装载）                    Host 侧（随 Runtime 存活）
┌──────────────────────────────┐            ┌────────────────────────────────────┐
│ shell-tools: bash            │─register──▶│ BackgroundTaskRegistry              │
│ subagent-tools: agent/explore│─register──▶│  · 每个任务一个 handle              │
│ background-tasks: task_*     │──query────▶│  · list / output / stop / wait      │
│ context-background-tasks     │──list─────▶│  · 通知去重 → MainAgentInbox        │
└──────────────────────────────┘            │  · journal: background/task 事件    │
                                            │  · 唤醒 → AgentService.wake()       │
                                            └────────────────────────────────────┘
```

### 统一登记表

新包 `packages/background-tasks`（`@actspace/background-tasks`），纯逻辑，不依赖具体工具：

```ts
type BackgroundTaskKind = "bash" | "agent";
type BackgroundTaskStatus = "running" | "completed" | "failed" | "stopped" | "lost";

interface BackgroundTaskSource {          // 由 Bash / 子智能体实现
  readonly kind: BackgroundTaskKind;
  readonly sessionId: string;             // 发起任务的父会话
  readonly callId: string;                // 发起它的工具调用，UI 用它找卡片
  readonly description: string;           // bash: intent 或命令；agent: 任务首行
  readonly done: Promise<BackgroundTaskTerminal>;
  output(): Promise<BackgroundTaskOutput>;  // 非阻塞快照
  stop(reason: string): Promise<void>;
}
type BackgroundTaskTerminal = { status: Exclude<BackgroundTaskStatus, "running" | "lost">; summary: string; body: string; exitCode?: number | null };
```

- 任务 id：Bash 沿用 `bash_<uuid>`，子智能体用 `agent_<invocationId>`。
- 实例由 `AgentRuntimeService` 创建，作为 Host 服务 `actspace.host.background-tasks` 加入 `DEFAULT_HARNESS_SHARED_SERVICES`，Harness 插件注入使用。
- 归属校验：所有查询都带调用方 `sessionId`，跨会话一律返回 `TASK_NOT_FOUND`。
- Host 关闭（`AgentRuntimeService.dispose`）时停止全部运行中任务。
- Bash 进程仍由 `BashTaskRegistry` 持有（Harness 卸载会杀进程，行为不变）；它只把 handle 登记过来，不再自己发通知。

### 持久事件

父会话写一个新的 core 扩展事件 `background/task`（加入 `PERSISTED_EXTENSION_EVENT_TYPES`）：

```json
{ "op": "start",  "taskId": "agent_…", "kind": "agent", "callId": "…", "description": "…", "startedAt": "ISO" }
{ "op": "settle", "taskId": "agent_…", "status": "completed", "exitCode": 0, "endedAt": "ISO", "delivery": "notified" }
```

`delivery` 取 `notified | wait | stopped | lost`，记录结果是怎么交给模型的。它的用途：

- 前端卡片读它决定后台 Bash 的真实状态（修掉「后台运行中」永远不变的问题）。
- 重启后恢复：会话打开时，找出有 `start` 没有 `settle` 的任务，补写 `settle status=lost` 并入收件箱一条提醒（不唤醒）。

### 通知

格式在旧 `<task_notification>` 上加 `kind`，子智能体用 `<result>` 代替 `<output_tail>`：

```text
<task_notification>
<task_id>agent_…</task_id>
<kind>agent</kind>
<status>completed</status>
<summary>Background agent completed: 调研 Kimi 后台工具</summary>
<result>…最终文本，超过 8KB 截断…</result>
</task_notification>
```

- Bash 的 `output_match`（`notifyOnOutput` 订阅）保留，走登记表发出，不参与去重、不写 `settle`。
- `lost` 通知文本：后台任务因应用退出失去联系，不要假设它已完成；子智能体可以重新委派。
- 收件箱 `enqueue` 增加可选 `notice` 元数据 `{ taskId, kind, title, status }`，供前端分隔行使用。

去重规则（每个任务的通知状态：`pending → enqueued(messageId) | suppressed`）：

- `task_wait` 把某任务的终态交给了模型：标记 `suppressed`；若通知已入收件箱尚未被读，`discard(messageId, "delivered-via-wait")`。
- `task_stop`：先 `suppressed` 再停止，`task_stop` 的返回就是结果。
- `task_output`：不改变通知状态。

### 唤醒

1. **回合内**：`loop.ts` 判断回合结束时，除了用户插话（`inputSource.hasPending`），也看收件箱是否有待读的 `task_notification`；有就继续一步（仍受 `maxSteps` 约束）。
2. **回合被中断或失败**：`discardAll` 只丢旧 steer / next-turn，不再丢 `task_notification`，通知留到下一次 Run。
3. **空闲唤醒**：登记表入收件箱后调用 `AgentService.wake(sessionId)`；Run 结算后 `SessionRunManager` 也检查一次（防止通知恰好在最后一步之后到达）。满足以下全部条件才提交唤醒任务：会话调度器已打开、未关闭/失败/阻塞、未暂停、未在 drain、没有运行中的 Run 或维护操作、队列为空、收件箱有待读通知、队列里没有尚未执行的唤醒任务。
4. **唤醒任务**：任务内容 `{ "kind": "background-wake" }`（`@actspace/shared/runtime-v2` 新增 `isBackgroundWake`）。TaskLedger 领取时**不写** `user/message`；RunFactory 以 `runTurn({ wake: true })` 执行；Loop 第一步领取收件箱并标记 `opensTurn`；第一步什么都没领到就直接以 `completed` 结束、不调模型。

暂停中的会话不唤醒；用户恢复或发新消息后，那次 Run 第一步自然读到通知。`isIdleForReconfigure` 不再把待读的任务通知当成忙。

### 子智能体后台模式

- `agent` / `explore` 的 schema 加 `background: boolean`（默认 false），描述写明「后台运行立即返回，完成时自动通知，不要轮询」。
- `OneShotSubagentProvider` 新增 `launch(input)`：完成 `delegation/requested`、创建子会话、取得 Harness 租约并登记子 Ledger 后返回 `{ invocationId, childSessionId, childAgentId, result: Promise }`；`invoke()` 改为 `launch()` 后等待 `result`，前台行为不变。
- 后台调用不把工具调用的 `signal` 接到子智能体的 controller；停止只能通过 `task_stop`（映射为 `aborted` → 登记表 `stopped`）、超时或 Host 关闭。
- 每会话运行中的后台子智能体达到 4 个时，工具返回 `BACKGROUND_TASK_LIMIT`，不创建子会话。
- 工具立即返回：`task_id`、`child_session_id`、`automatic_notification: true` 和「不要轮询」的下一步提示；`detail.delegation` 加 `background: true`。
- 进度摘要从子会话 Journal 读取：`step/start` 计数、`tool/call` 计数、最近 3 个 `tool/call` 的工具名和参数摘要（每条 ≤ 120 字符）。
- `delegation/completed` 仍在子会话结束时写入父会话；`repairSubagentPublications` 已能处理「父工具结果先于子终态」的情况（它只在工具调用未终结时补写结果）。

### 四个工具

插件 `packages/tools/background-tasks`（`actspace.background-tasks`），工具定义在 Harness，数据来自 Host 登记表。权限一律 allow；模式白名单 plan 与 agent 都加入（plan 模式下可后台 `explore`）。

| 工具 | 参数 | 返回 |
|---|---|---|
| `task_list` | `activeOnly?: boolean = true`, `limit?: 1–50 = 20` | 首行 `active_background_tasks: N` 或 `background_tasks: N`；每个任务一段：`task_id / kind / status / description / started_at / ended_at` |
| `task_output` | `taskId` | 元数据块 + 预览。Bash：输出最后 32KB 与输出文件路径（看全文用 `read_file`）；子智能体运行中：进度摘要；已结束：最终文本（截断规则同通知） |
| `task_stop` | `taskId`, `reason?` | 停止后的状态；已结束直接返回当前状态 |
| `task_wait` | `taskId?`, `timeoutSeconds: 1–120` | 不传 `taskId` 时等调用时已在运行的任意一个结束。`completed`：结束任务的记录 + 预览；`timed_out`：仍在运行的列表（不是错误）；工具调用被中断时返回 `interrupted`，不停止任务 |

工具描述统一强调：完成会自动通知，优先等通知；不要用 sleep 或反复 `task_output` 轮询；`task_wait` 只在没有其他事可做时使用。

### 上下文插件

`packages/context/background-tasks`，owner `actspace.context-background-tasks`，服务 `context.source.background-tasks`，加入 `CONTEXT_PLUGIN_PACKAGES`、`DEFAULT_HARNESS_ENTRIES` 与 `agent-factory-plugin` 的 `createSources`。只对 `descriptor.kind === "main"` 生效。

- 每轮开始（`context.request.turnId` 变化）读一次 `list(sessionId, activeOnly)` 生成文本，本轮内复用同一文本；引擎的 supplement 去重保证文本没变就不重复写入，压缩后由引擎 `refresh` 重新挂到末尾。
- 有运行中任务：

  ```text
  Background tasks still running (this list supersedes earlier lists; completion notifications supersede it):
  - bash_… · bash · pnpm test · started 2026-10-22T14:02:11+08:00
  - agent_… · agent · 调研 Kimi 后台工具 · started 2026-10-22T14:05:40+08:00
  Do not start duplicates. Use task_output / task_wait only if you need them.
  ```
- 曾有过清单、现在全部结束：写 `No background tasks are running.`（不调用 `remove`，避免抽走历史 supplement 破坏 prompt cache）。
- 会话从未有过后台任务：不写。

### 前端

- **卡片**：Bash 卡片的 `backgroundStatus` 三态徽标换成单个「后台」标签；后台 Bash 的卡片状态取 `background/task` 的 `settle`（无 settle 为运行中，completed→成功，failed→失败，stopped/lost→取消）。子智能体卡片 `detail.delegation.background === true` 时显示「后台」标签，状态取 `delegation/completed`，不再取工具结果的终态。
- **分隔行**：选择器对 `opensTurn` 的任务通知产出 `background_notice` 块；`groupMessagesIntoTurns` 让它像压缩块一样开启一个 `user: null` 的轮次，但后续回复归入同一轮。运行中的唤醒回合由 Loop 的 `inbox-claimed`（带 `notice` 与正文）映射为 live 事件 `background_notice_claimed`，live 块与 durable 块共用 renderKey `turn:<runId>:background-notice:0`。Web 端以同款分隔线显示（不可展开）。
- **队列与运行态**：`projectTaskQueue`、`applyTaskSnapshot` 的 userBlock、会话标题生成跳过唤醒任务。
- **轨迹**：`contextCategory` 新增 owner `actspace.context-background-tasks` → 「后台任务」，以现有「上下文」行显示。
- 清理不再有发射方的 `bash_task_update` 事件链路。

## 排除的方案

- **子智能体内 Bash 转后台 / 子智能体拥有 task 工具**（Kimi）：子智能体这期工具不变，没有后台来源。
- **只靠通知、不给模型工具**（OpenCode）：用户确认要 list / output / stop / wait。
- **用 synthetic user 消息直接作为唤醒 Run 的输入**：会进聊天记录且与现有「任务通知不进聊天」的投影冲突；改用唤醒任务 + 收件箱。
- **每一步更新任务清单**：与工具结果、完成通知重复，增加上下文开销。
- **重启后恢复子智能体继续运行**：当前不支持 continuable Subagent。
