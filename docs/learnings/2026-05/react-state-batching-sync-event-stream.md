# React state batching 下的同步事件流追加陷阱

关联 history：`docs/histories/2026-05/20260528-1539-kairos-sync-event-preservation.md`

## 是什么

当一个外部事件源在同一个 JavaScript 调用栈里连续触发多条事件时，React 不会保证每次 `setState(nextValue)` 后立即让闭包或 ref 看到最新 state。若每条事件都用“旧数组 + 当前事件”生成新数组，后一次更新可能覆盖前一次更新。

典型坏味道：

```ts
bridge.onEvent((event) => {
  const next = [...eventsRef.current, event];
  setEvents(next);
});
```

如果同一批同步来了 `a -> b -> c`，而 `eventsRef.current` 在三次回调中都还是同一个旧值，最终 state 可能只剩 `old + c`。

## 为什么需要注意

Agent / IPC / SSE / WebSocket 这类系统经常会把一次运行里的多个事实事件快速推给前端，例如：

```txt
assistant_message
tool_call
tool_result
sleep_start
```

这类事件通常有配对关系。丢掉 `tool_call` 后，`tool_result` 会变成孤立事件；即使后端日志和磁盘事实完整，前端聚合器也可能无法还原工具执行行。

## 正确写法

用函数式 state update，让 React 把每次追加串行应用到最新 state：

```ts
bridge.onEvent((event) => {
  setEvents((current) => {
    const next = [...current, event];
    eventsRef.current = next;
    return next;
  });
});
```

如果外部回调还需要同步读取最新数组，可以在 updater 内维护 ref。关键是：追加逻辑的事实来源必须是 updater 参数 `current`，不是闭包里可能过期的变量。

## 核心要点

- 外部同步事件源和 React batching 组合时，优先使用函数式 `setState`。
- append-only 事件流不要用“闭包里的数组快照”做追加基准。
- 事件有配对关系时，丢一条“开始事件”比丢一条普通日志更危险，因为后续聚合会失真。
- 回归测试应模拟“同一个 act / 同一个 flush 内连续推多条事件”，而不是只测逐条异步到达。

## 自检问题

1. 如果 `tool_call` 和 `tool_result` 在同一批 IPC flush 中同步到达，普通 `setEvents([...events, ev])` 为什么可能只保留最后一条？
2. 哪些场景必须保留 `useRef`，哪些场景只靠函数式 `setState` 就够？
