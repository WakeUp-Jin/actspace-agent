# 流式 UI 状态模型与交接：顺序建模、数据源互斥、身份稳定、终态持久

合并自六篇：按事件到达顺序建模（segments）、流式 UI 需要显式状态边界、流式 UI 交接需要单一数据源（原 HTML，已转 md）、Durable 消息身份跨 Projection 稳定、流式正文必须在终态完成持久交接、React state batching 下的同步事件流追加陷阱。主线：**流式阶段与持久阶段是两个数据源，交接那一刻只能有一个来源、同一个展示身份、不丢内容**。

## 1. 流式状态按事件到达顺序建模，不按类型分桶

后端依次推 `text_delta("我来读一下文件") → tool_started(read) → tool_finished(read) → text_delta("文件内容是…")`。按类型分桶（`thinkingText`/`assistantText`/`activeTools`）再 `toBlocks()` 按桶顺序输出 thinking → tools → text，用户会看到“所有工具在最前、所有文字在最后”，而不是真实交叉顺序。

解法：用按到达顺序 push 的 `segments` 数组：

```ts
type StreamingSegment =
  | { type: "thinking"; text: string } | { type: "text"; text: string } | { type: "tool"; toolCallId: string };
type StreamingState = { segments: StreamingSegment[]; activeTools: Map<string, ToolEntry> };
```

当前 segment 与新事件同类（都是 text 或都是 thinking）就追加，否则新建；工具永远新建独立 segment；`toBlocks()` 顺序遍历。分桶是空间思维，segments 是时间思维；适用于任何“多种类型有序事件流 → UI 列表”。要点：必须合并连续同类 segment（否则 `streaming-assistant-0…N` 上百个碎片 block）；工具状态仍用 Map，segment 只存 `toolCallId`，`tool_finished` 时更新 Map（edit/write 的 preview 在 finished 才含 diff，不更新 preview 流式阶段就看不到正确内容）；不要双份存储大数据。

## 2. 三类状态与终止状态

流式 UI 不能只靠最终持久化结果驱动：乐观状态（用户刚发的消息，本地立即显示）、进行中状态（assistant/thinking delta、tool started/finished）、终止状态（completed/failed/aborted），生命周期不同，混在一个数组里覆盖会出现“用户消息闪现后消失”“工具开始时没参数”“取消后像普通完成一样清场”。

- 流式期间用 optimistic/streaming state 即时反馈；完成后以持久化 session events 为事实来源；abort 单独建模，不当成 completed 或 error。
- 用户输入发送时立即进入 optimistic block，后续 stream event 重建 blocks 不能丢掉它；`tool_started` 带结构化 preview，不等 `tool_finished` 才生成工具展示语义；running UI 显示“正在做什么”而不是 “Executing”；用户取消返回 `aborted`，展示 `Stopped`，不渲染成 error；普通完成清理临时 streaming state，aborted 保留当前可见内容并追加停止状态；历史恢复也要表达这轮是主动停止。

## 3. 交接：数据源互斥 + 展示身份稳定

模型完成时的“闪一下”经常不是浏览器刷新，而是同一条消息先渲染两次，再以另一组 React key 重新挂载。典型时间线：Streaming（内存持续更新）→ **重叠帧**（SessionRecord 已含当前 turn 但 streaming blocks 尚未清空，页面高度突增）→ Persisted（流式块移除，持久化块以随机 event id 重新挂载，旧节点卸载、新节点播放入场动画）。

两个必须同时成立的不变量：
1. **数据源互斥**：同一 `turnId` 在任何渲染帧中只能来自 streaming 或 persisted。
2. **展示身份稳定**：同一逻辑消息在两个阶段拥有相同 React key。持久化身份（event id，用于日志、消息操作、缓存、数据引用，可随机）不能承担 UI 交接身份；展示身份 `render key` 由 `turnId + 语义槽位` 派生，如 `turn:T1:assistant:0`。

```ts
// 反例：状态直接相加，并在中间插入异步刷新
messages = [...persistedMessages, ...streamingBlocks]
setSessionRecord(restored); await refreshSidebar(); setStreamingBlocks([])
// 正例：按 turn 互斥，同步交接，辅助刷新放在交接之后
persistedVisible = persisted.filter(e => e.turnId !== streamingTurnId)
setSessionRecord(restored); finishStreamingTurn(); await refreshSidebar()
```

Durable projection 的身份补全：Inbox follow-up 的 claim 事件携带 Surface user node，但事件本身可能没有 `agentRunId`；projection 只从当前事件读身份会退化成 `system`，而 overlay 已按活动 run 生成真实 run key，清理 overlay 时节点重新挂载、入场动画与布局测量重跑，表现为最终回复后闪烁。做法：projection 前建事件图索引 `messageId -> claim event -> turn/start -> { turnId, agentRunId }`，所有 Surface projection 用它补全缺失身份；`next-turn` claim 取后继 turn，`next-step` claim 取当前 turn，无法关联才回退 `system`。内容相等不等于 UI 身份相等；Inbox、retry、compaction 常是“关系事件”，要结合邻近事件恢复上下文。

回归测试：普通 happy path 很难观察短暂重叠。故意让最终会话列表刷新保持 pending，在这个窗口断言：用户消息与最终回复各一份；流式阶段与持久化阶段的 turn DOM 是同一节点；Assistant/Thinking/工具块没有因 event id 变化而 remount；完成、失败、Abort、Session 切换使用相同交接规则；overlay 清理后 React 复用原节点。

陷阱：只把多个 `setState` 放一起却没定义“当前 turn 只能有一个来源”的渲染不变量；直接把持久化 event id 当展示 key（破坏缓存、可视化、日志引用）；只移除动画类掩盖 remount 症状，组件内部展开状态仍丢；用增删动画补偿身份漂移；把 Session 列表、Review、统计刷新夹在消息区交接中间，重新制造异步渲染窗口；只测最终文本不测 streaming→durable 的 `renderKey` 一致性；把缺 `agentRunId` 的事件直接标 `system`。

## 4. 终态必须完成持久交接（停止与报错也一样）

用户看见的流式正文来自临时状态，刷新后的正文来自持久记录；只在成功完成时交接，停止和报错会让已显示的内容消失。流处理保留三个事实：消息身份、已收集内容、结束原因。迭代器抛错时不能新建空结果（既丢正文也丢身份）；停止信号后迭代器可能直接结束、没有最后一个 aborted 事件，所以迭代结束后仍要检查信号。终态写入时消息事件与展示记录引用同一份部分正文；未执行的工具调用不能因保留正文而进入可执行路径或形成悬空工具上下文；错误原因与部分答案是两种信息，界面同时保留。验证不能只断言运行变 failed/aborted：比较最后一个 chunk 与终态消息的 ID，检查持久展示记录，从事件重放后确认正文仍在，再用真实界面刷新检查临时层到持久层的交接。

## 5. React batching：外部同步事件源要用函数式 setState

外部事件源在同一调用栈里连续触发多条事件时，React 不保证每次 `setState(next)` 后闭包或 ref 立即看到最新 state。`const next = [...eventsRef.current, event]; setEvents(next)` 在 `a -> b -> c` 同批到达时可能只剩 `old + c`。事件有配对关系（`tool_call`/`tool_result`）时丢开始事件比丢普通日志更危险：后续聚合失真，即使后端日志完整。正确写法：`setEvents(current => { const next = [...current, event]; eventsRef.current = next; return next })`——追加基准必须是 updater 参数而不是闭包快照；回归测试模拟“同一个 act/flush 内连续推多条事件”，而不只是逐条异步到达。

## 自检

1. `tool_started` 到了但 `tool_finished` 没到，UI 能看出工具参数吗？用户点 stop，流式内容该清掉、保留还是转 error？
2. 同一 `turnId` 会不会在某一帧同时来自 streaming 和 persisted？两阶段 React key 是否一致？
3. 流直接 throw 时局部聚合变量在哪？停止后没有新事件如何结算？刷新后看到的文本来自哪份持久记录？
4. `agent/inbox/spliced` 的 claim 为什么要读相邻 `turn/start`？`next-step` 与 `next-turn` 归属方向有何不同？

来源：`docs/histories/2026-05/20260526-1501-filediff-ui-streaming-order.md`、`.../20260525-1939-streaming-turn-control-polish.md`、`.../20260528-1539-kairos-sync-event-preservation.md`、`docs/histories/2026-07/20260717-1954-fix-stream-persistence-handoff.md`。
