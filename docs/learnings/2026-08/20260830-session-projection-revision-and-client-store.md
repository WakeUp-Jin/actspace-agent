# Session Projection 的一致性水位、原子刷新与会话隔离

合并自五篇：投影水位与可丢失客户端状态、revision-bound 刷新、读模型水位与增量折叠、刷新原子提交、会话切换中的运行状态投影。共同主题：**事实在 Journal，UI 读带水位的 projection，live 状态只是可丢失的 overlay**。

## 1. 结构：Journal → Projection → ClientSessionStore

```text
Session Journal
  └─ Projection Registry  -> { sessionId, throughJournalSeq, values }
                                  └─ ClientSessionStore
```

- `throughJournalSeq` 表示快照处理到哪个 Journal 序号；它不是渲染计数，而是“异步结果能不能被接受”的边界。`sessionId + throughJournalSeq + requestGeneration` 是异步 IPC 结果的最低一致性元组。
- 如果 `sessionRecord`、流式 blocks、最终 messages、Context response、可见 Session 列表各自维护，回复结束或快速切换时输入框、消息、Context 会短暂来自不同事实源：最终回复出现后 Composer 被卸载、旧 Session 的流事件污染当前页、旧 Context describe 覆盖新请求。
- durable snapshot 与 live overlay 分开：Journal commit 前可显示流式进度；commit 后以 projection 为准，并清理已被接管的 overlay。
- Projection registry 是纯 fold，不依赖 Electron、React、Provider class、credential。cache 只存 checkpoint 与可重放的派生 state；删 cache 后从 Journal 恢复出相同 state 是正确性要求，命中只影响速度。Trajectory 是同一 Journal 的只读诊断投影，不是第二份日志（否则会出现两套排序与恢复语义）。

## 2. Store 该拒绝什么

```ts
store.select(sessionId);
store.applySnapshot({ sessionId, throughJournalSeq: 42, snapshot });
store.applyProjectionValue({ sessionId, throughJournalSeq: 42, projectionKey: "composer", value: { phase: "active" } });
```

拒绝：Session 不匹配、`throughJournalSeq` 回退、request generation 过期、runtime identity 已切换、live event 序号出现 gap（gap 触发 durable resync，不是继续把 overlay 当事实）。

Before（反例）：`const session = sessionRecord ?? visibleSessions[0]; const messages = persistedMessages.length ? persistedMessages : streamingBlocks;` ——把列表顺序和临时渲染状态当事实源，无法判断结果属于哪个 Session。

## 3. 水位语义要细分

- accepted、durable、projection、window、index generation 是不同的完整性边界，不能用一个 `throughSeq` 伪装全部。equal-seq 同值可幂等丢弃，equal-seq 冲突必须 resync；历史 Window 的更早水位不能覆盖完整 Session facts。
- 事件“同一批”不能替代实体自己的版本：`todo/write` 的 event-level revision 只描述批次，决定某个 Todo 是否被接受的是 item revision；以 `todoId + item revision` 作为 canonical merge key，full replay 与 incremental apply 才得到相同结果（否则部分更新会覆盖事件里没出现的条目）。
- 完整事实 projection、跨实体 summary index、有限展示 window 都可删除重建，但不能反过来成为恢复事实源。
- Provider usage、request context estimate、composer phase、Trajectory 用不同 projection key 与明确版本；不要用 token usage 数字代替 request context estimate。

## 4. live event 是提示，不是第二个 Journal

```ts
store.applyLiveEvent(event);
if (event.sessionId === store.selectedSessionId && event.throughJournalSeq > currentProjectionSeq) {
  scheduleRefresh(event.sessionId, event.throughJournalSeq);
}
```

- 只写 overlay 不刷新 snapshot，状态机会按旧 projection 判断 Composer 仍是 `blank`，把 follow-up 输入框挪到 initial 分支，或在 Session 尚未 ready 的窗口完全不渲染。这类 bug 是时序性的：快时正常，IPC/React 批处理稍有延迟就暴露。
- 刷新完成后，只有 durable snapshot 追上 overlay 的 `throughJournalSeq` 才清理 overlay。刷新要去重/合并（连续多个 live event 只需少量按水位推进的读取），并用 request generation 拒绝旧请求覆盖新 Session。
- projection 落后期间 UI 用安全降级状态，别把用户输入入口藏掉。
- 陷阱：只比较 `liveSeq` 忽略 `throughJournalSeq`；刷新时重新 `select(sessionId)` 把正在显示的 Session 置 loading（闪烁/输入框卸载）；snapshot 更新后忘清 overlay（完成后仍显示运行中）；只测理想顺序，没覆盖 live event 在首次 open 完成前到达的竞态；发现 gap 仍继续追加 overlay。

## 5. 原子提交：batch()

- 完成一个 turn 时 live event 先到，随后才异步读 durable snapshot。若每个 projection 字段分别通知，React 会在同一 revision 上看到多组中间状态。
- 对外暴露小型 `batch()` 事务边界：snapshot、composer、usage、trajectory 先写入 store，最后只通知一次。UI 一次渲染对应一个一致性水位。
- `batch()` 只合并通知，不改变 revision 检查与过期拒绝；事务内可多次写同一 Session，结束时用最新 cell 通知。
- 后台刷新区分“首次加载”与“已有内容的增量同步”：已有 ready snapshot 时刷新期间保持 ready，只替换最终 revision；初次打开仍可 loading，不能把 `preserveReady` 当错误隐藏机制。

## 6. 会话切换不是运行切换

- 执行循环属于 Runtime 的会话 ID，renderer 的选中会话只是视口。把流式状态、工具 Map、停止按钮绑在全局 `active` 引用上，切换时清空会让后台任务继续跑但 UI 丢事件；晚返回的历史快照还会覆盖新会话。
- 三层键：`sessionId` 隔离会话，`agentRunId` 隔离回合，`toolCallId` 隔离工具。事件先写入所属会话的内存投影，只有当前选中会话触发 React 消息渲染。
- 历史读取要有 per-session version，完成回调先让旧读取失效，再合并稳定 ID，避免重复、倒退、串线。审批查询返回时比较版本；Bash 任务更新按 `sessionId + taskId` 保存，不用全局 task ID。
- 泛化：多标签编辑器、下载管理器、后台任务面板——“正在运行什么”与“用户正在看什么”建成不同状态，切换只改观察者，不改生产者。

## 自检

1. Session A 的 response 在 B 已选中后返回，哪个字段让 Store 拒绝它？
2. 删除 Projection Cache 后系统从哪里恢复事实，为什么结果相同？
3. 最终 assistant message commit 后，Composer 为什么不能由 `messages.length` 决定是否卸载？
4. live event 的 `throughJournalSeq` 小于当前 snapshot 怎么办？projection 暂不可用时 Composer 的安全默认是什么？

来源：`docs/histories/2026-08/20260830-2311-session-projection-runtime.md` 及 2026-09 Session 统一改造。
