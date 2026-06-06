# 流式工具流折叠：结构性分组在 streaming 期间会抖动

关联 history：`docs/histories/2026-06/20260606-1500-tool-activity-group-collapse.md`

## 是什么

做「Cursor 式」的工具流展示时，一个 turn 要拆成两块：

- **过程**（thinking + 工具 + 工具间旁白文本）→ 折叠进 `Worked for Xs`
- **最终回复**（turn 末尾那段答案）→ 留在折叠块外，全宽渲染

很自然会写一个纯结构性的 split：「末尾连续的 assistant 块 = 最终回复，其余 = 过程」。这个 split 在**完成态**完全正确，但直接用在**流式过程中**会抖动。

## 为什么会抖

Agent 的执行是多轮 LLM 调用拼起来的，单轮里文本和工具调用是**交错**产生的：

```
step1: text"我先读取" → tool read        （旁白 + 工具）
（执行 read，拿到结果）
step2: text"现在搜索" → tool search       （又是旁白 + 工具）
step3: text"最终结论…"                     （这次没工具 = 真正的最终回复）
```

流式渲染按到达顺序累积。当 `step2` 的 `text"现在搜索"` 刚流出、`tool search` 还没到时，它就成了「末尾的 assistant 块」——结构性 split 立刻把它判成「最终回复」，于是：

1. 过程折叠成 `Worked for` toggle
2. `tool search` 到达 → 「现在搜索」不再是末尾 → 重新归入过程
3. toggle 消失、滚动视口重开

一个旁白 → 一次「折叠 / 展开」抖动。旁白越多，闪得越凶。

## 怎么解

**关键认知：流式期间无法可靠区分「旁白」和「最终回复」，因为「它后面还会不会再来工具」要到 turn 结束才知道。**

所以不要让「折叠 / 展开」依赖结构性 split：

- **执行中**（最后一个 turn 且 `isStreaming`）：整段过程**平铺**，**不出折叠 toggle**；最终回复全宽渲染在外。状态切换只由 `isStreaming` 这一个布尔驱动，不依赖「谁在末尾」。
- **turn 结束后**：`isStreaming` 翻 false，这时才把过程塌缩成 `Worked for`，最终回复留在折叠块外。

```tsx
// running 只看 isStreaming + 是否最后一个 turn，不看结构
const isActive = isStreaming && turnIndex === turns.length - 1;
<ToolActivityGroup running={isActive} ...>{workItems}</ToolActivityGroup>
```

`ToolActivityGroup` 内部：`running` 时平铺渲染，否则渲染 `Worked for` toggle。同一个布尔的两个分支，天然没有中间抖动态。

> 旁注：初版在**主 turn 工具组**的执行中套了个固定高度滚动视口（仿 Cursor 的「工具行滚动」），但实测把子 Agent block 这种大块塞进小窗口很憋屈，从主 turn 组下线——主流程执行中直接平铺反而更顺。「滚动视口」和「防抖动」是两件事，主 turn 组被否的是前者，后者（不靠结构 split 驱动折叠）依然成立。
>
> 补记（2026-06-06）：滚动视口本身没错，错的是放错位置。它的正确归属是**内置 Explore 子代理的执行中状态**（`ExploreRunBlock`）——那里的行都是小的 `ToolLogLine`/`ThinkingBlock`，有界滚动正好对上 Cursor 的「Exploring」实时视图；执行完成再塌缩成下拉。即「滚动视口 vs 平铺」要按**行的粒度**选：小工具行用有界滚动，大块（agent panel）用平铺/Panel。

## 核心要点

1. **「能不能 split」取决于信息是否齐全**：判定「最终回复」依赖未来事件（后面还有没有工具），未来未定就不要提前 split。
2. **状态切换尽量由单一确定信号驱动**：用 `isStreaming` 而不是「末尾是不是 assistant」，把抖动源从结构推导降级成一个布尔翻转。
3. **完成态和流式态可以用不同渲染策略**：同一份数据，streaming 走「全量滚动视口」，完成走「折叠 + 最终回复外置」，不强求两态共用同一套 split。
4. **成组要有门槛**：只 thinking + 回答的 turn 不该被包成 `Worked for`（已有 ThinkingBlock 自折叠），只有过程段真的含工具/diff 才成组。

## 自检问题

1. 流式期间最终回复已经全宽显示在折叠块外了，为什么这不会引发 toggle 抖动？（提示：running 分支根本不渲染 toggle，旁白进出 workItems 只是平铺顺序变化。）
2. 耗时 `Worked for Xs` 在流式期间为什么会显示成 `Worked`？落盘后又为什么正确？（提示：流式块的 `createdAt` 是刷新时的 now。）
3. 如果某个 provider 一次性吐完整段（content+tool_calls 不交错），这套方案还需要防抖吗？
