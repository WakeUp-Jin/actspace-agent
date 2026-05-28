## [2026-05-28 20:30] | Task: Usage 页面热力图加 hover tooltip，下线使用趋势柱图

### 🤖 Execution Context

- **Agent ID**: 本地 Cursor 协作
- **Base Model**: Claude Opus 4.7
- **Runtime**: Cursor Desktop（IDE 内 Agent）

### 📥 User Query

> 调整一下这个吧，鼠标悬浮可以简单的显示一下百分之之类的东西，是否可以呢？像这个图片一样，显示模型占比消耗之类的。热力图也是这样的：鼠标悬浮有区别的，我在思考，项目中使用趋势和热力图是不是可以只保存一个就可以啦。

用户附带两张参考图：一张是趋势柱图 hover 时弹出日期 + 总 tokens + 按模型分布的 popover；一张是热力图同款 popover。

讨论后明确：**只保留热力图**（hover tooltip 后能力是趋势图的超集），下线"使用趋势"卡。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、`docs/`

**Key Actions:**

- **[shared 契约扩展]**：`packages/shared/src/ipc.ts` 新增 `UsageStatisticsDailyModelBreakdown { name, totalTokens, percent }`，并把它作为 `UsageStatisticsDailyRow.modelBreakdown` 字段。注意 `percent` 是"日内占比"而非整段时间窗占比——和主区 `modelDistribution.percent` 是两个不同口径，doc 里专门写清楚以免后续 bug。
- **[agent-core 聚合层]**：
  - `usage-statistics.ts` 的 `DailyAccumulator` 在原有字段基础上多挂一个 `modelTokens: Map<string, number>`，按 model 展示名（`usage.model`）累加。
  - 输出阶段抽出 `buildDailyModelBreakdown(modelTokens, dailyTotal)`：稳定排序（tokens 降序 + name 升序），percent 走 1 位小数；空日返回 `[]` 不返回 `undefined`，让 UI 走"无明细"分支不必判 nil。
  - 跑通 `aggregateEvents → createUsageStatisticsSnapshot / createGlobalUsageStatisticsSnapshot` 两条公开 API，两边都自动带上新字段。
- **[UI 重构 UsageStatisticsPage.tsx]**：
  - **删除**"使用趋势"整张卡片，连同 `buildTrendBars()` helper 一并清掉，避免代码层面留尾巴。
  - 热力图整体抽成 `<HeatmapGrid columns>` 子组件 + `<HeatmapTooltip row placement>` + `<HeatmapTooltipModelRow model color>` 三个组件，**hover state 上提到 HeatmapGrid 父层**，tooltip 只渲染一份。这样 hover 拖动时只走一次 `setState`，不会每格一份 tooltip 抢 React 工作量。
  - tooltip 位置自适应：hover 行 `rowIndex ≤ 2`（热力图上半部）时 tooltip 朝下展开，下半部时朝上展开，避免顶部裁切。
  - 单格改成 `<button type="button">`，绑定 `aria-label`（含日期 + tokens 或"无数据"）+ `onMouseEnter/Leave + onFocus/Blur`，键盘 Tab 也能触发 tooltip。
  - tooltip 用 `pointer-events-none + absolute` 跟着 hover 格走，没走 portal——本场景外层没有 `overflow:hidden` 裁切，避免引入 portal 让 SSR/单测复杂化。
- **[fixture 补全]**：`usageStatisticsFixture.ts` 4 条 dailyRow 每条都补上真实形状的 `modelBreakdown`（3 个 model 各自数字 + 占比，全部加起来等于当日 totalTokens 的合理近似）。
- **[测试]**：
  - `packages/agent-core/src/persistence/test/usage-statistics.test.ts` 加 2 用例：
    - 按"tokens 降序、并列按 name 升序"组装 modelBreakdown（覆盖排序稳定性 + 多日多模型累加）；
    - 纯 user_message 的日子 `modelBreakdown` 返回 `[]` 而非 `undefined`。
  - **新增** `packages/desktop/src/renderer/test/usage-statistics-page.test.tsx`（3 用例）：
    - 默认渲染不存在"使用趋势"卡——防止后续重新引入；
    - hover 有数据的格子弹 tooltip，含日期 / 总 tokens / `model breakdown` / 头条模型名 / 占比；
    - hover 无数据的格子不弹 tooltip。
- **[文档]**：`docs/design-docs/frontend-ui/usage-statistics/设计规范.md`
  - 「左栏」第 2 块"热力图"段补全 hover tooltip 设计；
  - 「左栏」第 4 块"使用趋势"标记废弃，给出原因 + 关联 history 链接；
  - 「统计字段」段说明 modelBreakdown 与主区 modelDistribution 的 percent 语义差异。

### 🧠 Design Intent (Why)

#### 为什么是热力图保留、趋势图删

- **能力包含关系**：加 hover tooltip 后，热力图既能看长期活跃节奏（一年颜色矩阵），又能 hover 任意一格看到当日 token 数 + 模型分布；趋势柱图能做的事是它的子集（按日数字比较）。同时保留两个是视觉冗余，左栏会非常拥挤。
- **柱图的现存缺陷**：旧实现里柱高是按"最近 31 天最大值"归一化的，最高那根只代表局部峰值——绝对量上可能并不大，用户看到"今天柱子最高"会误解为"今天创纪录"。删掉就直接绕开这个心智成本。

#### 数据契约层为什么必须分两套 percent

`modelDistribution.percent` 是"整段时间窗内的全局占比"（左栏头部模型排行用），`modelBreakdown.percent` 是"在当日 totalTokens 内的占比"（热力图 tooltip 用）。两者在数值上**通常不同**，例子：

- 整月 gpt-5.5 占 48%，但 5-25 当天 gpt-5.5 因为某个 task 跑得多达到 61%。

如果在 UI 上混用同一个 percent 字段，要么主区数字对不上、要么 tooltip 数字对不上。明确分两个字段、在 doc 里注明语义，是契约层的纪律。

#### hover state 为什么放在父组件

如果每个 cell 各自维护 `useState`，112 个 cell 就有 112 份本地 state；用户拖动鼠标穿过热力图时，会触发 112 次"setState false"。把 state 上提到父层只剩 1 份，性能直接落到 60fps 不卡。

副作用：所有 cell 都得"上报 hover 事件给父层"，导致每个 cell 比独立 state 多一层闭包。但这点开销远低于多份本地 state 带来的 React 工作量。

#### 排序规则为什么要带 name 二级 key

主区 `modelDistribution` 排序只看 tokens——但在 tooltip 里两个模型 tokens 相等的概率会高很多（小样本日子里 gpt 一条 / claude 一条都跑了一次都是 500 tokens），如果没有二级排序键，渲染顺序会随 Map iteration order 抖动，单测断言会变成 flake。`name asc` 是稳定且 reader-friendly 的 tiebreaker。

#### tooltip 为什么不走 portal

Portal 的典型理由是"我需要逃离父容器的 `overflow:hidden` / 高 z-index 战争"。本场景：

- 热力图整体在一个 panel 里，panel 没有 overflow hidden；
- 热力图列容器有 `overflow-x-auto`，但 tooltip 的尺寸（260px）和单格大小相比足够小，绝对定位在格子上能完整显示。

走 portal 反而要解决"挂到 document.body 后的位置计算"以及"jsdom 单测的边界条件"。决定保留在格子内的 absolute 定位栈。

### 📁 Files Modified

- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/persistence/usage-statistics.ts`
- `packages/agent-core/src/persistence/test/usage-statistics.test.ts`
- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `packages/desktop/src/renderer/fixtures/usageStatisticsFixture.ts`
- `packages/desktop/src/renderer/test/usage-statistics-page.test.tsx`（新增）
- `docs/design-docs/frontend-ui/usage-statistics/设计规范.md`
