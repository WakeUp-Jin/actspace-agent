# Agent 形态 — Agent Room 设计规范

## 当前状态

本文档是 Agent Room 形态的设计事实来源。Agent Room 是三种 Agent 形态之一（Solo / Team / Room），用于开放性讨论、搜索、辩论和头脑风暴场景：多个平等 Agent 在共享消息流中各自发言。

UI 交互参考原型：`docs/design-docs/collaboration/agent-room-preview.html`。该原型当前只作为消息流与角色布局的早期视觉参考；本文新增的状态文字、运行详情、错误恢复和停止控制尚未同步到原型，实现前需要单独更新。

设计参考：[Raft — Is having agents in the room meant to be chaotic?](https://raft.build/zh-cn/resources/blog/is-having-agents-in-the-room-meant-to-be-chaotic/)

参与者身份、配置、Activity 和 Members 设置页以 `docs/design-docs/collaboration/agent-members.md` 为事实来源。Room 不创建 Agent，也不保存另一份 persona / model / Skills 配置；它只引用跨 Room 持久存在的 Member。

## 概念定义

### 与 Agent Team 的根本区别

| 维度 | Agent Team | Agent Room |
|------|-----------|-----------|
| 结构 | 树状（Leader → 子代理） | 扁平（平等参与者） |
| 控制流 | Leader 编排调度 | 自主判断是否发言 |
| 通信方式 | 任务下发 + 结果上报 | 共享消息流 |
| 上下文 | 隔离（各自独立） | Member 在当前 Room 的私有运行历史 + 共享 Room Log 按需读取 |
| 输出方式 | Tab 分离 | 单一消息流，按时间排列 |
| 适用场景 | 有明确步骤的执行任务 | 开放性讨论、分析、辩论 |

### 核心隐喻

Agent Room 像一个**群聊房间**：
- 多个 Agent + 用户在同一个房间里
- 消息流是单向时间线——谁先完成谁先说
- 思考可以并行，输出串行
- 用户可以 @指定某个 Agent 回答

类比 Node.js 的事件循环：单线程输出，异步并行处理。

## 核心架构

### Member 思维风格

以下角色是创建持久 Agent Member 时可使用的起步预设，不是每个 Room 临时生成的 Agent：

| 角色 | 风格 | 作用 | 推荐等级 |
|------|------|------|---------|
| 搜索者 (Searcher) | 信息导向 | 搜索资料、获取事实 | 极速 |
| 分析师 (Analyst) | 逻辑导向 | 深入分析、建立框架 | 深思 |
| 质疑者 (Challenger) | 批判导向 | 找反例、质疑假设 | 深思 |
| 创想者 (Ideator) | 发散导向 | 联想类比、提出新可能 | 稳态 |
| 总结者 (Synthesizer) | 收敛导向 | 在房间已有足够观点或被显式 @时整理共识、提炼要点 | 稳态 |

用户先在设置页创建和维护 Member，再在创建 Room 时选择已有 Member。一个“搜索者”Member 可以同时加入多个 Room，并在所有 Room 中保持同一个稳定身份。

这些预设代表并行参与讨论的思维视角，不代表固定流水线阶段。Member 的真实 persona、模型、推理等级和能力来自全局 `AgentMember` 配置；Room 运行只读取启动时的 `memberConfigVersion`。

### 类型定义

```typescript
/** Room 配置 */
interface RoomConfig {
  id: string;
  name: string;
  /** 只保存稳定 Member 引用，不复制 Member 能力配置 */
  memberIds: string[];
  sourceTemplateId?: string;
  sourceTemplateVersion?: number;
  cycleBudget: RoomCycleBudget;
  maxAgentMessagesPerCycle: number; // 单轮最多产生的 Agent 可见消息数，默认 memberIds.length + 3
  maxRepliesPerMember: number;      // 单个 Member 在同一轮最多发言次数，默认 2
  maxMentionDepth: number;          // Agent @ Agent 的最大接力深度，默认 2
  maxDraftReviewAttempts: number;   // Shelved Draft 最大复审次数，默认 3
  forceSendAfterHeldCount: number;  // Held 达到多少次后允许 force-send，默认 2
}

/** 用于快速创建 Room 的可版本化配方 */
interface RoomTemplate {
  id: string;
  version: number;
  name: string;
  description: string;
  /** 用于引导用户选择已有 Member，不内嵌 Member 配置 */
  suggestedMemberLanes: string[];
  discussionDefaults: Omit<
    RoomConfig,
    "id" | "name" | "memberIds" | "sourceTemplateId" | "sourceTemplateVersion"
  >;
}

interface RoomCycleBudget {
  /** 本轮最多实际请求 LLM 的次数；建议默认 max(memberIds.length * 3, 8) */
  maxLlmCalls: number;
  /** 从 cycle 创建开始计算的最长运行时间；建议默认 120 秒 */
  maxDurationMs: number;
}

interface RoomCycleUsage {
  /** 已经向 provider 发出的真实请求次数，包含复审、协议修复和重试 */
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  /** 根据当前 provider/model 价目估算；缺少价格配置时可以省略 */
  estimatedCost?: number;
}

type ToolEffect =
  | "read"
  | "internal-control"
  | "workspace-write"
  | "external-side-effect"
  | "process-control";

/** Agent 首次响应当前 Room Input 时的显式决策 */
type RoomResponseDecision =
  | { action: "reply"; content: string; mentionedMemberIds?: string[] }
  | { action: "silence"; reason?: string };

/** 一条用户消息触发的一轮有限讨论 */
interface RoomCycle {
  id: string;
  rootUserMessageId: string;
  status: "running" | "completed" | "limit-reached" | "aborted";
  endReason?:
    | "completed"
    | "completed-with-errors"
    | "message-limit"
    | "llm-call-budget"
    | "duration-budget"
    | "user-stopped"
    | "superseded-by-user-message"
    | "session-closed"
    | "fatal-error";
  supersededByCycleId?: string;
  agentMessageCount: number;
  replyCountByMember: Record<string, number>;
  maxMentionDepthReached: number;
  budget: RoomCycleBudget;
  usage: RoomCycleUsage;
}
```

### 预置 Room 模板

| 模板名 | 建议 Member 组合 | 适用场景 |
|--------|-----------|---------|
| 头脑风暴 | 搜索者(极速) + 分析师(深思) + 创想者(稳态) + 质疑者(深思) | 探索新方向、激发创意 |
| 深度研究 | 搜索者(极速) + 分析师(深思) + 总结者(稳态) | 搜索者与分析师并行提供事实和逻辑视角；总结者在上下文充分或被 @时收敛 |
| 方案评审 | 分析师(深思) + 质疑者(深思) + 总结者(稳态) | 分析与质疑并行评估；总结者在已有充分观点或被 @时整理结论 |
| 全员讨论 | 全部五个角色 | 全方位多角度讨论 |

### Room 创建与 Member 引用

Room 模板是讨论策略和建议成员类型的创建配方；Agent Member 是全局持久实体；Room Session 保存自己的 Room Log、cycle、讨论限制和稳定 Member 引用。

```text
AgentMember ───────┐
AgentMember ───────┼── RoomConfig.memberIds[]
AgentMember ───────┘
```

模板升级只改变新建 Room 的建议组合和讨论默认值，不创建或修改 Member。Member Profile 修改后，该 Member 在所有 Room 的下一次 AgentRun 使用新配置；历史消息保持不变，每次运行记录 `memberConfigVersion`。

V0 创建流程只包含三步：

1. 从“头脑风暴 / 深度研究 / 方案评审 / 全员讨论”中选择讨论模板，或直接创建空白 Room。
2. 确认 Room 名称，从 Members 列表勾选已有 Agent Member；缺少合适成员时跳转设置页创建 Member 后返回。
3. 创建 Room；写入 `memberIds` 和 Room 自己的讨论策略，然后进入消息界面。

Room 保存 `sourceTemplateId + sourceTemplateVersion` 只用于追溯。运行时从全局 Member 存储按 `memberId` 读取配置，并在 AgentRun 启动时捕获版本；Room 不重新解释模板，也不内嵌 Member Profile。

#### 创建后的可修改边界

Room 名称和讨论限制属于 Room；名称可以修改，运行中的 cycle 固定使用启动时预算。Member 名称、persona、模型、能力和 Skills 在 Members 设置页维护，不在 Room 内编辑。

Room V0 是否支持讨论中途增删 Member 留到实现计划单独收口；无论成员关系如何变化，历史 Room 消息都通过稳定 `memberId` 保留发送者身份，不复制或重写 Member Profile。

## 执行机制

### 发言流程

```
1. 用户发送一条消息 → 创建一个 RoomCycle
2. RoomCoordinator 根据 @提及确定本轮初始参与者：
   a. 用户消息不含 @ → 启动房间内所有 Agent
   b. 用户消息包含 @ → 只启动被 @的 Agent
3. 被启动的 Agent 并行思考（各自配置的模型等级），显式返回 `reply` 或 `silence`
4. `reply` 形成 Draft 并进入 Shelved Draft 提交流程；`silence` 直接完成本次运行，不写入 Room Log
5. 第一个完成并通过提交检查的 Agent → 输出到消息流
6. 后续 Agent 完成时执行 Shelved Draft 检查：
   a. 检查房间在自己思考期间新增了什么
   b. 如果自己要说的已被覆盖 → 放弃
   c. 如果还有补充价值 → 输出（可能修改过）
7. Agent 普通回复只写入消息流，不自动触发其他 Agent
8. Agent 回复中显式 @另一个 Agent → 在未超过本轮限制时，只启动被 @的 Agent
9. 没有运行中的 Agent 且没有待处理的 @提及 → RoomCycle 结束
```

### 首次响应与沉默

被唤醒不等于必须向 Room 发送消息。每个 Agent 首次处理当前 Room Input 时，必须显式选择：

```typescript
type RoomResponseDecision =
  | { action: "reply"; content: string; mentionedMemberIds?: string[] }
  | { action: "silence"; reason?: string };
```

- `reply`：内容先形成 Draft，再进入 Shelved Draft 原子提交检查；不能绕过 Draft 协议直接写入 Room Log。
- `silence`：本次 Agent 运行正常结束，不形成 Draft，不写入 Room Log，也不产生用户可见消息。

首次响应的 `silence` 与 Held Draft 复审阶段的 `silence` 含义一致，都是 Agent 主动判断“不需要发言”；区别是前者尚未形成 Draft，后者会让已存在的 Draft 进入 `expired` 状态。

`silence` 不增加 `agentMessageCount`，也不增加 `replyCountByMember`，但仍然产生真实 LLM 调用和 token 成本。RoomCoordinator 会把选择沉默的 Member 标记为本次运行已完成；当所有已启动 Member 均已回复、沉默或结束 Draft 复审，且没有待处理 @时，RoomCycle 才结束。

各预置角色的默认沉默规则写入对应 system prompt：

- **搜索者**：当前问题不需要外部事实或资料检索时可以沉默。
- **分析师**：没有新的分析框架、推理或重要补充时可以沉默。
- **质疑者**：没有值得指出的反例、风险或错误假设时可以沉默。
- **创想者**：发散不会带来新价值或会干扰当前聚焦讨论时可以沉默。
- **总结者**：Room Log 中尚未存在足够观点、共识或分歧时应沉默；后续由用户或其他 Agent 通过 @显式唤醒后再读取 Room Log 并收敛。

普通 Agent 回复不会自动唤醒曾经沉默的总结者。需要总结时，由用户发送 `@总结者`，或由某个 Agent 在可见回复中显式 `@总结者`。

### 结构化终止工具

Room 不要求模型在普通文本中输出 JSON，也不把自由文本直接当作最终决策。Agent 在完成检索、阅读和分析后，必须通过内部终止工具提交结构化结果。

初次响应阶段固定注入：

```typescript
type RoomRespondInput =
  | {
      action: "reply";
      content: string;
      mentionedMemberIds?: string[];
    }
  | {
      action: "silence";
      reason?: string;
    };

room_respond(input: RoomRespondInput): void;
```

Held Draft 复审阶段固定注入：

```typescript
type ResolveHeldDraftInput =
  | {
      action: "revise";
      content: string;
      mentionedMemberIds?: string[];
    }
  | { action: "send" }
  | { action: "silence"; reason?: string }
  | { action: "force-send" };

room_resolve_draft(input: ResolveHeldDraftInput): void;
```

两个工具都是 `internal-control` 工具：执行器只捕获和校验决策，不直接写入 Room Log，也不绕过 DraftManager。RoomAgentRuntime 检测到合法终止工具后，通过现有 `shouldStopAfterTurn` 结束当前 Agent Loop。

终止工具必须是该 assistant message 中唯一的工具调用。模型不能在同一条消息中同时调用 `read_room_log` 和 `room_respond`，因为它在构造终止决策时尚未看到读取结果；出现混合调用时，协议校验失败并要求下一轮重新提交决策。

如果模型直接输出普通文本但没有调用当前阶段的终止工具：

1. RoomAgentRuntime 注入一次协议修复消息，要求模型不要重复分析，只使用正确终止工具提交决策。
2. 最多修复一次。
3. 第二次仍未产生合法工具调用时，本次 Agent 运行标记为 `failed`，原始文本不得降级发布到 Room Log。

终止工具调用、校验错误和协议修复都进入该 Member 在当前 Room 的私有运行历史，不进入共享消息流。

### 消息触发规则

| 消息来源 | 消息形式 | 触发行为 |
|---------|---------|---------|
| 用户 | 不含 @ | 启动房间内所有 Agent |
| 用户 | @一个或多个 Agent | 只启动被 @的 Agent |
| Agent | 普通回复 | 不触发其他 Agent |
| Agent | @一个或多个 Agent | 只启动被 @的 Agent，但必须通过本轮讨论限制检查 |

Agent 的回复进入所有参与者共享的可见消息流，但“消息可见”和“唤醒 Agent”是两个不同动作。普通 Agent 回复不会产生全员广播式模型调用。

### RoomCycle 与讨论上限

每条用户消息创建一个独立 `RoomCycle`。限制按 cycle 计算，用户发送下一条消息时创建新的 cycle 并重新计数。

首版使用三层兜底：

- `maxAgentMessagesPerCycle`：限制一条用户消息最多产生多少条 Agent 可见消息；默认值为 Room Member 数量 + 3，为初始发言之外预留少量 @接力空间。
- `maxRepliesPerMember`：限制单个 Member 在同一 cycle 中重复发言；默认 2。
- `maxMentionDepth`：限制 Agent 之间通过 @连续接力的深度；默认 2。

达到任一限制后：

- 已经进入消息流的 @提及仍正常显示。
- RoomCoordinator 不再因为该 @启动新 Agent。
- 前端显示“本轮讨论已达到上限，可以发送新消息继续讨论”。
- 当前已经运行的 Agent 完成 Shelved Draft 检查后结束，不再产生新的接力调用。

### RoomCycle 运行预算

可见消息数量不能代表 Room 的真实运行成本。Agent 选择 `silence`、读取 Room Log 后继续推理、复审 Shelved Draft、执行协议修复或重试模型请求时，都可能不产生新的 Room 消息，但仍会调用 LLM。

因此 Room V0 在讨论上限之外，再为每个 cycle 设置两个独立的硬预算：

```typescript
interface RoomCycleBudget {
  maxLlmCalls: number;
  maxDurationMs: number;
}
```

- `maxLlmCalls`：限制本轮实际向 provider 发出的请求次数。首次回答、Agent 被 @后的回答、Held Draft 复审、协议修复和 provider 重试都计入；每次真实请求都计一次，无论请求最终成功还是失败。
- `maxDurationMs`：限制 cycle 从创建到结束的总墙钟时间，防止模型、工具或调度过程长期挂起。

RoomCoordinator 在分派 LLM 请求前原子预留调用额度，避免多个并行 Agent 同时越过上限。已经成功预留并发出的请求可以正常完成；额度耗尽后不再启动新的 Agent 调用、Draft 复审、协议修复或重试。若某个迟到 Draft 因 Room 已变化而需要再次复审，但此时已无调用额度，该 Draft 以 `budget-exhausted` 原因过期，系统不会自动替 Agent 选择 `send` 或 `force-send`。

到达 `maxDurationMs` 时，Coordinator 触发 cycle 的父级 AbortSignal，中止仍在运行的 Agent。无论因为调用次数还是运行时间结束：

- 已经成功提交到 Room Log 的消息全部保留。
- 尚未分派的 @接力队列被清空。
- 未提交 Draft 进入 `expired` / `aborted`，并保存预算耗尽原因。
- RoomCycle 状态变为 `limit-reached`，`endReason` 分别记录 `llm-call-budget` 或 `duration-budget`。
- Header 显示“本轮已达到运行限制”；用户仍可发送新消息创建新的 cycle。

默认建议使用：

```typescript
cycleBudget: {
  maxLlmCalls: Math.max(memberIds.length * 3, 8),
  maxDurationMs: 120_000,
}
```

调用额度约为 Agent 数量的三倍，为首次并行回答之外的少量 @接力、Draft 复审和协议修复留出空间；Room 模板或用户设置可以显式覆盖。

Token 和金额在 V0 只做观测，不作为硬拦截条件：

```typescript
interface RoomCycleUsage {
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost?: number;
}
```

原因是最终输出 Token 只能在请求完成后确认，金额还依赖 provider、模型和价格配置。运行时在每次请求结束后归并 usage，Header 或运行详情可以展示本轮调用次数、Token 和估算金额；缺少可靠价格配置时不展示金额，不伪造精确成本。

Room V0 因而保留三类互补兜底：

- 讨论上限控制“房间里最多出现多少 Agent 消息和 @接力”。
- LLM 调用预算控制“背后最多发生多少次模型请求”。
- cycle 时长控制“这一轮最多运行多久”。

### 失败隔离与重试

Room 区分“同一次 Agent 运行内部的自动重试”“单 Agent 最终失败”和“整个 Room 无法继续”三类情况，不使用一个含糊的重试状态覆盖所有错误。

#### Provider 自动重试

网络超时、限流等被现有 LLMService 判定为可重试的 provider 错误，继续使用现有指数退避和自动重试机制：

- 自动重试仍属于同一个 `agentRunId`，不会创建新的 RoomCycle，也不会产生 Room 消息。
- 每次真实发出的 provider 请求都必须单独占用 `maxLlmCalls`，包括失败请求和重试请求。
- 自动重试前再次检查 cycle 的 AbortSignal、剩余调用预算和运行时限；任一条件不满足时停止重试。
- 达到 LLMService 重试上限或 RoomCycle 预算后，本次 Agent 运行才进入最终 `failed`。

结构化终止协议错误不使用无限自动重试，继续遵守“最多一次协议修复”的规则。工具错误以精确的结构化错误返回 Agent；Agent 是否调整参数再次调用由正常 Agent Loop 决定，由此产生的后续 LLM 请求同样占用调用预算。

#### 单 Agent 最终失败

单个 Member 的 AgentRun 最终失败只结束自己的 `agentRunId`，不终止其他 Member，也不回滚已经提交的 Room 消息。失败本身不增加 `agentMessageCount` 或 `replyCountByMember`。

当所有其他 Agent、Draft 复审和 @队列都已结束时：

- 没有失败 Agent：cycle 使用 `status: "completed"`、`endReason: "completed"`。
- 存在一个或多个失败 Agent：cycle 仍使用 `status: "completed"`，但记录 `endReason: "completed-with-errors"`。

共享消息流可以显示紧凑系统提示，例如“本轮有 1 个 Agent 未完成：分析师”；完整错误分类、自动重试次数和 provider 摘要只进入运行详情与该 Agent 私有 transcript。

#### 用户再次询问

V0 不在后台复活已经结束的旧 cycle，也不提供会静默重置旧预算的“原地重试”。失败 Agent 的恢复动作显示为“再次询问”：

1. 用户点击后，Composer 预填结构化 Mention 和可编辑文本，例如 `@分析师 请重新回答刚才的问题`。
2. 用户确认发送后，消息正常写入 Room Log。
3. 该用户消息创建新的 RoomCycle，只启动被 Mention 的 Agent。
4. 新运行使用当前 Room Log 快照和新的 cycle 预算，不继承旧 cycle 的调用计数、截止时间或待处理队列。

这样重试仍是用户可见、可编辑的正常消息行为，不需要为旧 cycle 设计恢复、重新计费和并发冲突规则。

#### Room 级致命错误

只有无法保证 Room 共享事实和调度一致性的错误才中止整个 cycle，例如：

- Room Log 或共享 SessionEvent 无法可靠提交，无法判断消息是否已经写入。
- RoomCoordinator 的活动 cycle 状态损坏或无法恢复。
- Session 已关闭，或持久化层明确不可用。

此时 cycle 使用 `status: "aborted"`、`endReason: "fatal-error"`，触发父级 AbortSignal，清空尚未执行的 @队列并使未提交 Draft 失效。已经确认持久化成功的 Room 消息保留；不能确认成功的 Draft 不得降级显示成共享消息。

### 用户并发输入与 Cycle 替换

同一个 Room 同时最多只有一个 `active` RoomCycle。用户在当前 cycle 尚未结束时发送新消息，不排队、不与旧 cycle 并行，也不作为复杂 steering 注入；新消息原子中止旧 cycle，并创建新的 cycle。

RoomCoordinator 在同一个调度临界区完成：

```text
1. 生成 newCycleId
2. oldCycle.status = aborted
3. oldCycle.endReason = superseded-by-user-message
4. oldCycle.supersededByCycleId = newCycleId
5. 清空旧 cycle 尚未执行的 @接力队列
6. 使旧 cycle 未提交 Draft 失效
7. 把新用户消息写入 Room Log，并关联 newCycleId
8. 创建并激活新 cycle
9. 根据新消息的结构化 Mention 启动全部 Agent 或目标 Agent
10. 向旧 cycle 仍在运行的 Agent 发送 AbortSignal
```

已经成功提交到 Room Log 的旧 cycle 消息保留，不回滚。`generating`、`ready`、`held`、`reviewing` 等未提交工作统一变为 `aborted` / `expired`。

provider 即使在 AbortSignal 后迟到返回，Draft 提交前仍必须先检查：

```typescript
draft.cycleId === activeCycleId && cycle.status === "running"
```

检查失败时直接过期。`force-send` 只能绕过 Room 版本新鲜度检查，不能绕过 cycle 已中止状态。

新 cycle 的消息数、单 Agent 回复次数、@深度和 Draft 复审计数全部重新开始。首版不支持多个 active cycle，也不实现多 Agent steering。

### RoomCoordinator

`RoomCoordinator` 是确定性的后端运行时组件，不是 LLM Agent，也不会持续调用模型充当房间主持人。它只在消息或 Agent 状态事件到来时执行机械调度：

1. 为用户消息创建 `RoomCycle`。
2. 解析用户或 Agent 消息中的 @目标。
3. 启动全部 Agent 或被 @的 Agent。
4. 维护运行队列、每个 Agent 的回复次数、@深度和本轮消息数。
5. 在没有运行任务和待处理 @时关闭 cycle。

首版不实现预设讨论阶段，也不让 Coordinator 通过 LLM 判断“当前还缺少哪个视角”。需要固定搜索→分析→审查→总结顺序的任务优先使用 Agent Team；Room 保持开放讨论和显式 @接力。

### Room Log 按需读取机制

首版不实现独立 Inbox、pending 消息列表、已读游标或 `peek/pull`。所有用户可见消息只保存一份，统一进入共享 `Room Log`；每个 Agent 在被唤醒时只自动获得当前触发消息，再通过内部只读工具 `read_room_log` 自主选择需要进入上下文的历史范围。

#### Room Log 消息序号

Room Log 中的每条消息都有单调递增的 `roomSeq`：

```typescript
interface RoomMessage {
  id: string;
  roomSeq: number;
  sender: { kind: "user" | "agent"; id: string };
  content: string;
  createdAt: string;
}
```

`roomSeq` 表示“房间第几条消息”，不是底层 JSONL 或文本文件的物理行号。工具和 Agent prompt 只能依赖消息序号，不能依赖 Room Log 的具体落盘格式。

#### Room Input

每次 Agent 被用户广播、用户 @、Agent @或 Held Draft 修订流程唤醒时，运行时注入一个 Room Input：

```typescript
interface RoomInput {
  trigger: "user-broadcast" | "user-mention" | "agent-mention" | "held-draft";
  triggerMessage: {
    roomSeq: number;
    senderId: string;
    content: string;
  };
  /** Agent 启动这一刻可读取的 Room Log 最大序号 */
  roomSnapshotEndSeq: number;
}
```

示例：

```text
<room_input>
trigger: user-mention
trigger_message_seq: 42
room_snapshot_end_seq: 45

用户：
@分析师，请结合前面的讨论分析一下风险。
</room_input>
```

`trigger_message_seq` 是真正触发本次运行的消息序号；`room_snapshot_end_seq` 是 Agent 实际启动时房间已有的最大消息序号。两者可能不同，例如 Agent 等待调度期间房间又新增了消息。

#### `read_room_log` 工具

Room Agent 固定拥有内部只读工具：

```typescript
interface ReadRoomLogInput {
  /** 起始消息序号，闭区间 */
  startSeq: number;
  /** 结束消息序号，闭区间 */
  endSeq: number;
}
```

调用 `read_room_log({ startSeq: 12, endSeq: 18 })` 返回第 12 至 18 条消息，包含两端。

工具约束：

- `startSeq >= 1`
- `startSeq <= endSeq`
- `endSeq <= roomSnapshotEndSeq`
- 单次读取消息数受固定上限保护，首版默认最多 50 条
- 工具输出仍经过统一 OutputTruncator，避免少量超长消息撑爆上下文
- 工具只能读取当前 Room，不能通过参数跨 Room 或跨 Session 访问

`endSeq` 的最大值固定为本次 Agent 启动时的 `roomSnapshotEndSeq`，而不是工具执行瞬间的实时 Room 最新序号。这样本次运行始终基于稳定快照；推理期间新增的消息由 Shelved Draft 机制处理。

工具返回实际读取范围、快照最大序号和带 `roomSeq` 的消息内容：

```text
<room_log_result>
requested_range: 12-18
returned_range: 12-18
room_snapshot_end_seq: 45

[room_seq=12] [用户]
我们需要讨论数据库选型。

[room_seq=13] [搜索者]
我找到三份 PostgreSQL 相关资料。

...

[room_seq=18] [分析师]
我倾向于本地 SQLite 加同步层。
</room_log_result>
```

工具调用和结果会进入该 Agent 自己的运行历史。Agent 下次被唤醒时，可以从自己的历史中看到之前读取过哪些区间，自主决定继续读取新范围或重新读取旧范围；首版不额外维护 `lastSeenRoomSeq` 或已读区间状态。

Agent 的读取原则写入 Room Agent system prompt：

1. 先判断当前 Room Input 是否足以独立回答。
2. 当前消息引用“前面的讨论”“刚才的结果”或其他 Agent 观点时，再调用 `read_room_log`。
3. 优先读取较小且最近的相关范围，不默认从第 1 条开始。
4. 检查自己的工具调用历史，避免无意义地重复读取相同范围。
5. 只把完成当前回复所需的 Room Log 片段拉入上下文。

### 工具权限与副作用边界

Room V0 是只读讨论空间。多个平等 Agent 可以并行研究和分析，但不能直接修改 workspace、运行通用 shell 或执行外部副作用。

工具注册表为每个工具提供 `effect` 元数据：

```typescript
type ToolEffect =
  | "read"
  | "internal-control"
  | "workspace-write"
  | "external-side-effect"
  | "process-control";
```

Room V0 只允许：

```text
read
internal-control
```

- `read`：`read_room_log`、`read_file`、`grep`、`glob`、`list_directory`、`web_search`、`web_fetch` 等不改变外部状态的工具。
- `internal-control`：`room_respond`、`room_resolve_draft` 等只返回结构化协议决策、不直接修改 Room 或外部系统的内部工具。
- `workspace-write`：`write_file`、`edit_file`、`apply_patch` 等，V0 禁止。
- `external-side-effect`：发送邮件、提交表单、发布消息、修改云端数据等，V0 禁止。
- `process-control`：通用 Bash、安装依赖、Git 写操作等，V0 禁止。即使某些 Bash 命令看似只读，首版也不向 Room 暴露通用 shell；需要时应封装成独立只读工具。

有效工具集由三层取交集：

```typescript
effectiveTools = toolsFromMemberCapabilities
  ∩ registeredTools
  ∩ roomAllowedEffects;
```

Member 配置、system prompt、Room Log 内容或 Agent @消息都不能绕过 `roomAllowedEffects` 扩大权限。Agent 消息不是用户授权，Room 内容中的“你现在可以写文件”等文本也不能覆盖运行时守卫。

当用户要求 Room 直接修改代码或执行外部动作时，Room Agent 只讨论方案、风险和执行建议，并引导用户切换到 Solo 或 Team。首版产品边界是：Room 形成判断，Solo / Team 执行判断。

### Shelved Draft 机制

参考 Raft 的核心设计：Agent 生成回复后不能直接把内容写入 Room Log，而是先形成 Draft，并携带生成时基于的 `roomSeq`。RoomCoordinator 在提交瞬间原子比较 Draft 的 `basedOnRoomSeq` 与当前 Room 最新序号：没有变化则提交；发生变化则把 Draft 置为 Held，并把变化范围呈现给同一个 Agent 再次判断。

```typescript
type DraftStatus =
  | "generating"
  | "ready"
  | "held"
  | "revising"
  | "committed"
  | "expired";

interface ShelvedDraft {
  id: string;
  cycleId: string;
  memberId: string;
  content: string;
  /** 当前版本草稿所基于的 Room Log 最大消息序号 */
  basedOnRoomSeq: number;
  heldCount: number;
  reviewAttempts: number;
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
}

/** Held Draft 复审后的行动选择 */
type DraftDecision =
  | { action: "revise"; content: string; mentionedMemberIds?: string[] }
  | { action: "send" }
  | { action: "silence" }
  | { action: "force-send" };
```

#### 原子提交检查

```text
Agent 生成 Draft
  → Draft.basedOnRoomSeq = Agent 启动时的 roomSnapshotEndSeq
  → RoomCoordinator 尝试提交
      ├─ currentRoomSeq == basedOnRoomSeq
      │    → 分配新的 roomSeq
      │    → 写入 Room Log
      │    → Draft = committed
      └─ currentRoomSeq > basedOnRoomSeq
           → Draft = held
           → heldCount + 1
           → 再次调用同一个 Agent
```

RoomCoordinator 只比较版本，不使用规则或模型判断新消息是否与草稿重复，也不替 Agent 决定是否应该发言。

#### Held Draft Input

Draft 进入 Held 后，运行时给同一个 Agent 注入新的 Room Input。输入保留原始草稿，说明旧版本、当前快照、新增消息范围和可选动作：

```text
<held_draft>
draft_id: draft-analyst-1
based_on_room_seq: 10
room_snapshot_end_seq: 12
held_count: 1
review_attempt: 1

原始草稿：
这个方案最大的风险是成本。

生成期间新增了 Room 消息 11～12。
你可以调用 read_room_log(11, 12) 查看新增内容。

可选动作：
- revise
- send
- silence
</held_draft>
```

Held Draft 复审是同一个 Member 当前 Room 私有运行历史中的后续调用。Agent 可以使用 `read_room_log` 读取 `basedOnRoomSeq + 1` 到本次 `roomSnapshotEndSeq` 的变化，也可以读取更早的 Room Log 辅助判断。

#### 四种行动

1. **修改 `revise`**
   - Agent 放弃原草稿，返回适配当前房间状态的新内容。
   - Agent 可以同时更新结构化 `mentionedMemberIds`；最终只有修订后 Draft 中的 Mention 生效。
   - Draft 的 `content` 替换为新内容，`basedOnRoomSeq` 更新为本次复审看到的 `roomSnapshotEndSeq`。
   - 新版本仍然走原子新鲜度检查；提交期间房间再次变化时，Draft 再次进入 Held。

2. **直接发送 `send`**
   - Agent 已经知道房间发生变化，但认为原始草稿仍然独立且有价值。
   - Draft 内容不变，`basedOnRoomSeq` 更新为本次复审看到的 `roomSnapshotEndSeq`，然后再次尝试提交。
   - 保留当前 Draft 已有的结构化 Mention。
   - `send` 不绕过新鲜度检查；如果提交期间房间再次变化，Draft 仍会再次进入 Held。

3. **保持沉默 `silence`**
   - Agent 判断自己的观点已被覆盖、已经过时或没有足够补充价值。
   - Draft 状态变为 `expired`，不写入 Room Log，不产生用户可见消息。
   - 沉默是合法完成，不视为错误或失败。

4. **强制发送 `force-send`**
   - 当房间持续移动，而 Agent 认定当前草稿仍必须发送时，显式绕过 `basedOnRoomSeq` 新鲜度比较并提交。
   - `force-send` 只绕过 Room 版本检查，不能绕过 RoomCycle 已中止、单轮消息上限、单 Agent 回复上限、权限检查、取消信号或 Session 已关闭等约束。
   - 保留当前 Draft 已有的结构化 Mention；只有强制提交成功后才触发被 @ Agent。
   - 首版默认 `heldCount >= forceSendAfterHeldCount`（默认 2）后才向 Agent开放该动作，第一次 Held 时只能选择 `revise`、`send` 或 `silence`。

#### 复审终止保护

`revise` 和 `send` 都可能因为房间继续变化而再次 Held。为避免无限复审：

- 每次 Held 后重新调用 Agent，`reviewAttempts + 1`。
- 当 `reviewAttempts < maxDraftReviewAttempts` 时，提供当时允许的完整动作集合。
- 达到 `maxDraftReviewAttempts`（默认 3）后，不再允许继续 `revise` 或普通 `send`，Agent 必须选择 `silence` 或 `force-send`。
- Draft 所属 RoomCycle 已经失效时，所有动作都不可提交；Draft 直接过期。

完整状态流：

```text
generating
  → ready
  → 尝试提交
      ├─ Room 未变化 → committed
      └─ Room 已变化 → held
           → 再次调用同一个 Agent
               ├─ revise → revising → ready → 再次检查
               ├─ send → ready → 再次检查
               ├─ silence → expired
               └─ force-send → committed
```

### @提及机制

用户和 Agent 都可以 @指定某个 Member，但调度协议不能通过正则扫描自由文本识别 Mention。可见文本中的 `@名称` 负责展示，真正触发只信任结构化稳定 Member ID。

```
用户: @分析师 你怎么看这个方案的风险？

分析师: 这里的数据来源还不确定。@搜索者 请帮我确认一下。
```

用户通过 Composer 的 @补全创建 Mention Entity：

```typescript
interface RoomUserInput {
  content: string;
  mentionedMemberIds: string[];
}
```

Agent 通过 `room_respond` 或 `room_resolve_draft(revise)` 返回 `mentionedMemberIds`。成功提交的共享消息保存：

```typescript
interface RoomAgentMessage {
  id: string;
  roomSeq: number;
  cycleId: string;
  memberId: string;
  content: string;
  mentionedMemberIds: string[];
}
```

Coordinator 只读取 `mentionedMemberIds`，不扫描 `content`。以下文本都不会自动触发 Agent：代码里的 `@decorator`、邮箱地址、引用过去的 `@分析师`、未通过补全生成实体的未知名称。

Mention 使用稳定 `memberId`，不使用可修改、可重复或本地化的显示名称。提交前运行时必须：

- 验证目标 Member 存在且属于当前 Room
- 去重重复 ID
- 忽略或拒绝 Member @自己
- 检查 `maxMentionDepth`、`maxRepliesPerMember` 和 cycle 状态
- 只在 Draft 成功 `committed` 后启动目标 Member

Held、未提交 Draft、私有历史和 `silence` 中的 Mention 不生效。`revise` 可以替换 Mention；`send` 和 `force-send` 保留当前 Draft 的 Mention。

用户消息没有结构化 Mention 时启动全部 Room Member；包含一个或多个结构化 Mention 时只启动目标 Member。即使可见文本里出现 `@名称`，只要 `mentionedMemberIds` 为空，就按普通无 @消息处理。

## 前端设计规范

### 整体布局

Room 采用“安静消息流 + 可观测运行状态”的三层信息结构：

1. **共享消息流**：负责讨论，只展示用户消息、成功提交的 Agent 消息和必要系统提示。
2. **顶部 Room Header**：负责实时状态，显示参与者、cycle 进度、Agent 状态和停止入口。
3. **Agent 运行详情**：负责审计，按需展开结构化运行事件，不展示模型隐藏推理。

消息流视觉语言与单智能体保持一致，主要区别是消息带有发送者角色标识。

```
┌──────────────────────────────────────────────────────────────┐
│ Room — 主题名称                                  [停止本轮] │
│ 搜索者·搜索中  分析师·正在生成  质疑者·检查新消息  总结者·空闲 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                     纵向消息流                                │
│              （和群聊一样，一条条往下排）                       │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ [@] [输入框]                                      [发送]     │
└──────────────────────────────────────────────────────────────┘
```

### 顶部状态 Header

- 显示房间主题名
- 列出所有参与者 Agent：角色标识 + 名称 + 能力等级 + 状态文字
- 显示当前 RoomCycle 进度，例如“3/5 Agent 已完成”
- RoomCycle 运行期间提供“停止本轮”控制
- 点击 Agent 状态项可以打开该 Agent 的运行详情

状态不能只通过颜色表达。实现必须同时使用状态文字、图标/形状和主题感知的语义颜色 token，并遵守 `docs/design-docs/frontend/front-主题与配色规范.md`；禁止在组件中硬编码 `#hex`、`text-black`、`bg-white` 等主题不感知颜色。

```typescript
type RoomAgentUiStatus =
  | "idle"
  | "queued"
  | "generating"
  | "using-tool"
  | "held"
  | "reviewing"
  | "silenced"
  | "completed"
  | "failed"
  | "cancelled";
```

| 内部状态 | 默认用户文案 | 说明 |
|---------|-------------|------|
| `idle` | 空闲 | 当前 cycle 未运行或已经回到等待 |
| `queued` | 等待中 | 已触发，等待并发调度 |
| `generating` | 正在生成 | Agent 正在处理当前输入 |
| `using-tool` | 正在搜索 / 正在读取 | 根据工具类型显示简短动作，不展示原始参数 |
| `held` | 房间有新消息 | Draft 已被搁置，等待进入复审 |
| `reviewing` | 正在检查新消息 | Agent 正在处理 Held Draft |
| `silenced` | 本轮未发言 | Agent 正常完成但选择沉默 |
| `completed` | 已回复 | 本轮已有成功提交消息 |
| `failed` | 运行失败 | 提供原因摘要和“再次询问”入口，不复活旧 cycle |
| `cancelled` | 已停止 | 被用户停止或随 cycle 中止 |

状态动效只用于表达真实状态变化，持续时间使用前端统一 motion token，并尊重 `prefers-reduced-motion`；不得依赖闪烁作为唯一提示。

### 消息流设计

**核心原则：和单智能体消息流保持一致的视觉语言，唯一区别是每条消息有不同的角色标。**

每条消息的结构：

```
[角色emoji + 角色名 · 等级标签 · 时间戳]
消息正文
```

设计要点：

1. **工具调用不作为 Room 消息展示**
   - 搜索者调用 `web_search`、分析师调用 `read_room_log` 时，不在共享消息流中插入工具调用行
   - 工具运行可以驱动 Header 的 `using-tool` 状态，并在运行详情中留下结构化摘要
   - 工具产生的可验证证据不能隐藏；搜索结果、引用和来源链接应进入最终提交消息

2. **没有"正在思考"气泡**
   - 思考状态只在顶部 Header 通过状态文字和辅助图标表示
   - 消息流里只出现实际输出——有就输出，没有就不显示
   - 不展示 Chain of Thought、私有 Context、未提交 Draft 或 Held Draft 内部复审对话

3. **消息按完成时间排列**
   - 先完成先显示
   - 不存在"同时出现两条消息"的情况（串行输出）

4. **角色用颜色区分**
   - 每个角色有固定的品牌色（用于角色名着色）
   - 消息正文不着色，保持统一可读性

5. **@提及**
   - 高亮显示，和常见 IM 工具体验一致

6. **必要系统提示**
   - 讨论达到上限、RoomCycle 被停止、部分 Agent 失败等影响用户理解的状态，可以显示紧凑系统提示
   - 系统提示不能伪装成某个 Agent 的自然语言回复

### Agent 运行详情

点击 Header 中的 Agent 状态项，打开可选运行详情面板。面板默认关闭，不占用共享消息流空间。

```text
分析师 · 本轮运行详情

14:20:01  开始生成
14:20:08  读取 Room 消息 12～18
14:20:15  形成草稿
14:20:15  房间新增 2 条消息
14:20:16  开始检查新消息
14:20:21  修改草稿
14:20:22  提交成功
```

运行详情展示结构化事件摘要：开始/结束、工具名称与范围摘要、Held/Review 状态、重试、usage、错误和最终结果。以下内容永不展示：模型隐藏推理、原始 Chain of Thought、未经裁剪的工具输出、其他 Agent 私有历史和未提交 Draft 正文。

详情面板必须支持键盘打开/关闭、明确焦点顺序和可访问名称；不能只依赖 hover。长事件列表后续超过性能阈值时使用虚拟化或分页。

### 沉默与失败

- Agent 选择 `silence` 时不生成消息气泡；Header 在当前 cycle 内显示“本轮未发言”，cycle 结束后回到“空闲”。
- 单 Agent 失败不终止其他 Agent 或整个 RoomCycle；失败 Agent 显示“运行失败”和“再次询问”入口。
- cycle 结束时如果存在失败 Agent，消息流可以显示一条紧凑提示：“本轮有 1 个 Agent 未完成：搜索者。”
- 错误提示需要包含原因摘要和恢复动作，不只显示错误代码；完整错误进入运行详情和私有 transcript。
- “再次询问”只预填 `@失败 Agent + 可编辑文本`，用户发送后创建新 cycle；不得在 UI 背后复活旧 cycle 或静默重置其预算。

### 停止本轮

RoomCycle 运行期间，Header 提供明确的“停止本轮”操作。执行后：

1. abort 当前 cycle 中仍在运行或复审的 Agent。
2. 未提交 Draft 标记为 `aborted` / `expired`。
3. 已经提交到 Room Log 的消息保留。
4. 清空尚未执行的 @接力队列。
5. Header 状态更新为“已停止”，消息流显示一条紧凑系统提示。

停止操作属于中止进行中工作，不需要破坏性确认弹窗，但需要立即可见的执行反馈。所有按钮使用语义状态、明确文本和可访问标签，点击/键盘触发区域满足桌面端可用性要求。

### 搜索结果展示

搜索者的输出中可能包含结构化搜索结果。使用列表卡片呈现：

```
找到以下相关资料：
┌────────────────────────────────────────────────┐
│ 1. 标题                                        │
│    来源 — 摘要描述                              │
│ 2. 标题                                        │
│    来源 — 摘要描述                              │
└────────────────────────────────────────────────┘
```

每条搜索结果至少包含标题、来源域、摘要和可点击链接；如果来源不可访问或检索失败，搜索者必须在最终回复或错误状态中明确说明，不能把无来源摘要表现成已验证事实。

### 输入框

- 左侧有 @ 按钮，点击弹出 Agent 列表选择
- 输入 @ 后自动弹出补全，选择结果写入结构化 `mentionedMemberIds`
- 不 @任何人时，消息发给房间所有 Agent
- RoomCycle 运行期间输入框保持可用；发送新消息会原子中止当前未完成 cycle，并立即创建新 cycle
- 运行期间显示轻量说明：“发送新消息将开始新一轮，并停止当前未完成的 Agent。”不弹阻塞确认框

## 上下文管理

### 与 Team 的区别

| 维度 | Team | Room |
|------|------|------|
| 上下文所有权 | 每个子代理完全独立 | Member 在当前 Room 的私有运行历史 + 共享 Room Log |
| 信息获取方式 | Leader 主动推送任务指令 | 当前 Room Input 自动注入，历史由 Agent 调用 `read_room_log` 按需读取 |
| 上下文大小 | 小（只有任务相关） | 按需（Agent 决定看多少） |

### Room Agent 的上下文组成

```
Agent 工作上下文 =
  AgentRun 启动时捕获的 Member system prompt（persona + memberConfigVersion）
  + 房间规则
  + 工具定义（含内部只读工具 read_room_log）
  + 该 Member 在当前 Room 之前的私有运行历史（输入 / 输出 / 工具调用 / 工具结果）
  + 当前 Room Input（触发消息 + triggerMessageSeq + roomSnapshotEndSeq）
```

Room Log 本身不自动全量注入。其他 Agent 的可见回复只有在当前 Agent 调用 `read_room_log` 后，才进入该 Agent 的私有运行历史和后续模型上下文。

## Room Log 与 Member 的 Room 私有运行历史

Room 使用两层持久化事实：共享 Room Log 回答“房间里公开发生了什么”，Member 的 Room 私有运行历史回答“这个 Member 在当前 Room 生成公开结果之前经历了什么”。两者职责不同，允许有意保存少量重复内容。其他 Room 的私有历史不会自动加载；跨 Room Member 身份与配置由 `docs/design-docs/collaboration/agent-members.md` 定义。

### 内容归属

| 内容 | 共享 Room Log | Member 的 Room 私有运行历史 |
|------|--------------|-------------------|
| 用户可见消息 | 保存 | 仅在作为 Room Input 注入该 Agent 时保存 |
| Agent 已提交回复 | 保存 | 发送者自己的历史保存，并关联最终 Room 消息 |
| `read_room_log` 调用与结果 | 不保存 | 保存 |
| 其他内部工具调用与原始结果 | 不保存 | 保存 |
| 尚未提交的 Draft | 不保存 | 保存 |
| Held Draft 复审过程 | 不保存 | 保存 |
| 首次或复审阶段选择 `silence` | 不保存 | 保存 |
| LLM usage、错误和重试 | 不作为 Room 消息保存 | 保存；必要的 session 级统计可另落稳定事件 |

共享 Room Log 不包含其他 Agent 的私有工具过程。一个 Agent 若想了解另一个 Agent 的工作，只能读取对方已经成功提交到 Room Log 的公开回复。

### 有意重复与关联 ID

当前触发消息已经存在于 Room Log，但 Room Input 仍在目标 Agent 的私有运行历史中保存完整正文和快照元数据，用于准确恢复“该 Agent 为什么被唤醒、当时能看到哪个 Room 版本”。

同样地，Agent 的最终回复会同时存在于发送者私有历史和共享 Room Log：私有历史保留生成、Draft 与复审过程；Room Log 保留对所有参与者可见的最终提交。两份记录通过稳定 ID 关联：

```typescript
interface RoomInputRecord {
  triggerMessageId: string;
  triggerMessageSeq: number;
  roomSnapshotEndSeq: number;
  content: string;
}

interface CommittedDraftRecord {
  draftId: string;
  roomMessageId: string;
  roomSeq: number;
}
```

首版不为了消除少量磁盘重复而把 Room Input 只保存为引用。保留完整模型输入更有利于本地调试、恢复和重放；`triggerMessageId`、`roomMessageId`、`roomSeq` 和 `draftId` 用于证明两层记录之间的因果关系。

### Member 的 Room 私有事件

每个 Room Member 的私有历史使用追加写 JSONL，事件结构与现有 `SessionEvent` 风格兼容，至少覆盖：

```text
room_input
room_response_decision
room_log_read
draft_created
draft_held
draft_decision
draft_committed
draft_expired
tool_call
tool_result
llm_usage
error
```

私有历史不要求持久化 provider 不允许保留的隐藏推理内容；它需要保存可恢复的模型消息、结构化决策、工具过程、usage、错误和最终关联 ID。

### 本地存储布局

Room 生命周期绑定当前 Session，但共享消息和每个 Member 的 Room 私有历史都需要本地持久化，以便刷新或应用重启后恢复：

```text
sessions/<sessionId>/
├── meta.json
├── session.jsonl
└── room/
    ├── config.json
    ├── state.json
    └── members/
        ├── <memberId-a>.jsonl
        ├── <memberId-b>.jsonl
        └── <memberId-c>.jsonl
```

- `session.jsonl`：共享会话事实来源。Room 用户消息和成功提交的 Agent 消息以稳定 Room SessionEvent 写入，并携带 `roomSeq`、`cycleId`、发送者和关联 Draft 信息；前端只依赖这条共享事实流恢复 Room UI。
- `room/config.json`：Room 名称、稳定 `memberIds`、来源模板身份和讨论策略；不保存 persona、模型、Skills 或 Member Workspace。
- `room/members/<memberId>.jsonl`：该 Member 在当前 Room 的私有运行历史。Member 下次在这个 Room 被唤醒时只恢复此文件，不读取其他 Member 或其他 Room 的私有历史。
- `room/state.json`：Room 当前可变视图，保存下一条 `roomSeq`、当前 RoomCycle、Agent 运行状态和未完成 Draft 索引。它不是共享消息事实来源，可由稳定事件与私有历史校验或重建。

首版不额外创建 `room-log.jsonl`；共享 Room Log 直接由 `session.jsonl` 中的 Room 消息事件派生，保持仓库现有“`session.jsonl` 是会话恢复事实来源”的约束。

### 恢复规则

应用重新打开 Room Session 时：

1. 读取 `room/config.json`，恢复 Room 成员引用和讨论策略。
2. 读取 `session.jsonl`，按 `roomSeq` 恢复用户可见 Room Log。
3. 读取 `room/state.json` 恢复当前序号、cycle 和运行状态；状态缺失或不一致时，以稳定事件重新计算。
4. 某个 Member 被再次唤醒时，从全局 Member 存储读取最新 Profile，并捕获 `memberConfigVersion`；再按需读取 `room/members/<memberId>.jsonl` 恢复它在当前 Room 的 ContextManager。
5. 其他 Member 以及其他 Room 的私有历史不加载进当前 AgentRun，也不进入共享 Room UI。
6. 应用中断前仍处于 `generating`、`ready`、`held` 或 `revising` 的 Draft，首版恢复时统一标记为 `expired` 或 `aborted`，不尝试续接半截 LLM 流。
7. 已经 `committed` 的 Room 消息保持有效；私有 Draft 记录通过 `roomMessageId` 与共享消息重新关联。

### 私有历史压缩

每个 Member 在每个 Room 的私有历史独立使用现有 ContextManager 的 token 统计、裁剪和压缩能力。压缩可能移除较旧的 `read_room_log` 明细，使 Agent 偶尔重复读取已经看过的 Room 区间；V0 接受这种额外成本，不引入独立已读游标。

后续若重复读取成为真实问题，压缩摘要可以保留类似 `已读取 Room 范围：1～10、20～30` 的轻量信息；在出现数据证据前不新增单独的 Cursor 或 Read Ledger 领域对象。

### 成本控制

- 用户普通消息会启动房间内全部 Member，因此 Room Member 数量本身就是首要成本边界
- 首次响应选择 `silence` 仍然产生完整模型调用成本，只是不产生可见消息
- Agent 普通回复不再触发全员感知调用，避免消息产生 N 倍级联调用
- `maxAgentMessagesPerCycle`、`maxRepliesPerMember` 和 `maxMentionDepth` 限制单轮讨论成本
- Room Log 不自动全量注入；Agent 通过有范围上限的 `read_room_log` 按需读取 → 上下文可控
- Shelved Draft 的初次生成、复审、修改和最终沉默都会产生真实 LLM token 与调用成本；`silence` 只表示不产生用户可见消息，不代表没有 completion tokens
- `maxDraftReviewAttempts` 和 `forceSendAfterHeldCount` 限制反复 Held 带来的额外调用成本
- `cycleBudget.maxLlmCalls` 在请求分派前原子预留额度，覆盖首次回答、@唤醒、Draft 复审、协议修复和 provider 重试
- `cycleBudget.maxDurationMs` 通过 cycle 父级 AbortSignal 限制整轮墙钟时间
- Token 与估算金额记录在 `RoomCycleUsage` 中用于观测；V0 不做不准确的 Token/金额硬拦截

## 与现有模块的接入边界

Room 不重新实现单体 Agent 能力。每个 Room Agent 复用现有 `runAgentLoop`、`LLMService`、工具调度、ContextManager、usage、重试和 abort 能力；Room 在它们上方新增并行协调、Draft 提交和协议翻译层。

### 总体调用链

```text
Renderer
  → Main Process
  → Room Bridge
  → RoomCoordinator
      ├─ RoomAgentRuntime(Searcher)    → runAgentLoop
      ├─ RoomAgentRuntime(Analyst)     → runAgentLoop
      ├─ RoomAgentRuntime(Challenger)  → runAgentLoop
      └─ RoomAgentRuntime(Synthesizer) → runAgentLoop
            ↓
          RoomResponseDecision / DraftDecision
            ↓
          DraftManager 原子提交
```

现有 Solo Bridge 保持不变；Room 新增专用 Bridge。所谓“不改现有 Bridge”只表示不把多 Agent 编排强行塞进 Solo 路径，不表示 Room 可以没有自己的桥接和事件转换层。

### 复用与新增边界

可以直接复用：

- `runAgentLoop`
- `LLMService`
- `ToolManager` 和现有工具执行协议
- `ContextManager`、token 统计、裁剪与压缩
- provider 错误分类和自动重试
- AbortSignal 与工具取消
- usage 和底层 AgentEvent

必须新增：

- `RoomCoordinator`：创建 cycle、解析 @、调度并发、维护讨论限制和结束条件
- `RoomAgentRuntime`：按 `memberId` 读取 Member 配置版本与当前 Room 私有历史、组装 Room Input、运行 Agent Loop、解析结构化决策
- `RoomDraftManager`：创建 Draft、原子提交、Held、修改、沉默和强制发送
- `RoomBridge`：把底层 AgentEvent 和 Room 内部事件翻译成 runtime/shared/private 三类事件
- `read_room_log`：绑定当前 Session 和快照的 Room 内部只读工具
- `room_respond` / `room_resolve_draft`：提交结构化终止决策并通过 `shouldStopAfterTurn` 闭合 Agent Loop 的内部控制工具

每个 Room Agent 复用的是完整 Agent 依赖，而不只是 LLM：

```typescript
interface RoomAgentDeps {
  member: AgentMember;
  memberConfigVersion: number;
  llm: LLMService;
  contextManager: ContextManager;
  toolManager: ToolManager;
}
```

每个 Member 在当前 Room 使用独立 ContextManager。所有 Room Agent 固定拥有 `read_room_log` 以及当前阶段对应的终止工具；其他工具从全局 `AgentMember.capabilities` 派生，再与工具 Registry 和 `effect: read` 运行时守卫取交集。Room 不保存另一份 allowlist，也不能因 Room 消息扩大 Member 权限。

### 建议模块结构

```text
packages/agent-core/src/room/
├── coordinator.ts
├── agent-runtime.ts
├── bridge.ts
├── draft-manager.ts
├── context.ts
├── events.ts
├── types.ts
├── tools/
│   └── read-room-log.ts
└── index.ts
```

- `coordinator.ts`：机械调度 RoomCycle，不使用 LLM 判断缺失视角或主持讨论。
- `agent-runtime.ts`：解析 Member、捕获 `memberConfigVersion`、创建或恢复当前 Room 的 Agent 上下文，注入 Room Input / Held Draft Input，调用 `runAgentLoop`，解析 `RoomResponseDecision` / `DraftDecision`。
- `draft-manager.ts`：只负责 Draft 状态与原子版本检查，不做语义重复判断。
- `bridge.ts`：Room 协议出口，拆分前端实时事件、共享 SessionEvent 和 Agent 私有 transcript event。
- `read-room-log.ts`：验证范围、绑定快照、读取当前 Room Log 并裁剪工具输出。

RoomAgentRuntime 不解析自由文本 JSON。它从 `room_respond` / `room_resolve_draft` 工具参数获取结构化决策；终止工具缺失时只允许一次协议修复，仍失败则结束为 `failed`。

### Draft 不能直接变成共享消息

现有 Solo Bridge 可以在 Agent 结束后把最终文本聚合为 `assistant_message`。Room 不能这样处理：Room Agent 第一次生成的内容只是 `RoomResponseDecision`，其中的 `reply` 先形成 Draft；只有 Draft 成功 `committed` 后，Room Bridge 才生成共享 `room_agent_message` 并写入 `session.jsonl`。

```text
Agent Loop 最终文本
  → 解析 RoomResponseDecision
      ├─ silence → 写私有事件，结束
      └─ reply → 创建 Draft
                    → DraftManager.tryCommit
                        ├─ committed → 生成共享 Room 消息
                        └─ held → 写私有 Held 事件并再次调用同一个 Agent
```

### 四类事件出口

1. **Runtime Event**：只驱动实时 UI 和运行状态，不要求全部写入共享 session。

   ```text
   room_cycle_started
   room_agent_started
   room_agent_status_changed
   room_agent_silenced
   room_draft_held
   room_draft_reviewing
   room_agent_finished
   room_cycle_finished
   ```

2. **Shared Session Event**：写入 `session.jsonl`，用于恢复用户可见 Room 和稳定统计。

   ```text
   room_user_message
   room_agent_message
   room_cycle_started
   room_cycle_finished
   room_error
   ```

   尚未提交的 Draft、工具过程和私有复审不得伪装成共享 `assistant_message`。

3. **Private Member-in-Room Event**：写入 `room/members/<memberId>.jsonl`，保存 Room Input、工具、Draft、决策、usage、错误和关联 ID。可观测摘要同时投影到全局 Member Activity，但 Activity 不替代私有 transcript。

4. **Member Activity Event**：写入全局 `members/<memberId>/activity.jsonl`，只包含脱敏后的时间、类型、Room/Cycle/AgentRun 关联和短摘要，用于 Members → Activity 页面；不保存完整 Prompt、Chain of Thought 或原始工具输出。

Room Bridge 接收同一次 Agent 运行产生的底层事件，并按事件语义投递到对应出口。

### Room 事件身份字段

现有单体事件主要依赖 `sessionId + turnId`。Room 需要额外的并行和因果身份：

```typescript
interface RoomEventIdentity {
  sessionId: string;
  cycleId: string;
  memberId?: string;
  memberConfigVersion?: number;
  agentRunId?: string;
  draftId?: string;
  roomMessageId?: string;
  roomSeq?: number;
}
```

- `cycleId`：属于哪一条用户消息触发的讨论周期
- `memberId`：哪个持久 Member
- `memberConfigVersion`：该 AgentRun 启动时使用的 Member 配置版本
- `agentRunId`：该 Agent 的哪一次初始运行或 Draft 复审调用
- `draftId`：同一草稿及其 revise/send/Held 链
- `roomMessageId`：最终成功提交的共享消息
- `roomSeq`：消息在 Room Log 中的稳定顺序

### Main Process 与持久化

Room runtime 不依赖 Electron，也不直接决定应用数据目录。Main Process 继续负责解析 Session 路径、注入依赖、写盘和 IPC 推送：

```typescript
runRoomCycle(input, deps, {
  onRuntimeEvent,
  onSharedEvent,
  onPrivateMemberEvent,
  onMemberActivityEvent,
});
```

- `onRuntimeEvent`：通过 IPC 推送 renderer。
- `onSharedEvent`：追加写入 `session.jsonl`。
- `onPrivateMemberEvent`：按 `memberId` 追加写入当前 Room 的私有 transcript。
- `onMemberActivityEvent`：把脱敏结构化摘要追加到全局 Member Activity。

RoomCoordinator 和 Agent Runtime 在内存中维护当前 cycle 与 ContextManager；Main Process 接收稳定事件并负责持久化，保持现有“Agent 层不依赖 Electron、持久化由外层编排”的职责方向。

### `read_room_log` 的运行时绑定

模型不能传入 Room ID、Session ID 或文件路径。创建工具时后端已经绑定当前 Session 和本次快照：

```typescript
createReadRoomLogTool({
  sessionId,
  roomSnapshotEndSeq,
  readRoomMessages,
});
```

模型只能提供 `startSeq` 和 `endSeq`。Held Draft 复审会以新的 `roomSnapshotEndSeq` 创建或更新工具绑定，使 Agent 能读取新变化，同时不能跨 Room 或越过当前复审快照。

## 测试与验收策略

Room 的机械协议和真实模型的讨论质量必须分开验证。自动化测试首先证明调度、提交、预算、权限和恢复不会失控；真实模型评估再判断不同角色的回答是否有价值。CI 不以随机模型是否“这次刚好表现良好”作为通过条件。

### 确定性协议测试

核心测试使用 `MockLLMService` 或可脚本化的 `ScriptedRoomAgent`，通过延迟门闩控制 Agent 完成顺序，并预先指定 `reply`、`silence`、Mention、工具调用、失败和 Draft 决策。测试不访问真实 provider 或网络。

建议目录：

```text
packages/agent-core/src/room/test/
├── coordinator.test.ts
├── draft-manager.test.ts
└── room-runtime.test.ts
```

V0 必须覆盖以下核心场景：

1. 用户普通消息只启动 Room 内全部 Agent 一次。
2. 用户结构化 @只启动目标 Member；未知、重复或无效目标被确定性校验。
3. Agent 普通回复不唤醒其他 Agent；成功提交消息中的结构化 @只唤醒目标 Agent，并遵守回复数和 Mention 深度限制。
4. 两个 Agent 并行完成时，先完成 Draft 正常提交，基于旧 `roomSeq` 的后完成 Draft进入 Held；四种复审决策都遵守新鲜度规则。
5. 新用户消息原子中止旧 cycle；旧 Agent 即使迟到返回，Draft 也不能提交到新 cycle。
6. `maxLlmCalls` 在并行分派前原子预留，实际请求不会越过上限；运行时限能够级联 abort Agent。
7. 单 Agent 最终失败不影响其他 Agent，cycle 最终记录 `completed-with-errors`；Room 级致命错误才中止整轮。
8. `read_room_log` 只能读取绑定 Session、闭区间和 `roomSnapshotEndSeq` 以内的消息，范围与输出裁剪生效。
9. Room Agent 的有效工具集只能包含 Member 能力派生出的 `read` 工具与固定 `internal-control` 工具；workspace 写入、通用 Bash 和外部副作用不能因配置或 Room 文本而暴露。
10. 终止工具必须单独调用；缺失时只修复一次，第二次失败不得把自由文本降级发布到 Room Log。

测试断言不只检查最终文字，还要检查事件序列和身份字段：`cycleId`、`agentRunId`、`draftId`、`roomMessageId` 与 `roomSeq` 必须保持正确因果关联。

### 持久化与恢复测试

使用临时 Session 目录验证 `room/config.json`、`session.jsonl`、`room/state.json` 和 Member-in-Room 私有 JSONL：

- Room Log 按单调递增 `roomSeq` 恢复。
- Room 配置只保存 `memberIds` 和讨论策略，不复制 Member Profile。
- Member Profile 修改后，新 AgentRun 使用新 `memberConfigVersion`，已启动运行和历史消息保持原版本关联。
- 每个 Member 只恢复自己在当前 Room 的私有历史，不加载其他 Member 或其他 Room 的工具和 Draft 过程。
- 已提交消息在重启后保留，未提交 Draft 恢复为 `expired` / `aborted`。
- `room/state.json` 缺失或损坏时，可以根据稳定共享事件和私有事件恢复可计算状态。
- Member 版本、Room 消息和私有 Draft 之间的关联 ID 在写入与恢复后保持一致。

### UI 验收

Renderer 首先使用浏览器 Mock 数据验证：

- 消息只按成功提交的 `roomSeq` 展示，私有工具过程和未提交 Draft 不进入共享流。
- Header 能正确表达 queued、generating、using-tool、held、reviewing、silenced、completed、failed 和 cancelled。
- Composer 的 @补全写入稳定 `mentionedMemberIds`，不依赖自由文本正则解析。
- “停止本轮”立即更新状态并保留已提交消息。
- “再次询问”只预填 Composer，用户发送后才创建新 cycle。
- 浅色、深色、跟随系统主题、键盘操作和 reduced motion 均满足前端规范。

浏览器 Mock 通过后，再按 `FRONTEND_VERIFICATION.md` 完成 Electron 真实运行验收，检查 IPC 事件、刷新恢复、停止操作和并行状态展示。

### 真实模型体验评估

真实模型调用只作为小规模人工或离线评估，不作为 V0 CI 的硬条件。重点观察：

- 不同角色是否提供了可辨认且互补的视角。
- Agent 在没有新增价值时是否能合理选择 `silence`。
- 搜索者是否提供可访问来源，不能把无来源摘要表现成已验证事实。
- Shelved Draft 是否减少重复内容，并在 Room 变化后产生合理的 revise/send/silence/force-send 决策。
- 多 Agent 讨论相对单 Agent 是否增加了用户可用的信息，而不只是增加长度和成本。

概括而言：自动化测试证明 Room 不会乱跑，真实模型评估判断 Room 是否值得使用。

### 模块改动表

| 现有模块 | 改动范围 |
|---------|---------|
| `packages/shared/src/session.ts` | 新增共享 Room 消息、cycle、Draft 关联和 Room runtime stream event 契约 |
| Member registry | Room 运行按 `memberId` 读取全局 AgentMember，并记录 `memberConfigVersion`；事实来源见 `docs/design-docs/collaboration/agent-members.md` |
| `packages/agent-core/src/engine/loop.ts` | 原则上不改；Room Agent 复用现有执行循环 |
| 现有 Solo Bridge | 保持原有单 Agent 语义，不承载 Room 编排 |
| 新增 `packages/agent-core/src/room/` | Coordinator、Agent Runtime、Room Bridge、DraftManager、事件和 Room 工具 |
| Room tests | `packages/agent-core/src/room/test/` 使用脚本化 Mock 覆盖调度、Draft、预算、权限、失败隔离和恢复协议 |
| Session persistence | `room/config.json` 保存 Member 引用与讨论策略；`session.jsonl` 保存共享 Room Log；`room/members/<memberId>.jsonl` 保存当前 Room 私有历史；`room/state.json` 保存可重建当前视图 |
| `packages/desktop/src/main/` | 新增 Room IPC 编排、路径准备、事件写盘和 abort 生命周期管理 |
| `packages/desktop/src/renderer/` | 新增 Room UI、状态订阅、@输入与消息适配 |
| IPC 契约 | 新增 Room run/abort/stream/session 恢复相关输入输出类型 |

## 非目标

- 不实现 Agent 普通回复自动唤醒其他 Agent；Agent 间只允许在用户可见消息流中通过显式 @进行有限接力
- 不实现跨 Session 长期存在的独立 Room；首版 Room 生命周期绑定 Session，但 Room Log 和 Agent 私有历史必须支持刷新与应用重启后的本地恢复
- 不实现实时协作（多用户同时在一个 Room）
- 不实现语音输入/输出
- 不实现 Agent 自动创建/退出 Room；Member 由用户在设置页创建和管理
- 不实现预设讨论阶段或“缺失视角”智能判断；首版只使用确定性的用户广播、@定向与讨论上限规则
- 不运行一个 LLM Agent 充当房间管理者；RoomCoordinator 只是事件驱动的后端调度组件
- 不在共享 Room 消息流中展示模型隐藏推理、原始工具过程、私有 Draft 正文或其他 Agent 私有 transcript
- 不允许 Room Agent 修改 workspace、运行通用 shell 或执行外部副作用；V0 能力工具只读
- 不支持多个 RoomCycle 并行，也不实现多 Agent steering；新用户消息直接替换当前 active cycle
- 不在 Room 内编辑 Member 的 persona、模型、Skills 或 Workspace；这些属于全局 Members 设置页

## 设计原则（借鉴 Raft AX）

1. **Agent 决定什么值得消耗上下文**——当前触发消息自动注入，Room Log 历史由 Agent 使用范围读取工具主动拉取
2. **行动选项显式化**——Shelved Draft 的 revise/send/silence/force-send 是显式路径；系统呈现变化，但不覆盖 Agent 在被告知后的判断
3. **感知同理心**——设计时站在 Agent 视角考虑：它在行动时看到了什么，缺什么
4. **沉默是合法输出**——Agent 判断不需要说话时不说话，不产生噪音

## 决策记录

- 2026-07-10：Agent Room 采用群聊式纵向消息流，不使用分栏或卡片嵌套。
- 2026-07-10：不在共享消息流中展示思考内容；Agent 运行状态统一由顶部 Header 和必要的状态提示承载。
- 2026-07-11：首版不实现独立 Inbox、pending 列表或已读游标；共享历史统一保存在 Room Log，由 Agent 使用 `read_room_log(startSeq, endSeq)` 按消息序号主动读取。
- 2026-07-11：每次 Agent 运行只自动注入当前 Room Input，并携带 `triggerMessageSeq` 与固定的 `roomSnapshotEndSeq`；Room Log 工具不得读取本次快照之后的新消息。
- 2026-07-11：`read_room_log` 的调用与结果进入 Member 当前 Room 的私有运行历史，Agent 根据已有工具历史自行判断已读范围，后端不维护 `lastSeenRoomSeq`。
- 2026-07-11：保留完整 Shelved Draft 提交协议；Draft 使用 `basedOnRoomSeq` 做原子新鲜度检查，房间变化时再次调用同一个 Agent。
- 2026-07-11：Held Draft 显式支持 `revise`、`send`、`silence`、`force-send` 四条路径；`send` 和 `revise` 仍需重新检查新鲜度，`silence` 是合法终态。
- 2026-07-11：`force-send` 只绕过 Room 版本检查，默认 Held 两次后开放；Draft 最多复审三次，达到上限后必须选择 `silence` 或 `force-send`。
- 2026-07-11：角色按思维风格分工（搜索/分析/质疑/创想/总结），代表并行独立视角，不代表搜索→分析→质疑→总结的固定流水线。
- 2026-07-11：Agent 首次响应 Room Input 时显式选择 `reply` 或 `silence`；首次沉默不形成 Draft、不写入 Room Log，也不占用可见消息额度。
- 2026-07-11：总结者在 Room 内容不足时默认沉默，只有上下文充分或被用户/其他 Agent 显式 @时才进行收敛。
- 2026-07-11：`session.jsonl` 保存共享 Room Log；每个 Member 使用 `room/members/<memberId>.jsonl` 保存当前 Room 的独立私有历史，二者通过 Room Message、Draft 和序号 ID 关联。
- 2026-07-11：Room Input 与已提交回复允许在共享事实流和私有历史中有意重复，以换取准确恢复和调试；其他 Agent 的私有工具过程不共享。
- 2026-07-11：应用重启时恢复已提交 Room 消息和各 Agent 私有历史，但不续接半截模型生成；未完成 Draft 统一过期或中止。
- 2026-07-11：单个 Room Agent 复用完整 `runAgentLoop + LLMService + ContextManager + ToolManager`，不只复用 LLMService。
- 2026-07-11：现有 Solo Bridge 保持不变；新增 Room Bridge、RoomCoordinator 和 DraftManager，Draft 只有成功提交后才生成共享 Room 消息。
- 2026-07-11：Room Bridge 分离 runtime、shared session、private transcript 三类事件；Main Process 继续负责 IPC、路径准备和持久化。
- 2026-07-11：Room UI 采用“消息流负责讨论、Header 负责状态、运行详情负责审计”的三层结构。
- 2026-07-11：工具调用和 Draft 复审不作为共享 Room 消息展示，但必须通过状态文字和可选结构化详情保持可观测；搜索证据和来源进入最终消息。
- 2026-07-11：Agent 状态不能只依赖颜色；实现使用文字/图标与主题感知语义 token，并同时覆盖浅色、深色和跟随系统主题。
- 2026-07-11：单 Agent 失败不终止整个 RoomCycle；Header 提供错误恢复和“停止本轮”，已提交消息在停止后保留。
- 2026-07-11：同一 Room 同时只有一个 active RoomCycle；新用户消息原子中止旧 cycle，保留已提交消息、过期未提交 Draft，并创建新 cycle。
- 2026-07-11：Room V0 能力工具只允许 `effect: read`；`room_respond` / `room_resolve_draft` 属于不直接产生副作用的 `internal-control` 工具；禁止 workspace 写入、通用 Bash 和外部副作用。
- 2026-07-11：Agent 首次响应和 Held Draft 决策通过内部终止工具提交，终止工具必须是单独 tool call；缺失时只协议修复一次，仍失败则不发布自由文本。
- 2026-07-11：用户和 Agent 的 @使用结构化 `mentionedMemberIds` 与稳定 Member ID；Coordinator 不正则扫描自由文本，Mention 只在 Draft 成功提交后生效。
- 2026-07-11：RoomCycle 除可见讨论上限外，增加 `maxLlmCalls` 和 `maxDurationMs` 两个硬预算；调用额度在请求前原子预留，Token 与估算金额首版只记录和展示。
- 2026-07-11：可重试 provider 错误留在同一 AgentRun 内并计入 cycle 调用预算；单 Agent 最终失败被隔离，cycle 以 `completed-with-errors` 收尾。
- 2026-07-11：失败恢复采用用户可见的“再次询问”，预填结构化 @并在发送后创建新 cycle；V0 不复活旧 cycle。只有共享事实或调度一致性失效才以 `fatal-error` 中止整轮。
- 2026-07-11：Room 模板只提供建议 Member 组合与讨论默认值；Room 保存稳定 `memberIds`，不复制 persona、模型、Skills 或 Member Workspace。
- 2026-07-11：Agent 是跨 Room 持久 Member；Profile 修改影响未来 AgentRun，每次运行记录 `memberConfigVersion`，Room 内不维护第二份 Agent 能力配置。
- 2026-07-11：Room 测试分为确定性协议、持久化恢复、UI 验收和真实模型体验四层；CI 使用可控 Mock 验证机械协议，不把随机模型表现作为硬通过条件。
- 2026-07-10：用户普通消息启动全部 Agent；用户消息包含 @时只启动被 @的 Agent。
- 2026-07-10：Agent 普通回复不触发其他 Agent；Agent 只有通过显式 @才能定向唤醒另一个 Agent。
- 2026-07-10：每条用户消息创建一个有限的 RoomCycle，通过单轮消息数、单 Agent 回复次数和 @接力深度兜底，防止无限讨论。
- 2026-07-10：RoomCoordinator 是确定性后端组件，不是管理 Agent；首版不做预设阶段和“缺失视角”智能判断。
