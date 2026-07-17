# 流式事件必须有明确的 Turn 作用域

实时文字出现 `TheThe sandboxbox` 这种逐 token 重复时，不要先假设模型复读。一个更常见、也更隐蔽的原因是：同一个广播事件被多个仍存活的订阅者消费，然后共同写入一份可变 UI 状态。

## 问题为什么会发生

考虑下面的时间线：

1. Turn A 开始，前端为它注册流监听器 A。
2. Turn A 等待工具审批，Promise 尚未结束，所以监听器 A 仍存在。
3. 用户切换会话，前端把界面状态改成“未运行”，但没有销毁监听器 A。
4. Turn B 开始，又注册监听器 B。
5. 广播通道发送 Turn B 的 `text_delta`，监听器 A 和 B 都收到它，并向同一个字符串追加。

文本使用追加语义，因此会重复；工具卡片如果按 `toolCallId` 使用 Map upsert，重复事件反而只会覆盖同一个对象。这种“文字重复、工具不重复”的差异是很有价值的诊断信号。

## 错误的生命周期绑定

```ts
async function runTurn() {
  const unsubscribe = stream.subscribe(appendDelta);
  try {
    await invokeAgent();
  } finally {
    unsubscribe();
  }
}
```

这里把广播订阅的生命周期绑在了请求 Promise 上。只要请求可以暂停、后台继续或与其他请求重叠，监听器数量就不再等于当前可见 turn 数量。

## 更稳定的模式

```ts
useEffect(() => {
  return stream.subscribe((event) => {
    const active = activeTurnRef.current;
    if (!active) return;
    if (event.sessionId !== active.sessionId) return;
    if (event.turnId !== active.turnId) return;
    applyEvent(event);
  });
}, []);
```

这个模式包含两个独立约束：

- **单一订阅者**：组件或应用生命周期内只订阅一次。
- **显式事件作用域**：所有 turn 级事件携带 `sessionId + turnId`，消费者不能靠闭包猜事件属于谁。

后台任务状态可能在 turn 结束后继续变化，可以只使用 session 级作用域，但必须把这种例外写进协议，而不是省略字段后让消费者自行推断。

## 还要防止迟到的异步收尾

只过滤 delta 还不够。旧请求的结果恢复和 `finally` 也可能在新 turn 启动后执行：

```ts
if (isCurrentVisibleTurn(sessionId, turnId)) {
  setSessionRecord(restored);
  clearStreamingState();
}
```

所有会覆盖共享界面的异步继续点都需要同一个身份检查，包括：

- IPC Promise 返回后恢复 session record。
- catch 中设置失败状态。
- finally 中清空 streaming blocks、busy 状态和工具计时器。
- 延迟 timer 回调更新工具完成状态。

## 回归测试应该锁住什么

一个有效的竞态回归测试至少要同时验证：

1. Turn A 未结束时启动 Turn B，底层只有一个 stream listener。
2. Turn B 的单个 delta 在界面只出现一次。
3. Turn A 的迟到事件不会进入 Turn B。
4. Turn A 完成后，Turn B 的内容和运行状态仍然存在。

只测试“正常单 turn 能显示文字”无法发现这个问题，因为 bug 的前提正是两个生命周期发生重叠。

## 核心结论

- 广播订阅生命周期不应绑定到单次请求生命周期。
- 增量事件必须携带足以唯一定位消费者的作用域。
- Map upsert 能掩盖重复消费，append 状态更容易暴露它。
- 过滤实时事件后，还必须隔离旧 Promise 的结果和 finally。
- 并发与切换类 bug 必须用交错时间线测试，普通 happy path 覆盖不到。

来源变更：[`20260717-1550-fix-stream-event-turn-routing.md`](../../histories/2026-07/20260717-1550-fix-stream-event-turn-routing.md)
