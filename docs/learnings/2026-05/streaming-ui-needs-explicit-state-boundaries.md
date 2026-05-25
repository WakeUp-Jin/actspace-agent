# Streaming UI Needs Explicit State Boundaries

关联 history：`docs/histories/2026-05/20260525-1939-streaming-turn-control-polish.md`

## 是什么

流式 UI 不能只靠最终持久化结果来驱动展示。它至少有三类状态：

- 乐观状态：用户刚发出的消息，本地马上显示。
- 进行中状态：assistant delta、thinking delta、tool started/finished。
- 终止状态：completed、failed、aborted。

这三类状态的生命周期不同，混在一个数组里简单覆盖，很容易出现“用户消息闪现后消失”“工具开始时没有参数”“取消后像普通完成一样清场”。

## 为什么需要

Agent turn 不是一次普通请求响应。一次 turn 里可能有多次模型调用、多个工具状态、局部 assistant 文本和用户主动中断。

如果前端只等最终 `SessionRecord`，体验会迟钝；如果前端只维护 streaming blocks，刷新和恢复会丢事实。所以更稳的办法是：

- 流式期间用 optimistic/streaming state 提供即时反馈。
- 完成后用持久化 session events 作为事实来源。
- abort 这类终止状态要单独建模，不要当成 completed 或 error。

## 核心要点

- 用户输入应该在发送时立即进入 optimistic block，不等后端持久化。
- `tool_started` 应带结构化 preview，而不是只带 `toolName` 和字符串化参数。
- running UI 应显示“正在做什么”，不是只显示 “Executing”。
- 用户主动取消应返回 `aborted`，UI 展示为 `Stopped`，不要渲染成 error。
- 普通完成可以清理临时 streaming state；aborted 应保留当前可见内容并追加停止状态。

## 常见陷阱

- 不要让后续 stream event 重建 blocks 时丢掉 optimistic user block。
- 不要等 `tool_finished` 才生成工具展示语义，否则 started 阶段只能显示低质量占位。
- 不要把 abort 合并进 completed。用户会以为模型自然结束了。
- 不要把 abort 合并进 failed。用户主动停止不是系统失败。

## 自检问题

1. 如果 `tool_started` 到了但 `tool_finished` 还没到，UI 是否已经能看出工具参数？
2. 如果用户点 stop，当前流式内容是应该清掉、保留，还是转成 error？
3. 一轮 turn 最终状态是 `aborted` 时，历史恢复应该怎样表达这轮是主动停止的？
