# Agent Runtime 的三条事件平面：事实、干预与通知

这次 DSH 风格重构最重要的认识，是不要把“事件”当成一种东西。Agent Runtime 至少需要三条平面：Session Journal 事实流、Agent Loop 干预流、运行时通知流。

## 1. 三条平面分别解决什么问题

| 平面 | 典型事件 | 是否持久化 | 主要消费者 |
| --- | --- | --- | --- |
| 事实流 | `turn/start`、`assistant/message`、`tool/result` | 是 | replay、recovery、projection、CLI artifact |
| 干预流 | `agent/request`、`llm/stream`、`tools/pre-execute` | 否（除非干预结果写入事实流） | Cordis 插件、策略、审计、测试 |
| 通知流 | `agent/status`、`tools/result`、`session/event` | 否 | UI、终端、监控、宿主回调 |

事实流必须可以脱离实时进程重放；干预流允许改变下一步行为，但不能偷偷改变已经提交的历史；通知流可以丢失，丢失后应从事实流重建。

## 2. 为什么要 post-commit 通知

如果在 `Journal.append()` 之前通知 UI，UI 可能看到一个最终没有落盘的工具结果。正确顺序是：

```text
candidate
  -> Journal.validate + assign seq
  -> write JSONL / fsync
  -> session/event notification
  -> live projection / UI
```

这使得通知成为 durable truth 的派生物，而不是第二个事实源。实现上，`SessionHandle` 的 `onEvent` 只在 writer append 完成后调用；通知失败不会回滚已经提交的事件。

## 3. 干预点为什么用 Waterfall 和 Serial

- Waterfall 适合“输入可被逐层变换”：系统提示、请求参数、工具参数、工具结果。
- Serial 适合“每个插件都要观察或执行一次”：流式 delta、请求错误、turn 即将结束。
- 所有 handler 都绑定 runtime/session/agent/tool scope，避免一个 Agent 的策略影响另一个 Agent。

工具执行点如果只发送一个不可变 context，插件只能旁观；要支持超时、缓存或审计包装，payload 应提供可替换的 `execute()` 函数，并仍由 Tool Runtime 负责最终提交和 lease 生命周期。

## 4. 这次重构踩到的陷阱

1. 只改事件字符串不够：relation validator、recovery、projection、测试 fixture 必须同时迁移，否则会出现“能写但不能恢复”的假成功。
2. retry 的 request 必须重新写 `request/header` 和 `request/context`，但仍属于同一个 step；旧 request 要用 `assistant/message` 终态化，不能留下 open request。
3. `session/end-seed` 的 `lastSeq` 指向 seed 之前的最后事件，不能把它自己作为 lastSeq，否则恢复时边界会偏移。
4. `tool/recovery-outcome` 属于 recovery transaction；普通工具失败/拒绝应使用核心 `tool/result` 携带 status，避免破坏事务连续性。

## 5. 自检问题

1. 如果 UI 丢了所有通知，能否仅用 Journal 事件重建最终消息和工具状态？
2. 一个插件修改了 `agent/request`，修改后的 request 是否被写入 `request/context` 并可审计？
3. 一个工具 body 已启动但进程崩溃，恢复逻辑如何区分“未开始”与“结果未知”？
