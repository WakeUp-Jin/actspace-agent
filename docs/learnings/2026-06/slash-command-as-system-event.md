# Slash command 作为系统事件，而不是用户消息

关联 history：`docs/histories/2026-06/20260602-1358-compact-command-prototype.md`

## 是什么

在 Agent 产品里，`/compact`、`/abort`、`/reset` 这类 slash command 常常不是给 LLM 阅读的自然语言，而是用户对运行时系统下达的控制指令。它们应该在进入普通 turn 之前被 renderer 或命令路由层识别，转成独立的系统事件链路。

`/compact` 的做法是：

- 输入区识别 exact command：`text.trim() === "/compact"`。
- 不创建 `user_message`，不调用普通 `runTurn`。
- 调用独立 IPC：`context:compact`。
- 执行过程用 runtime stream event 展示。
- 长期事实只持久化为 `context_compaction` / `context_snapshot`。

## 为什么需要

如果把 `/compact` 当普通用户消息送进 LLM，会带来三类污染：

- **语义污染**：模型可能尝试“回答”这个命令，而不是系统实际压缩上下文。
- **历史污染**：刷新后用户会看到一条普通用户消息 `/compact`，但它并不是对话内容。
- **工具流污染**：如果把它伪装成 tool preview，又会让上下文管理事件看起来像模型调用过某个工具。

正确分层后，消息流仍能显示“发生了一次压缩”，但 LLM conversation 保持干净。

## 怎么做

推荐把命令型输入分成三层：

```ts
if (text.trim() === "/compact") {
  await window.actspace.compactContext({ sessionId, turnId, model });
  return;
}

await window.actspace.runTurn({
  sessionId,
  turnId,
  userInput: text,
  model,
});
```

运行时反馈和持久化事实也要拆开：

```ts
// 当前执行过程：只负责实时 UI。
emit({ type: "context_compaction_started", sessionId, turnId, trigger: "manual" });
emit({ type: "context_compaction_finished", sessionId, turnId, status: "compacted", payload });

// 恢复事实：写入 session，刷新后仍显示。
appendEvents(sessionPath, [
  contextCompactionEvent,
  contextSnapshotEvent,
]);
```

## 常见陷阱

- 不要把命令文本拼进用户原文；命令不是用户想让模型记住的事实。
- 不要为了显示执行中状态而持久化 pending/running 动画；刷新后应该恢复的是结果事实。
- 不要把系统事件伪装成工具调用；工具流表达“模型请求某能力”，系统事件表达“运行时发生某状态变化”。
- 测试要同时覆盖“不调用普通 turn”和“最终持久化事件可恢复”，只测 UI 按钮点击不够。

## 自检问题

- 这个输入是给 LLM 阅读，还是给应用运行时执行？
- 刷新会话后还应该看到命令文本本身，还是只看到命令造成的结果？
- 这个事件是模型选择调用的工具，还是系统生命周期的一部分？
