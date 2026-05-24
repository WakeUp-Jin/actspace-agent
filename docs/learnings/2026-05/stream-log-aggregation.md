# Stream Log Aggregation

关联 history: `docs/histories/2026-05/20260524-1816-agent-run-log-stream-aggregation.md`

## 是什么

流式系统通常会产生两种事件：

- 面向 UI / 传输层的细粒度 delta 事件
- 面向排障 / 审计的人类可读日志事件

这两种事件不要直接共用同一种日志形态。UI 需要每个 delta 尽快到达，日志则需要能快速读懂一次运行发生了什么。

## 为什么需要

如果把每个 token 或 delta 都写进 JSONL：

- 一段短回复会膨胀成几十行
- 同一内容可能同时出现在底层事件和 IPC 事件里
- 真正重要的错误、工具调用、持久化边界会被冲散

更好的做法是在运行期间保留流式传输，但在日志侧聚合文本内容，最终写成一条摘要事件。

## 推荐模式

运行路径：

```text
LLM delta -> AgentEvent -> RuntimeStreamEvent -> renderer
```

日志路径：

```text
LLM delta -> in-memory buffer -> assistant_text / assistant_thinking log event
```

这样可以同时满足两个目标：

- UI 仍然实时显示
- run log 保持可读

## 常见陷阱

- 不要为了日志可读性取消真实流式推送，否则会牺牲用户体验。
- 不要同时记录底层 delta 和映射后的 stream delta，否则同一内容会重复刷屏。
- 错误路径也要 flush buffer，否则模型已经输出的最后一段内容可能丢在内存里。
- 聚合日志最好保留 `deltaCount` 和 `chars`，否则排查“到底有没有流式输出”会缺少信号。

## 自检问题

1. 这个事件是给机器实时消费，还是给人排障阅读？
2. 如果一次回复有 2000 个 delta，日志还能不能在 30 秒内读懂？
3. 失败路径里已经收到但尚未 flush 的内容会不会丢失？
