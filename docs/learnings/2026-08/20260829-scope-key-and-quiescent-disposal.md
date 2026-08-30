# Opaque ScopeKey 与可等待静止的资源清理

## 是什么

Agent 的 live event scope 不应使用 descriptor、preset 或公开 Agent ID，而应使用只在进程内按对象 identity 比较的 opaque `ScopeKey`。Scope parent relation 再通过这组 key 驱动 registry visibility、事件 admission 和资源清理。

与此同时，Scope dispose 不能只是一个“设置 closed 标志”的同步动作。它需要进入 quiescing 状态，拒绝新注册和新工作，等待已有 listener、stream、tool lease 和 child scope 结束，再进入 disposed 状态。

## 为什么需要

字符串 ID 可能被复用：同一 descriptor 可以创建多个并行 Agent，同一 Session 也可能经历恢复或替换。如果把 ID 当作 live routing key，多个 Agent 会共享 listener 或 registry view。

另一个常见陷阱是并发 shutdown：第一个 dispose 调用开始异步清理后，第二个调用如果直接返回，调用方会误以为资源已经静止。所有竞争者必须等待同一个 disposal Promise。

## 核心模式

```text
live Agent object
      │
      └── opaque ScopeKey ── WeakMap ── parent ScopeKey
                                  │
             ┌────────────────────┼───────────────────┐
             ▼                    ▼                   ▼
       registry view       event admission       resource owner
```

```ts
const first = scope.dispose()
const second = scope.dispose()
await Promise.all([first, second]) // same quiescence boundary
```

## 常见陷阱

- 公开 `agentId` 适合诊断和持久化，不适合充当 live scope identity。
- parent registry 与 event parent chain 如果分别维护，很容易出现“child 能读贡献但 parent 收不到事件”的漂移。
- child dispose 只能撤销 child-local registration，不能删除 parent layer。
- Scope 是同进程可见性和生命周期边界，不是 sandbox 或 Host permission boundary。

## 自检问题

1. 两个同 descriptor 的 Agent 是否仍然拥有两个不同的 ScopeKey？
2. parent dispose 的第二个并发调用是否等待第一个调用完成？
3. child 看见 parent contribution 是否意味着 child 获得 parent 的 credential 或 Host authority？
