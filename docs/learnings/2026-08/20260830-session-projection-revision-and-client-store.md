# Session Projection 的一致性水位与可丢失客户端状态

## 是什么

在事件日志驱动的 Agent 应用里，Session Journal 应该是唯一持久化事实源。UI 不直接拼装多份临时状态，而是读取带一致性水位的 projection snapshot：

```text
Session Journal
    └─ Projection Registry
          └─ { sessionId, throughJournalSeq, values }
                         └─ ClientSessionStore
```

`throughJournalSeq` 表示这个快照已经处理到哪一个 Journal 序号。它不是 UI 的渲染计数，而是判断异步结果能否被接受的边界。

## 为什么需要

如果 `sessionRecord`、流式 blocks、最终 messages、Context response 和可见 Session 列表都各自维护，Agent 回复结束或快速切换 Session 时，输入框、消息和 Context 很容易短暂来自不同事实源。常见表现是：最终回复出现后 Composer 被卸载、旧 Session 的流事件污染当前页面、旧的 Context describe 覆盖新请求。

把 durable snapshot 和临时 live overlay 分开可以同时满足两个要求：

- Journal commit 之前可以显示流式进度；
- Journal commit 之后必须以 projection 为准，并清理已被 durable state 接管的 overlay。

## 怎么用

### Before：按 UI 状态猜当前会话

```ts
const session = sessionRecord ?? visibleSessions[0];
const messages = persistedMessages.length ? persistedMessages : streamingBlocks;
```

这种写法把列表顺序和临时渲染状态变成事实来源，无法判断结果是否属于当前 Session。

### After：按 Session identity 和 revision 接收结果

```ts
store.select(sessionId);

store.applySnapshot({
  sessionId,
  throughJournalSeq: 42,
  snapshot,
});

store.applyProjectionValue({
  sessionId,
  throughJournalSeq: 42,
  projectionKey: "composer",
  value: { phase: "active" },
});
```

Store 应拒绝以下结果：Session 不匹配、`throughJournalSeq` 回退、request generation 过期、runtime identity 已切换，或 live event 序号出现 gap。gap 触发 durable resync，而不是继续把 overlay 当成事实。

Projection cache 只保存 checkpoint 和可重放的派生 state。删除 cache 后，从 Journal 恢复出相同 state 是正确性要求；cache 命中只影响速度，不影响语义。

## 核心要点

1. `sessionId + throughJournalSeq` 是跨 Host、IPC、Client、Renderer 的最小一致性单元。
2. Projection registry 应是纯 fold，不能依赖 Electron、React、Provider class 或 credential。
3. Live Progress 是可丢失 overlay，durable Surface commit 后由 Journal projection 接管。
4. Provider usage、request context estimate、composer phase 和 Trajectory 要使用不同 projection key 与明确版本。
5. Trajectory 不是第二份日志，而是同一 Journal 的只读诊断投影。

## 常见陷阱

- 只在顶层保存 `activeSessionIdRef`，组件仍从 `visibleSessions[0]` 推导数据。
- 给 snapshot 加 revision，却没有在每个异步 IPC response 上检查 revision。
- 发现 live gap 后继续追加 overlay，导致缺失事件被永久隐藏。
- 用 token usage 数字代替 request context estimate，两个指标语义不同。
- 为 Trajectory 单独写日志，最后出现两套排序和恢复语义。

## 自检问题

1. 如果 Session A 的 response 在 Session B 已选中后返回，哪个字段让 Client Store 拒绝它？
2. 删除 Projection Cache 后，系统从哪里恢复事实，为什么结果应该相同？
3. 最终 assistant message commit 后，Composer 为什么不应该由 `messages.length` 决定是否卸载？

## 来源

本篇知识点提炼自 2026-08-30 ActSpace Session Projection Runtime 重构，关联 history：`docs/histories/2026-08/20260830-2311-session-projection-runtime.md`。

