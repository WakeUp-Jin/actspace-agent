# Inbox Claim 也是 Durable Surface：不要只按事件类型投影消息

## 是什么

在事件驱动的 Agent Loop 中，用户 follow-up 不一定直接产生 `user/message`。ActSpace 的 follow-up 会先进入 Inbox，等 Agent Loop claim 后通过 `agent/inbox/spliced` 的 Surface append node 进入会话消息流。

因此，`agent/inbox/spliced` 同时承担两种职责：队列生命周期记录，以及 claim 时的 Surface 消息发布。Renderer projection 必须读取 claim 事件携带的 Surface node，而不能只匹配 `user/message`。

## 为什么需要

流式期间，前端可以暂时从 live overlay 显示用户输入；模型完成后 overlay 会被清理，UI 重新读取 durable Session projection。如果 projection 漏掉 Inbox claim 的 user node，就会出现“发送时看得到，回复完成后消失”的时序性问题。

## 怎么用

```ts
if (
  event.type === "user/message" ||
  (event.type === "agent/inbox/spliced" && data.operation === "claim")
) {
  const node = appendNode(event);
  if (node?.kind === "user" && activeSurface.messageIds.has(node.messageId)) {
    projectSurfaceNode(projected, node);
  }
}
```

关键是只处理 `claim` 的 Surface append：`enqueue` 只是待处理队列，不应提前把同一条消息显示一次，否则会和 claim 后的消息重复。

## 核心要点

1. 事件类型不是唯一语义来源；同一个事件可能同时描述队列状态和 Surface 物化。
2. UI 的 durable 消息列表必须从 Journal projection 重建，不能依赖 streaming overlay 续存。
3. 投影前用 `messageId` 对照 active Surface，避免把非当前 Surface 或系统 Inbox 事件渲染成用户消息。

## 常见陷阱

- 只为 `user/message` 写 projection 分支，忽略 Inbox claim 的用户 Surface。
- 把 `enqueue` 当作可见消息，导致 pending 和已 claim 消息重复。
- 只测流式状态，不测 overlay 清理后的 durable snapshot。

## 自检问题

1. 为什么 `AgentLoop` 已经 claim 了 Inbox 后，不一定还会产生 `user/message`？
2. `enqueue` 和 `claim` 哪一个事件可以安全地进入 Conversation projection？
3. 如果 claim 事件没有 Surface append node，projection 应该如何处理？
