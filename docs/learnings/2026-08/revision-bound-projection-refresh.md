# Revision-bound Projection：让事件流和持久快照保持可恢复一致

## 是什么

在事件驱动的 Agent UI 中，live event 适合展示“正在发生什么”，Session snapshot 才是可恢复的事实。两者必须通过 Journal revision 关联：事件告诉客户端“事实源已经推进到哪里”，客户端再拉取并应用不低于该 revision 的 snapshot/projected values。

## 为什么需要

如果客户端只把 live event 写入 overlay，而不刷新 snapshot，UI 会同时拥有两套状态：一套是旧的持久投影，一套是新的临时进度。状态机根据旧 projection 判断 Composer 仍处于 `blank`，就可能把 follow-up 输入框移动到 initial 分支，或者在 Session 尚未 ready 的短暂窗口完全不渲染。

这类 bug 往往是时序性的：刷新足够快时看起来正常，网络、Electron IPC 或 React 批处理稍有延迟就会暴露。

## 怎么用

### Before：只保存 overlay

```ts
store.applyLiveEvent(event);
// snapshot/projectionValues 仍然停留在 throughJournalSeq = 0
```

### After：按 revision 去重刷新

```ts
store.applyLiveEvent(event);
if (event.sessionId === store.selectedSessionId
  && event.throughJournalSeq > currentProjectionSeq) {
  scheduleRefresh(event.sessionId, event.throughJournalSeq);
}
```

刷新完成后，只有 durable snapshot 追上 overlay 的 `throughJournalSeq` 才清理 overlay。刷新请求需要去重，并用 request generation 拒绝旧请求覆盖新 Session。

## 核心要点

1. `sessionId + throughJournalSeq + requestGeneration` 是异步 IPC 结果的最低一致性元组。
2. live event 是提示，不是第二个 Journal；不要让 UI 永久从 overlay 推导持久状态。
3. projection 落后期间，UI 应采用安全的降级状态，避免把用户输入入口隐藏掉。
4. 刷新必须可合并：多个连续 live event 只需要一次或少量按水位推进的读取。

## 常见陷阱

- 只比较 `liveSeq`，忽略 `throughJournalSeq`，导致实时序列正常但 durable projection 仍旧。
- 刷新时重新 `select(sessionId)`，把正在显示的 Session 短暂置为 loading，造成闪烁或输入框卸载。
- snapshot 更新后忘记清理 overlay，造成“完成后仍显示运行中”的假状态。
- 只测理想顺序，没有覆盖 live event 在首次 open 尚未完成时到达的竞态。

## 自检问题

1. 如果 live event 的 `throughJournalSeq` 小于当前 snapshot，客户端应该如何处理？
2. 为什么刷新请求需要 request generation，而不能只比较 Session id？
3. 当 projection 暂时不可用时，Composer 的安全默认状态应该是什么？
