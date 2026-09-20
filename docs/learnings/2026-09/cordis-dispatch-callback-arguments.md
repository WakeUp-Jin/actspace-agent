# Cordis dispatch 返回 callback 后为什么必须复用同一个参数数组

## 问题

直接调用 `ctx.parallel()` 时，Cordis 会完成事件名解析、scope 过滤和 listener 参数传递。为了逐 listener 隔离异常，调用方有时会先执行 `ctx.events.dispatch("emit", args)` 获取 callback，再自行调用它们。这里最容易犯的错误是重新切片参数，导致 listener 收到 `undefined` 或 scope carrier。

## 关键语义

Cordis 的 `events.dispatch()` 会原地消费传入数组：先移除可选 carrier，再移除事件名，剩下的数组正是 listener 参数。正确模式是复用同一个数组：

```ts
const args = [carrier, "session/checkpoint", payload];
const callbacks = ctx.events.dispatch("emit", args);
const results = await Promise.allSettled(
  callbacks.map((callback) => callback(...args)),
);
```

不要把数组复制后交给 `dispatch`，再用未被消费的原数组调用 callback；那会把 carrier 和事件名误传给业务 listener。也不要在 `dispatch` 之后再次 `slice(1)` 或 `slice(2)`；此时它们已经被移除了。

## 为什么值得手工分发

通知事件需要逐 listener containment：一个 observer 同步抛错或 Promise reject，不应阻止其他 observer。必需事件则需要确认至少有一个 handler，并等待所有 handler 后传播失败。这两种语义都可以复用 Cordis 的过滤结果，但调用 callback 的参数规则必须与 Cordis 自己的 `emit/parallel` 完全一致。

## 自检

- 传给 `dispatch` 和随后展开给 callback 的是否是同一个数组对象？
- 测试是否使用真实 Cordis Context，而不只是不会修改数组的 Map mock？
- scope carrier、全局 listener 和父子 scope listener 是否都有覆盖？

来源：[Session 事件持久化重构 history](../../histories/2026-09/20260920-2335-session-event-persistence.md)。
