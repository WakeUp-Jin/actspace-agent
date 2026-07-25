# Agent 形态 — Agent Team 设计规范

## 当前状态

本文档是 Agent Team 形态的设计事实来源。Agent Team 是三种 Agent 形态之一（Solo / Team / Room），用于结构化编程开发场景：一个 Leader 与多个团队成员通过共享任务、显式通信和独立上下文协作完成用户目标。

本文档保持单文件维护，同时覆盖核心概念、运行时协议、文件存储、并发写入、上下文隔离和前端交互。实现阶段应以本文定义的不变量为准，不机械复制 Claude Code 的进程、轮询或文件布局细节。

UI 交互参考原型：`docs/design-docs/collaboration/agent-team-preview.html`

## 设计原则

### 1. Agent Form 由用户决定

Agent 形态由用户在创建会话时主动选择，**会话级绑定、不可中途切换**。

用户选择 Team，表示用户已经判断当前任务适合多智能体协作。系统不再让模型判断是否需要从 Solo 升级为 Team，也不会在执行过程中自动切换形态。

模型可以决定 Team 内是否需要拆任务、启动哪些成员和如何调度，但不能改变用户选择的 Agent Form。

### 2. 保持扁平团队

- Team 只有一个 Leader。
- Leader 是用户的默认交互入口和最终汇总者。
- Leader 根据 Team 模板中允许的成员预设启动团队成员。
- 团队成员之间地位平级，可以通信，但不能再启动新的团队成员。
- 团队成员如需局部探索，可以使用普通 SubAgent run；普通 SubAgent 不进入 Team 成员列表，也不参与共享任务认领。

### 3. Task 是工作状态的唯一事实来源

- 任务的 owner、状态、依赖、结果和失败信息只写入 Task 文件。
- Mailbox 消息只传递意图、提醒、控制请求和唤醒通知，不保存第二份权威任务状态。
- 团队成员进入 idle，不代表任务自动完成。
- 成员普通文本回复，不代表任务自动完成。
- 任务只有通过原子 `update_task` 写入 `completed` 和结果后才算完成。

### 4. 简单抽象优先

Team 核心只保留四个主要对象：

```text
TeamTemplate
├── MemberPreset[]
└── Team 配置

TeamRuntime
├── TeamMember[]
├── TeamTask[]
└── TeamMessage[]
```

不额外引入 Attempt、Handoff、Cursor 等独立领域对象。失败重试、租约恢复和结果引用直接保存在 Task 或 TeamMember 上，完整过程由 transcript 和 session 事件保留。

### 5. 文件负责持久化，Runtime 负责自动投递

- Team 模板、成员预设、任务、Mailbox 和 transcript 都持久化到本地文件。
- Team Runtime 可以使用同进程事件立即唤醒成员，但内存事件不作为持久化事实来源。
- 模型只使用 `send_message`；不暴露 `read_inbox`，也不要求模型管理文件锁、轮询和已读状态。

## 概念定义

### Agent 形态体系

```text
Agent 形态
├── Solo（单智能体）— 一个模型做所有事，现有方案不变
├── Team（编程开发场景）— 本文档
└── Room（讨论/搜索/辩论场景）— 见 agent-form-room.md
```

```typescript
type AgentForm =
  | { kind: "solo"; modelId: ModelId; taskRouting?: TaskRoutingConfig }
  | { kind: "team"; config: TeamConfig }
  | { kind: "room"; config: RoomConfig };
```

### 能力等级

三种 Agent 形态共享模型能力分层：

| 等级 | ID | 中文 | 适用 |
|------|-----|------|------|
| 旗舰 | `think` | 深思 | 规划、审查、复杂推理 |
| 均衡 | `steady` | 稳态 | 执行、编码、工具调度 |
| 轻量 | `flash` | 极速 | 搜索、摘要、简单任务 |

用户通过 TierBinding 配置每个等级对应的具体模型：

```typescript
type ModelTier = "think" | "steady" | "flash";

interface TierBinding {
  think: ModelId;
  steady: ModelId;
  flash: ModelId;
}
```

首版 TierBinding 内的三个模型应属于同一 provider，避免跨 provider 消息格式转换和输出风格不一致。

### 任务驱动模型路由

能力等级不仅控制不同成员使用什么模型，也控制同一个 Agent 内部辅助任务使用什么模型。

| 任务类型 | 代码触发点 | 说明 |
|---------|-----------|------|
| `main_reasoning` | `runAgentLoop` → `llm.stream()` | Leader 或成员的主要推理 |
| `tool_summarize` | 工具输出过长时的摘要 | 压缩大段工具输出 |
| `context_compress` | `maybeCompact` → `summarizer` | 历史消息压缩 |
| `title_generate` | `generateSessionTitle` | 自动生成会话标题 |
| `subagent_explore` | Explore SubAgent | 代码库探索 |

```typescript
interface TaskRoutingConfig {
  auxiliaryTier: ModelTier;
}
```

默认行为：

- `main_reasoning` 使用 Leader 或团队成员自身的 tier。
- `tool_summarize`、`context_compress`、`title_generate` 默认使用 `flash`。
- TeamMember 可以通过成员预设覆盖辅助任务 tier。

## 成员预设与团队成员

### 成员预设 MemberPreset

成员预设是一份跨会话复用的 Agent 配置，不是正在运行的 Agent。

它定义：

- 这个成员适合承担什么职责。
- 默认使用哪个模型能力等级。
- 可以使用哪些工具。
- 默认可写入哪些路径。
- 需要追加哪些 system prompt。

```typescript
interface MemberPreset {
  id: string;
  name: string;
  description: string;
  tier: ModelTier;
  auxiliaryTier?: ModelTier;
  tools: ToolPermission;
  defaultWriteScope: WriteScope;
  maxTurns?: number;
  systemPrompt?: string;
}
```

例如 `Coder` 是一个成员预设；`coder-auth` 和 `coder-settings` 是根据该预设启动的两个团队成员。

### 团队成员 TeamMember

团队成员是 Leader 根据成员预设启动出来、在当前 Team 会话中实际运行的 Agent。

每个团队成员都有独立的：

- 成员 ID 和名称。
- Agent Loop 和上下文。
- Inbox。
- Transcript。
- 当前任务。
- 工具权限和 writeScope。
- 生命周期状态。

```typescript
type MemberStatus =
  | "starting"
  | "active"
  | "waiting"
  | "idle"
  | "stopping"
  | "stopped"
  | "failed";

type MemberWaitingReason =
  | "task_dependency"
  | "write_scope_conflict"
  | "permission_approval"
  | "leader_instruction";

interface TeamMember {
  id: string;
  name: string;
  presetId: string;
  tier: ModelTier;
  auxiliaryTier?: ModelTier;
  tools: ToolPermission;
  writeScope: WriteScope;
  status: MemberStatus;
  waitingReason?: MemberWaitingReason;
  currentTaskId?: string;
  spawnedAt: string;
  stoppedAt?: string;
}
```

一句话关系：

> 成员预设定义 Agent 能做什么；团队成员是根据成员预设启动出来、正在实际工作的 Agent。

### 工具权限

```typescript
type ToolPermission =
  | { kind: "all" }
  | { kind: "readonly" }
  | { kind: "allowlist"; tools: string[] }
  | { kind: "denylist"; tools: string[] };
```

工具权限决定成员是否具备某类能力，writeScope 进一步限制写入工具允许影响的文件范围。成员预设不能绕过统一工具权限调度层，也不能替用户批准高风险操作。

## Team 配置与预置模板

```typescript
interface TeamConfig {
  id: string;
  name: string;
  leaderTier: ModelTier;
  memberPresetIds: string[];
  tierBinding: TierBinding;
  peerMessagingEnabled: boolean;
  taskAssignment: "leader-dispatch" | "self-claim";
  maxConcurrentMembers: number;
}
```

预置模板：

| 模板名 | Leader | 成员预设组合 | 适用场景 |
|--------|--------|-------------|---------|
| 编程开发 | 深思 | Planner + Coder + Reviewer | 中大型重构、功能开发 |
| 快速编码 | 稳态 | Coder + Explorer | 小功能、快速迭代 |
| 深度研究 | 深思 | Explorer + Planner + Summarizer | 技术调研、方案对比 |

成员预设只定义能力边界，不代表固定流水线顺序。Planner、Coder、Reviewer 的实际启动顺序和执行顺序由 Task 依赖图决定。

## 核心架构

```text
用户
 ↓ 默认对话
Leader
 ├── 理解用户目标
 ├── 创建和更新任务
 ├── 启动、停止和调度团队成员
 ├── 处理成员权限请求和异常
 ├── 汇总 Task 结果并回复用户
 └── 简单问题可以直接回答，不强制拆任务
      │
      ├── planner-1      ← 根据 Planner 成员预设启动
      ├── coder-auth     ← 根据 Coder 成员预设启动
      ├── coder-settings ← 根据 Coder 成员预设启动
      └── reviewer-1     ← 根据 Reviewer 成员预设启动
```

约束：

- Leader 只能启动当前 Team 模板允许的成员预设。
- 同一个成员预设可以启动多个团队成员。
- 每个团队成员名称在当前 Team 内唯一。
- 一个团队成员同一时间最多执行一个任务。
- 团队成员不能启动新的团队成员，团队成员列表保持扁平。

## Task 设计

### Task 文件格式

```typescript
type TeamTaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";

interface TeamTaskFile {
  id: string;
  subject: string;
  description: string;
  acceptanceCriteria?: string[];

  ownerId?: string;
  status: TeamTaskStatus;
  blockedBy: string[];

  result?: string;
  resultRefs?: string[];

  assignmentVersion: number;
  leaseExpiresAt?: string;
  retryCount: number;
  lastFailure?: string;

  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}
```

只存储 `blockedBy`，不同时保存反向 `blocks`。哪些任务被当前任务阻塞，可以从全部 Task 的 `blockedBy` 派生，避免双向依赖字段不一致。

### Task 状态规则

```text
pending → in_progress → completed
                      → failed
pending / in_progress → cancelled
failed → pending（Leader 明确重试）
```

- `blocked` 不作为持久化状态；当 `blockedBy` 中存在未完成任务时，运行时派生为 blocked。
- 创建或更新依赖时必须检测环，禁止形成循环依赖。
- `completed` 必须同时具有可用的 `result` 或 `resultRefs`。
- `failed` 表示当前任务无法继续，需要 Leader 决定重试、改写任务或取消。

### 原子认领和分配

任务认领、分配和完成都必须在 Task 文件锁内完成。

认领任务时原子检查：

1. Task 仍然存在。
2. Task 仍是 `pending`。
3. Task 没有 owner。
4. 所有 `blockedBy` 已完成。
5. 当前成员没有其他 `in_progress` Task。
6. 当前成员的 writeScope 不与活跃写成员冲突。

分配或重新分配 owner 时，`assignmentVersion` 加一：

```text
Task #3 首次分配给 coder-auth
assignmentVersion = 1

coder-auth 失效，Task 重新分配给 coder-settings
assignmentVersion = 2
```

成员调用 `update_task` 时必须携带自己收到的 `assignmentVersion`。旧成员迟到提交旧版本结果时，运行时拒绝写入，避免覆盖新 owner 的执行结果。

### 租约与恢复

Task 进入 `in_progress` 后写入 `leaseExpiresAt`。活跃成员在 Agent turn 和长工具调用期间续约。

应用恢复时：

```text
status = in_progress
+ leaseExpiresAt 已过期
→ status = pending
→ ownerId = undefined
→ retryCount + 1
→ lastFailure = "member lease expired"
→ assignmentVersion + 1
```

完整失败过程保存在成员 transcript、session 事件和运行日志中，不再创建独立 Attempt 对象。

### Task 结果是唯一结果来源

成员完成任务时：

1. 校验 ownerId 和 assignmentVersion。
2. 写入 `result` / `resultRefs`。
3. 将状态更新为 `completed`。
4. 清除成员 `currentTaskId`。
5. 成员进入 `idle`。
6. 向 Leader 发送普通 idle 通知，唤醒 Leader 查看 Task。

Mailbox 不发送 `task_result`，也不保存另一份任务状态。Leader 汇总结果时直接读取 Task 文件。

## 执行流程

```text
1. 用户输入 → Leader 收到
2. Leader 判断当前请求是否需要拆任务
   a. 简单问题 → Leader 直接回答
   b. 复杂工作 → 创建 Task 图
3. Leader 根据成员预设启动团队成员
4. Leader 通过 update_task(ownerId) 分配任务，或开放给成员 self-claim
5. 成员收到任务通知，读取 Task 最新状态后开始执行
6. 成员完成后原子更新 Task 结果和状态
7. 下游 Task 的依赖满足后变为可认领
8. Leader 检查任务、成员、消息和权限状态
9. Leader 显式确认本轮 Team 工作可以结束并回复用户
```

### 本轮工作结束条件

运行时可以判断 Team 是否进入静默状态，但不能代替 Leader 判断目标是否完成。

静默条件：

- 没有 `in_progress` Task。
- 没有仍可执行但未处理的 `pending` Task。
- 没有等待中的工具权限请求。
- 没有未投递的控制消息。
- 所有已启动成员处于 `idle`、`stopped` 或 `failed`。

Leader 使用 `finalize_team_work` 显式确认当前用户请求已完成。该操作不会把会话切换为 Solo；后续用户继续提问时，会话仍然保持 Team 形态，Leader 可以复用空闲成员或重新启动成员。

## writeScope 与并行写入

### writeScope 定义

writeScope 是团队成员权限的一部分，约束该成员可以修改的文件范围。

```typescript
type WriteScope =
  | { mode: "readonly" }
  | { mode: "paths"; paths: string[] }
  | { mode: "workspace" };
```

成员预设提供默认 writeScope，Leader 启动成员时可以在不超出模板和用户权限的前提下覆盖具体路径。

### 三种模式

#### readonly

```typescript
{ mode: "readonly" }
```

- 不允许调用 `write_file`、`edit_file` 等写入工具。
- Bash 只允许明确的只读命令。
- Planner、Explorer、Reviewer 默认应使用 readonly。
- readonly 成员之间可以自由并行。

#### paths

```typescript
{
  mode: "paths",
  paths: [
    "packages/agent-core/src/team/**",
    "packages/agent-core/src/team/test/**"
  ]
}
```

- 写文件工具目标必须位于允许路径内。
- 路径在执行前规范化为 workspace 内绝对路径后再比较。
- 同一成员可以拥有多个不连续路径。
- 成员发现需要修改范围外文件时，必须请求 Leader 更新 writeScope，不能自行越界。

#### workspace

```typescript
{ mode: "workspace" }
```

- 成员可以在当前 workspace 内写入。
- workspace 写成员执行写任务时，其他可写成员必须等待。
- 只读成员仍可并行工作。

### 并发规则

```text
readonly + readonly
→ 允许并行

readonly + paths/workspace
→ 允许并行

paths A + paths B，范围不重叠
→ 允许并行

paths A + paths B，范围重叠
→ 后启动成员进入 waiting(write_scope_conflict)

workspace + 任意可写成员
→ 只允许一个成员执行写任务
```

writeScope 冲突检查是 Team Runtime 的逻辑调度，不依赖操作系统文件锁。文件锁只能避免同一瞬间写坏文件，不能避免两个 Agent 在不同时间覆盖彼此的逻辑修改。

Leader 如果直接执行写工具，也必须进入同一套 writeScope 冲突检查；Leader 不能绕过成员写入租约。

### 动态调整 writeScope

Leader 使用：

```typescript
interface UpdateMemberScopeInput {
  memberId: string;
  writeScope: WriteScope;
  reason: string;
}
```

扩大范围前必须检查：

- 新范围是否仍在 workspace 边界内。
- 是否与活跃可写成员冲突。
- 是否需要用户工具权限审核。

存在冲突时，新范围不能立即生效；成员进入 `waiting(write_scope_conflict)`，等冲突解除后再继续。

### Bash 写入规则

- 明确只读的 Bash 命令按照普通只读规则执行。
- 可以可靠识别目标路径的写命令，目标必须位于成员 writeScope 内。
- 无法可靠判断写入范围的 Bash 命令，只允许 `workspace` 成员执行。
- Bash 自身的高风险命令、越界路径和用户审核仍由统一工具权限调度层处理。

## Mailbox 通信

### 基本原则

- 每个 Leader 和团队成员都有独立 Inbox。
- Agent 使用 `send_message(to, text)` 发送消息。
- Team Runtime 自动读取和注入未读消息。
- Agent 不拥有 `read_inbox` 工具。
- Mailbox 不保存权威 Task 结果。

### Inbox 文件格式

参考 Claude Code 的简化方式，每个 Inbox 使用一个 JSON 数组文件，消息通过 `read` 标记消费状态，不使用 JSONL cursor。

```typescript
// {userData}/agent-forms/runtime/{sessionId}/inboxes/{memberId}.json
type InboxFile = TeamMessage[];

type TeamMessageType =
  | "message"
  | "task_assignment_notification"
  | "idle_notification"
  | "shutdown_request"
  | "permission_protocol"
  | "user_message"
  | "user_steering_notice";

interface TeamMessage {
  id: string;
  type: TeamMessageType;
  from: string;
  to: string;
  text: string;
  timestamp: string;
  read: boolean;
  taskId?: string;
  summary?: string;
}
```

### 写入规则

写入新消息时：

1. 确保 Inbox 文件存在。
2. 获取 Inbox 文件锁。
3. 在锁内重新读取最新消息数组。
4. 追加一条 `read: false` 的新消息。
5. 原子写回文件。
6. 释放锁并触发同进程 wake-up event。

### 读取和投递规则

Team Runtime 每次检查 Inbox 时读取所有 `read: false` 的消息，不只读取最后一条。

消息优先级：

```text
关闭和权限控制消息
> 用户直接消息
> Leader 消息
> Peer 消息
```

同一优先级内部保持 FIFO。

- 成员空闲时，普通未读消息可以合并后启动一个新 turn。
- 成员忙碌时，普通消息保持未读并在 UI 显示 pending；当前 turn 结束后再投递。
- 控制消息可以按协议优先处理，避免被大量 Peer 消息饿死。
- 消息成功注入 Agent 上下文或可靠处理后，才标记为 `read: true`。
- UI 和 Runtime 使用 `message.id` 去重，避免重复轮询造成重复显示。

### Inbox 清理

Inbox 不是永久通信档案。消息进入成员 transcript 或主 session 后，可以定期清理旧的已读消息：

- 所有未读消息必须保留。
- 默认保留最近 100 条已读消息用于排障。
- 更早的已读消息可以删除。

### 消息类型边界

#### 任务分配通知

```typescript
interface TaskAssignmentNotification {
  type: "task_assignment_notification";
  taskId: string;
  assignmentVersion: number;
}
```

通知只负责唤醒成员。成员收到通知后必须重新读取 Task 文件，不依赖消息中的标题、描述或状态副本。

#### Idle 通知

```typescript
interface IdleNotification {
  type: "idle_notification";
  from: string;
  summary?: string;
}
```

Idle 只表示成员当前没有继续执行，不携带 `completedStatus`，也不代表 Task 已完成。Leader 收到后按需读取 Task 最新状态。

#### 关闭请求

关闭采用请求—确认流程：

1. Leader 发送 `shutdown_request`。
2. 成员在安全边界停止当前工作并确认。
3. 超时仍未确认时，Leader 可以强制终止。
4. 终止成员时，其 `in_progress` Task 通过租约恢复规则重新开放。

## 用户直接与团队成员交流

### 输入路由

- 用户位于 Leader Tab 时，输入发送给 Leader。
- 用户切换到成员 Tab 时，输入直接发送给当前团队成员。
- 运行中和 idle 成员都可以接收用户消息。
- stopped / failed 成员不再接收新消息。

### Leader 镜像通知

用户直接向成员发送消息时，系统同时向 Leader 写入一条 `user_steering_notice`：

```text
用户直接向 coder-auth 发送消息：
“认证错误码需要兼容旧接口。”
```

镜像通知让 Leader 知道用户已介入成员工作，但不要求 Leader 转发消息，也不复制成员全部对话内容。

### 用户消息与 Task 契约

- 普通询问、补充说明和方向提醒可以由成员直接处理。
- 如果用户消息改变任务目标、验收标准或依赖，成员必须请求 Leader 或通过受限 `update_task` 更新 Task。
- 如果用户消息要求修改 writeScope 外的文件，成员必须申请扩大 writeScope。
- 成员最终工作结果仍写入 Task，不能只停留在成员 Tab 对话中。

## 上下文隔离

### 核心原则

- Leader 维护与用户的完整对话上下文。
- 团队成员拥有独立上下文，不继承 Leader 的完整对话。
- Leader 给成员的输入是 Task brief，而不是整段会话复制。
- 成员完整工具输出进入自己的 transcript，不默认进入 Leader 上下文。
- Leader 通过 Task 结果、必要消息和用户直聊镜像获得协作进展。

### Task brief 最小内容

成员开始任务时至少获得：

- 目标和背景。
- Task subject / description。
- 验收标准。
- 当前 ownerId 和 assignmentVersion。
- 依赖任务的必要结论。
- 相关文件、已有方案和已知限制。
- 成员工具权限和 writeScope。
- 期望的结果摘要格式。

### Transcript

每个团队成员的完整执行过程记录为 JSONL：

```text
{userData}/agent-forms/runtime/{sessionId}/transcripts/{memberId}.jsonl
```

每行复用现有 `SessionEvent` 结构。用户打开成员 Tab 时，前端从 transcript 渲染完整消息、thinking、工具调用、其他成员消息和用户直聊内容。

## 文件系统架构

```text
{userData}/agent-forms/
├── member-presets/                     ← 成员预设，跨会话复用
│   ├── planner.json
│   ├── coder.json
│   ├── reviewer.json
│   └── ...
├── teams/                              ← Team 模板
│   ├── coding-dev.json
│   ├── quick-code.json
│   └── ...
└── runtime/
    └── {sessionId}/                    ← 当前 Team 会话运行状态
        ├── team-state.json
        ├── inboxes/
        │   ├── leader.json
        │   ├── {memberId}.json
        │   └── ...
        ├── tasks/
        │   ├── 1.json
        │   ├── 2.json
        │   └── .highwatermark
        └── transcripts/
            ├── {memberId}.jsonl
            └── ...
```

### 成员预设文件

```typescript
// {userData}/agent-forms/member-presets/{id}.json
interface MemberPresetFile extends MemberPreset {
  createdAt: string;
  updatedAt: string;
}
```

### Team 模板文件

```typescript
// {userData}/agent-forms/teams/{id}.json
interface TeamTemplateFile {
  id: string;
  name: string;
  description: string;
  leaderTier: ModelTier;
  memberPresetIds: string[];
  tierBinding: TierBinding;
  peerMessagingEnabled: boolean;
  taskAssignment: "leader-dispatch" | "self-claim";
  maxConcurrentMembers: number;
  builtIn?: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### Team 运行状态

```typescript
// {userData}/agent-forms/runtime/{sessionId}/team-state.json
interface TeamRuntimeState {
  sessionId: string;
  teamTemplateId: string;
  tierBinding: TierBinding;
  leader: {
    agentId: string;
    tier: ModelTier;
    status: "active" | "idle" | "waiting" | "failed";
  };
  members: TeamMember[];
  startedAt: string;
  updatedAt: string;
}
```

### 文件锁

Mailbox 和 Task 文件写入都需要文件锁：

- 多个成员可能同时向同一 Inbox 写消息。
- 多个成员可能同时尝试认领同一 Task。
- Leader 和成员可能同时更新 Task。

锁使用 retry with backoff。首版可参考 Claude Code 的配置：`retries: 10, minTimeout: 5ms, maxTimeout: 100ms`，Task 列表级高竞争操作可以使用更高重试预算。

## 前端设计规范

### 整体布局

采用标签页切换模式：

```text
┌──────────────────────────────────────────────────────────────────┐
│ [Leader 🟢] [📋 任务 2/3] [planner-1 ✓] [coder-auth 🟢] [reviewer-1 💤] │
├──────────────────────────────────────────────────────────────────┤
│ 状态栏: 任务进度 2/3 | coder-auth 工作中 | 预估费用 ¥0.12          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                         当前标签页内容                             │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ [对话: Leader / 当前成员] [输入框]                      [发送]     │
└──────────────────────────────────────────────────────────────────┘
```

### 标签页

| 标签 | 内容 | 说明 |
|------|------|------|
| Leader | 用户与 Leader 对话、成员结果摘要、协调通知 | 默认页，不展开成员工具细节 |
| 任务 | Task 列表、依赖、owner、结果和通信记录 | 全局工作视角 |
| 成员名 | 该成员完整执行过程 | 支持用户直接交流 |

### Leader 页面

- 用户与 Leader 的对话保持 Solo 形态相同的视觉语言。
- 进行中的成员显示轻量状态和“查看详情”入口。
- 完成结果从 Task `result` / `resultRefs` 渲染，不从 Mailbox `task_result` 渲染。
- 用户直聊成员后，Leader 页面显示一条简洁协调通知。
- 工具调用细节默认不进入 Leader 页面，用户可以打开成员 Tab 查看。

### 成员页面

每个成员 Tab 是完整单智能体视图：

- 顶部显示成员名称、成员预设、状态、耗时、Token 和 writeScope。
- 显示当前 Task、验收标准和 assignmentVersion。
- 消息流显示 thinking、工具调用、Leader/Peer 消息和用户直聊。
- 用户可以直接输入消息给该成员。
- 提供暂停、停止和请求 Leader 调整 writeScope 的入口。

### 状态展示

| 状态 | 含义 |
|------|------|
| active | 正在推理或执行工具 |
| waiting | 有工作，但正在等待依赖、writeScope 或权限 |
| idle | 当前没有正在执行的任务，可以接收新任务或消息 |
| stopped | 已正常停止 |
| failed | 成员运行失败，相关 Task 等待恢复 |

颜色必须遵守 `docs/design-docs/frontend/front-主题与配色规范.md` 的语义 token，不在本文固定具体颜色字面量。

### 任务页面

任务页面显示：

- Task 状态、标题、owner、依赖、retryCount。
- waiting / blocked 原因。
- result 和 resultRefs。
- 与 Task 相关的 Leader、成员和用户消息时间线。
- 重新分配、重试、取消等 Leader 操作。

## 成员预设和 Team 模板管理

### 创建方式

| 方式 | 触发时机 | 持久化位置 | 说明 |
|------|---------|-----------|------|
| 系统预置成员 | 安装时提供 | `member-presets/*.json` | 可复制，不直接修改内置项 |
| 用户创建成员预设 | 设置页面 | `member-presets/*.json` | 跨会话复用 |
| 用户选择 Team 模板 | 创建 Team 会话 | `teams/*.json` | 会话级绑定，不可切换 |
| Leader 启动团队成员 | 运行时 | `runtime/{sessionId}/` | 仅当前 Team 会话存在 |

### 成员预设管理

入口：设置页面 → Agent 形态 → 成员预设管理。

创建流程：

1. 填写名称和职责描述。
2. 选择主推理能力等级。
3. 配置工具权限。
4. 配置默认 writeScope。
5. 可选配置辅助任务等级、最大轮次和 system prompt。
6. 保存到 `member-presets/{id}.json`。

支持复制、导入和导出成员预设。

### Team 模板管理

入口：设置页面 → Agent 形态 → Team 模板管理。

创建流程：

1. 填写 Team 名称、描述和 Leader 等级。
2. 从成员预设列表添加当前 Team 允许使用的成员预设。
3. 配置 Tier Binding。
4. 配置 Peer 通信、任务分配模式和最大并发成员数。
5. 保存到 `teams/{id}.json`。

## Leader 内部工具

| 工具名 | 功能 |
|--------|------|
| `create_task` | 创建 Task 和依赖 |
| `update_task` | 更新 Task、分配 owner、重试或取消 |
| `spawn_member` | 根据允许的成员预设启动团队成员 |
| `update_member_scope` | 调整成员 writeScope |
| `send_message` | 给指定成员发送消息 |
| `terminate_member` | 请求或强制停止成员 |
| `inspect_team` | 读取 Task、成员、冲突和权限状态 |
| `finalize_team_work` | 显式确认当前用户请求可以结束 |

不提供：

- `collect_results`：Leader 直接读取 Task 结果。
- `assign_task`：使用 `update_task(ownerId)` 完成，避免重复状态入口。
- `read_inbox`：Runtime 自动投递。

## 团队成员内部工具

团队成员除成员预设允许的业务工具外，拥有：

| 工具名 | 功能 |
|--------|------|
| `list_tasks` | 查看共享任务列表 |
| `get_task` | 读取 Task 最新状态 |
| `claim_task` | self-claim 模式下原子认领任务 |
| `update_task` | 更新自己拥有的 Task 状态和结果 |
| `send_message` | 给 Leader 或 Peer 发送消息 |

约束：

- 成员只能更新自己拥有且 assignmentVersion 匹配的 Task。
- 成员不能直接修改其他成员状态、owner 或 writeScope。
- 成员不能调用 `spawn_member`。
- 成员不提供 `report_result`；完成结果写入 Task。
- 成员不提供 `read_inbox`；消息由 Runtime 自动注入。

## 团队成员生命周期

```text
spawn
→ starting
→ active
→ idle / waiting
→ active（收到新任务或消息）
→ stopping
→ stopped

任意运行阶段发生不可恢复错误
→ failed
```

规则：

- `idle` 只表示成员当前可接新工作。
- `waiting` 表示已有工作但被依赖、writeScope 或权限阻塞。
- 成员 turn 结束后，如 Task 尚未完成，应根据原因进入 waiting 或继续 active，不能自动把 Task 标记 completed。
- 成员停止或失败时，当前 Task 通过租约恢复规则重新开放。

## 与 Claude Code 的核心取舍

本文只借鉴 Claude Code Agent Team 的核心设计思路，不追求实现细节一致。

| 方面 | Claude Code 当前源码 | actspace 设计 |
|------|----------------------|---------------|
| Team 入口 | 运行中创建 Team | 用户创建会话时选择 Team，形态不可切换 |
| 成员模型 | 扁平成员列表，支持 pane 与 in-process backend | 扁平 in-process TeamMember |
| 成员定义 | `.claude/agents/*.md` | `member-presets/*.json` |
| 任务 | 独立 Task 列表，文件锁和 highwatermark | 独立 Task 文件，Task 是唯一事实源 |
| Mailbox | 每成员 JSON 数组、`read` 标记、文件锁 | 同类设计，Runtime 自动投递，无 cursor |
| 用户直聊成员 | in-process teammate 支持 transcript 内直接输入 | 支持，并额外向 Leader 镜像协调通知 |
| 并行写入 | 可使用 worktree 等隔离机制 | 首版使用成员 writeScope 和冲突调度 |
| 模型选择 | 成员模型可配置 | Tier + Binding |

借鉴：

- 扁平、可寻址的长期运行成员。
- 共享 Task 列表。
- 独立上下文和 transcript。
- 显式 `send_message` 通信。
- 文件 Mailbox、文件锁和未读消息恢复。
- 用户可查看并直接输入到成员 transcript。

不机械复制：

- tmux / iTerm pane 管理。
- 多 backend 兼容层。
- 模型手动读取 Inbox。
- Mailbox 中重复保存任务结果。
- 把 Claude Code 的运行中 TeamCreate 作为本产品的 Agent Form 入口。

## 与现有模块的接入边界

| 现有模块 | 改动范围 |
|---------|---------|
| `packages/shared/src/model-config.ts` | 增加 tier 相关共享类型 |
| `packages/shared/src/session.ts` | 新增 Team member、Task 和 stream event 类型 |
| `packages/agent-core/src/engine/loop.ts` | 团队成员复用现有 Agent Loop |
| `packages/agent-core/src/engine/agent.ts` | 团队成员使用独立 Agent 实例和上下文 |
| `packages/agent-core/src/engine/bridge.ts` | 增加 Team 编排与消息注入逻辑 |
| `packages/desktop/src/main/agent-turn.ts` | 根据 AgentForm 构建 Team Runtime |
| `packages/desktop/src/renderer/` | 新增 Team 标签、任务页和成员页 |
| IPC `RunTurnInput` | 增加 `agentForm` 字段 |
| 新增 `packages/agent-core/src/team/` | Team 编排、成员、Task、Mailbox 和恢复逻辑 |

```text
packages/agent-core/src/team/
├── index.ts
├── team-runtime.ts
├── member-runtime.ts
├── mailbox.ts
├── task-store.ts
├── member-preset-loader.ts
└── types.ts
```

## 非目标

- 不支持 Team 会话中途切换为 Solo 或 Room。
- 不让模型自动判断是否应该进入 Team。
- 不实现跨进程或 tmux 团队成员。
- 不允许团队成员继续创建团队成员；Team roster 保持扁平。
- 不引入 Attempt 独立对象。
- 不使用 Inbox cursor；Mailbox 使用 JSON 数组和 `read` 状态。
- 不在 Mailbox 中保存 `task_result` 权威副本。
- 不实现跨 provider TierBinding。
- 首版不依赖 worktree 解决所有写入冲突；优先使用 writeScope 调度。

## 决策记录

- 2026-07-10：确定三种形态命名 Solo / Team / Room，会话级绑定不可切换。
- 2026-07-10：能力等级命名为 深思（think）/ 稳态（steady）/ 极速（flash）。
- 2026-07-10：Team UI 采用标签页切换；Leader 页面不展开成员中间工具调用。
- 2026-07-10：团队成员上下文独立，不继承 Leader 完整对话。
- 2026-07-10：首版 TierBinding 约束同 provider。
- 2026-07-10：Team 运行状态、Task、Mailbox 和 transcript 使用本地文件持久化。
- 2026-07-10：辅助任务默认路由到 flash 等级。
- 2026-07-11：将 Role / SubAgentRole 统一改为成员预设 MemberPreset，运行实例统一称团队成员 TeamMember。
- 2026-07-11：Task 作为 owner、状态和结果的唯一事实来源，删除 `task_result`、`report_result` 和 `collect_results`。
- 2026-07-11：不引入 Attempt；使用 Task assignmentVersion、leaseExpiresAt 和 retryCount 支持重分配与恢复。
- 2026-07-11：writeScope 绑定团队成员，并按 readonly / paths / workspace 处理并行写入冲突。
- 2026-07-11：Mailbox 使用每成员 JSON 数组和 `read` 状态，不使用 cursor；Runtime 自动投递所有未读消息。
- 2026-07-11：用户可以直接与团队成员交流，同时向 Leader 镜像协调通知。
- 2026-07-11：Idle 与 Task completed 严格分离，当前用户请求由 Leader 显式 `finalize_team_work`。
