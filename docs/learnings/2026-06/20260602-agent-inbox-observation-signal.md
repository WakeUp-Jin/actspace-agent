# Agent inbox：把跨 Agent 通信建模成观察信号

关联 history：`docs/histories/2026-06/20260602-1151-kairos-agent-inbox-plan.md`

## 是什么

Agent inbox 是一种轻量的跨 Agent 通信模式：写入方只把“希望另一个 Agent 后续观察的线索”追加到本地文件，读取方在自己的运行节奏里主动读取、归纳和决定是否行动。

这次 Kairos V0 用两份 Markdown 文件表达这个模式：

```text
<userData>/kairos/inbox/main-agent.md
<userData>/kairos/inbox/lab-agent.md
```

它不是消息总线，也不是命令队列。Main Agent / Lab Agent 写入的是观察信号；Kairos 每次 tick 读取后，仍要按自己的 prompt、权限边界和短期记忆决定下一步。

## 为什么需要

后台 Agent 通常不是被用户实时驱动的，它有自己的 tick / sleep 节奏。如果为了跨 Agent 协作一开始就做实时双向聊天、ack、锁文件、状态机或数据库，会把问题过早升级成“分布式系统”。

文件 inbox 的价值是：

- 可追溯：消息落在用户本机，排障时直接打开文件看。
- 低耦合：写入方不需要知道 Kairos 当前是否在 sleep，也不需要读取 Kairos 记忆。
- 安全：inbox 只进入 prompt 的观测摘要，不等于用户当前命令，也不授予高风险动作权限。
- 易升级：当消息量、消费状态或并发真的成为问题，再升级为 JSONL、索引或锁机制。

## 怎么用

推荐把写入入口集中成一个函数，而不是让多个模块手写 Markdown：

```ts
await appendKairosInboxMessage({
  kairosRoot,
  source: "main-agent",
  priority: "normal",
  topic: "前端验证反复失败",
  body: "请 Kairos 后续观察这是否是重复能力缺口。",
  relatedSessionId: "session_xxx",
});
```

读取方也应只读摘要，不把整份文件无限塞进上下文：

```ts
const inboxSummary = await loadKairosInboxSummary({ kairosRoot });

assembleSystemPrompt({
  watchDiffs,
  sessionsDigest,
  inboxSummary,
  shortTermResult,
  // ...
});
```

关键是把 inbox 放在“观察输入”层，而不是“执行请求”层。这样即使写入方用了祈使句，读取方也不会把它当成用户授权。

## 常见陷阱

- 不要把 inbox 内容自动写入短期记忆。只有 Kairos 基于它做了回复、工具调用或笔记，这些行动才进入 `memory/short-term/*.jsonl`。
- 不要在 V0 里同时设计 `Pending` 插入和 EOF append。中间插入需要 read-modify-write，容易和 append-only 并发策略冲突。
- 不要让 LLM 自由决定何时写 inbox。V0 先用后端结构化触发点，避免噪声消息淹没真实信号。
- 不要让 inbox 独占观测预算。watch diff、sessions digest 和 inbox 应分块截断，避免某类长内容把其它信号挤掉。

## 自检问题

- 这条信息是在请求另一个 Agent 立刻执行，还是给它未来观察的线索？
- 读取方看到这条 inbox 后，是否仍需要经过原有权限和评审边界？
- 如果 inbox 文件无限增长，loader 是否能保证 prompt 预算稳定？
