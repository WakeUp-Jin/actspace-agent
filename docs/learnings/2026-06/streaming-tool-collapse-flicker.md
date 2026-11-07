# 流式工具流：折叠不靠结构推导，完成状态不等动画

合并自两篇：流式工具流折叠结构性分组会抖动、工具完成状态不能等待动画。共同主题：**流式期间的状态切换由单一确定信号驱动，生命周期事实不被视觉表现拖延**。

## 1. 折叠：结构性 split 在 streaming 期间会抖动

Cursor 式工具流把一个 turn 拆成：**过程**（thinking + 工具 + 工具间旁白）折叠进 `Worked for Xs`；**最终回复**（turn 末尾答案）留在折叠块外全宽渲染。自然写法是“末尾连续的 assistant 块 = 最终回复，其余 = 过程”——完成态完全正确，流式中会抖。

Agent 是多轮 LLM 调用拼成的，文本与工具交错：`step1: text"我先读取"→tool read`、`step2: text"现在搜索"→tool search`、`step3: text"最终结论…"`。当 step2 的“现在搜索”刚流出、`tool search` 还没到，它成了“末尾 assistant 块”，split 立刻判为最终回复 → 过程折叠成 toggle；`tool search` 到达后它又归入过程 → toggle 消失、滚动视口重开。每条旁白一次折叠/展开抖动。

**流式期间无法可靠区分旁白与最终回复**——“后面还会不会再来工具”要 turn 结束才知道。所以折叠不能依赖结构性 split：
- 执行中（最后一个 turn 且 `isStreaming`）：整段过程**平铺**，不出折叠 toggle，最终回复全宽在外；切换只由 `isStreaming` 一个布尔驱动。
- turn 结束后 `isStreaming` 翻 false，才把过程塌缩成 `Worked for`。
```tsx
const isActive = isStreaming && turnIndex === turns.length - 1;
<ToolActivityGroup running={isActive}>{workItems}</ToolActivityGroup>   // running 平铺，否则渲染 Worked for toggle
```
同一布尔的两个分支，天然没有中间抖动态。

滚动视口 vs 平铺要按**行的粒度**选：主 turn 工具组执行中套固定高度滚动视口，把子 Agent block 这种大块塞进小窗口很憋屈（已下线）；它的正确归属是内置 Explore 子代理执行中状态（`ExploreRunBlock`）——行都是小的 `ToolLogLine`/`ThinkingBlock`，有界滚动正好对上 Cursor 的“Exploring”实时视图，完成后塌缩成下拉。小工具行用有界滚动，大块（agent panel）用平铺/Panel；“滚动视口”和“防抖动”是两件事。

要点：判定“最终回复”依赖未来事件，未来未定就不要提前 split；完成态与流式态可用不同渲染策略；成组要有门槛（只有 thinking + 回答的 turn 不该包成 `Worked for`，ThinkingBlock 已自折叠，过程段真含工具/diff 才成组）。流式期间 `Worked for Xs` 会显示成 `Worked`（流式块 `createdAt` 是刷新时的 now），落盘后才正确。provider 一次性吐完整段（content+tool_calls 不交错）时则不需要这套防抖。

## 2. 完成状态不能等待动画

`tool_finished` 表示某个 `toolCallId` 已完成，这个事实应立即进入前端状态；最短展示时间、shimmer、过渡动画只能影响视觉，不能延迟生命周期状态。多个文件工具很短时间内依次完成时，前端若为每个 running 状态保留固定最短时长，多个定时器会在相近时间触发，用户看到的像“整批工具等最后一个后同时完成”——混淆了执行事实（何时真正完成）与视觉平滑（running 至少展示多久），UI 就不再可信。

做法：以 `toolCallId` 为状态归属键；收到 `tool_finished` 立刻写入 `finished`、`isError`、最终 preview；需要动画就用不改变业务状态的 CSS transition 或单独的纯展示字段；回归测试在同批多个工具中**逐个**发完成事件，确认只有对应工具结束 running。批量调度不代表批量完成，串行执行也不应批量刷新状态；状态测试要观察事件之间的中间帧，而不只检查最终全部完成。

## 自检

1. 流式期间最终回复已全宽显示在折叠块外，为什么不会引发 toggle 抖动？（running 分支根本不渲染 toggle，旁白进出 workItems 只是平铺顺序变化。）
2. 你的“最终回复”判定依赖未来事件吗？
3. 同批多个工具中，第一个完成时界面只让它自己停止 running 吗？

来源：`docs/histories/2026-06/20260606-1500-tool-activity-group-collapse.md`、`docs/histories/2026-07/20260726-0005-tool-finished-immediate-status.md`。
