# 会话导航的临时历史与异步回滚

桌面工作台里的 Back / Forward 通常不是浏览器历史，也不是持久化会话日志，而是当前窗口对已访问会话的临时视图。这个区别决定了状态机的边界：导航历史可以在内存中维护，Session Journal 继续只记录业务事实。

## 关键模式

点击导航按钮时，先移动内存索引并设置 `pending`，再调用异步的 `onSelectSession`。只有目标会话真正完成切换后，才清理 pending；如果回调同步抛错或返回 rejected Promise，则必须把索引退回，并解除 pending，否则 UI 会出现“按钮一直不可用”或历史位置漂移。

```ts
setSessionNavigationPending(true);
void Promise.resolve()
  .then(() => onSelectSession(targetId))
  .catch(() => {
    sessionHistoryIndexRef.current -= direction;
    setSessionNavigationPending(false);
  });
```

这里使用 `Promise.resolve().then(...)` 的原因是：直接写 `Promise.resolve(onSelectSession(...))` 时，函数参数会先求值，`onSelectSession` 的同步异常不会进入 Promise 链；包进 `then` 才能统一处理同步抛错和异步拒绝。

## 自检

- 导航失败后，Back / Forward 是否恢复可点击状态？
- 新会话是否截断当前位置之后的 Forward 历史？
- 这段临时历史是否误写入了 Session Journal？
