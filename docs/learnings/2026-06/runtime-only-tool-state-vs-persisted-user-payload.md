# Runtime-only 工具状态与持久化 payload 的分层

关联 history：`docs/histories/2026-06/20260602-0132-attachments-turn-contract-tests.md`

## 是什么

同一个用户动作可能同时需要两种信息流：

- **runtime-only 状态**：只服务当前交互反馈，例如“Analyze image screenshot.png 正在执行”。它像进度条，不是长期事实。
- **persisted payload**：会写入 session 并参与恢复，例如附件元信息和图片分析摘要。它是之后构造上下文和历史 UI 的事实来源。

附件图片预分析就是典型例子：用户需要看到“正在分析图片”的工具行，但历史恢复时不应该再出现一条独立的工具调用日志；真正需要保存的是 `user_message.payload.attachmentAnalyses`。

## 为什么需要

如果把所有 runtime 状态都写进历史，会产生两个问题：

- **历史污染**：发送前的辅助处理看起来像模型主动调用过工具，误导用户和后续 Agent。
- **上下文污染**：临时状态混入普通 tool log 后，恢复会话时可能被当成 Agent 已完成的推理步骤。

反过来，如果完全不展示 runtime 状态，用户在图片预分析耗时时会以为系统卡住。

## 怎么做

推荐分层如下：

```ts
// 当前 turn 的交互反馈：只发 stream event，不落 session tool_call/tool_result。
onStreamEvent({
  type: "tool_started",
  toolName: "analyze_media",
  preview: {
    kind: "media_analysis",
    mediaName: attachment.name,
    mediaKind: "image",
    displayText: `Analyze image ${attachment.name}`,
  },
});

// 长期事实：写入 user_message.payload。
userMessageToEvents(userMessage, sessionId, turnId, {
  attachments,
  attachmentAnalyses,
});
```

恢复会话时，历史 UI 只从 `user_message.payload.attachmentAnalyses` 展示“图片分析结果”，不要重放 `tool_started`。

## 常见陷阱

- 不要把系统生成的图片摘要拼回用户原文 `content`，否则会伪装成用户亲手输入。
- 不要为了显示 running 状态持久化一条普通 `tool_call`，否则历史恢复会重复显示工具行。
- 不要把图片 base64 写进 session；持久化文本摘要和必要元信息即可。
- 测试要同时覆盖 runtime stream 和 persisted payload，否则很容易只保证其中一半。

## 自检问题

- 这个状态在刷新页面后还应该存在吗？如果不应该，它多半是 runtime-only。
- 这个信息会影响下一轮模型上下文吗？如果会，它需要以结构化 payload 持久化。
- 历史恢复时用户看到的是事实结果，还是当时的进度动画？前者可以持久化，后者不该持久化。
