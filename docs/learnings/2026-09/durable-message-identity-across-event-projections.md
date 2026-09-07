# Durable 消息身份必须跨 Projection 阶段保持稳定

## 是什么

事件驱动的 UI 通常同时存在两种消息来源：运行中的 streaming overlay，以及模型完成后从 Session Journal 重建的 durable projection。两者即使内容相同，也必须共享同一个稳定的 `renderKey`，否则 React 会把完成态交接误判为“删除旧节点、插入新节点”。

## 为什么需要

Inbox follow-up 的 claim 事件携带 Surface user node，但事件本身可能没有 `agentRunId`。如果 projection 只从当前事件读取身份，就会退化为 `system`；而 overlay 已经根据活动 run 生成了真实 run key。清理 overlay 时，节点重新挂载，入场动画和布局测量都会再次执行，表现为最终回复后闪烁。

## 怎么用

不要让单个事件字段决定消息身份，而是在 projection 前建立事件图索引：

```ts
messageId -> claim event -> turn/start -> { turnId, agentRunId }
```

随后所有 Surface projection 都使用这个索引补全缺失身份。`next-turn` claim 取后继 turn，`next-step` claim 取当前 turn；无法关联时才回退到 `system`。

## 核心要点

1. 内容相等不等于 UI 身份相等；React key 是 projection contract 的一部分。
2. Overlay 清理是一次身份交接，必须和 durable projection 使用同一 key。
3. Inbox、retry、compaction 等事件常常是“关系事件”，需要结合邻近事件恢复完整上下文。

## 常见陷阱

- 只测试最终文本，不测试 streaming → durable 的 `renderKey` 一致性。
- 将缺少 `agentRunId` 的事件直接标成 `system`，忽略其与 turn 生命周期的关系。
- 用增加/删除动画补偿身份漂移；这只能掩盖问题，不能消除 remount。

## 自检问题

1. 为什么 `agent/inbox/spliced` 的 claim 需要读取相邻 `turn/start`？
2. `next-step` 和 `next-turn` 的归属方向有什么不同？
3. 如何证明 overlay 清理后 React 复用了原节点，而不是重新挂载？
