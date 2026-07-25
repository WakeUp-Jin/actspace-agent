## [2026-05-28 17:35] | Task: Kairos 用量胶囊改走持久化累加器（跨重启不丢）

> ⚠️ **后续延伸**：本轮做的是**单维度**累加器（`usageToday`，reset 清零）。同日 20:00
> 又把它升级成**双维度**（`usageLifetime` 不清 + `usageSinceReset` 清零）+ UI logo
> 切换，schema 升 v2 并自动迁移 v1。详见
> [20260528-2000-kairos-usage-badge-dual-dimension.md](./20260528-2000-kairos-usage-badge-dual-dimension.md)。


### 🤖 Execution Context

- **Agent ID**: 本地 Cursor 协作
- **Base Model**: Claude Opus 4.7
- **Runtime**: Cursor Desktop（IDE 内 Agent）

### 📥 User Query

> 数据范围的话，那么就是从启动开始，所有的数据，从用户第一次点击开启，从 kairos 第一次有数据，不然统计没有意义。

承接 [`20260528-1702-kairos-usage-badge.md`](20260528-1702-kairos-usage-badge.md) 的现场：v1 实现把胶囊数据走"renderer 端从 ring buffer 实时聚合"。用户验收后明确：默认 buffer 容量 200 条，跑久了就会从头部丢老的 `llm_usage`，胶囊数字会**变小**——这违反"我想看到的是真实账单"的最基本心智。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`、`packages/shared`、`packages/desktop`、`docs/`

**Key Actions:**

- **[shared `KairosUsageSummary` 迁到 contracts]**：`kairos-aggregator.ts` 的接口定义挪到 `kairos-contracts.ts`，因为它已经同时是 IPC 状态推送契约和聚合函数返回值——放在 contracts 文件里、aggregator 单向反向依赖，避免循环导入也避免 schema 漂移。`emptyKairosUsageSummary()` / `accumulateKairosUsage(summary, payload, opts)` 两个 helper 也一并导出，前者给 controller / 测试当零值兜底，后者给"运行时累加器"复用单条增量逻辑，不必再走完整聚合。
- **[shared `KairosRuntimeState.usageToday`]**：在运行时 state 上加新字段 `usageToday: KairosUsageSummary`，与 `todayTickCount` / `totalSleepSecondsToday` 等"自上次 reset 起"的计数器对齐命名，作为 controller → renderer 的单一权威来源。
- **[agent-core `KairosUsageAccumulator`]**：`storage/usage-accumulator.ts` 新增独立累加器类。职责：
  - 持有内存 `KairosUsageSummary` + 外部 `seenCurrency / currencyMixed` 状态机；
  - `accumulate(payload)` 同步追加 + debounce 300ms 写 `<kairosRoot>/memory/usage-accumulator.json`，写盘走"writeFile .tmp + rename" atomic 模式；
  - `load(rebuildFromDisk)` 启动时优先读 accumulator 文件；缺失/损坏时回退到调用方传进来的兜底 events（controller 实际用 `store.loadDaily(UTC today)`，扫今日最新短期记忆段重建）；
  - `reset()` 清空 in-memory + `unlink` 磁盘文件；reset 时若仍有 in-flight `pendingWrite` 会先 await 它再 unlink，避免 race 把"已删除"覆盖回去；
  - `flush()` 立即落盘剩余 dirty 内容，给 shutdown / 测试用。
- **[controller 接入累加器]**：
  - 启动阶段 `await usageAccumulator.load(...)`，并把 `usageAccumulator.getSummary()` 作为 `runtimeState.usageToday` 的初值；
  - `eventSink` 在 `event.type === "llm_usage"` 分支调用 `usageAccumulator.accumulate(payload)`，刷新 `runtimeState.usageToday` 并 emit 一次 `state`，让前端胶囊毫秒级跟上；
  - `resetToday()` 调 `await usageAccumulator.reset()`，连带删盘 + 清零 `usageToday`；
  - 新增 `utcDateKey()` helper 与 `ShortMemoryStore.toIsoDate` 对齐，专门用于"扫描当日分段文件"兜底，避免本地时区导致找错段。
- **[renderer 重写数据源]**：`kairosSelectors.ts` 的 `buildKairosUsageBadge` 改签名 `(summary: KairosUsageSummary | null) => KairosUsageBadgeModel`——直接接受 controller 推过来的累计，不再调 `aggregateKairosUsage(events)`。`KairosPage.tsx` 改为 `useMemo(() => buildKairosUsageBadge(k.state?.usageToday ?? null), [k.state?.usageToday])`。 `aggregateKairosUsage` 仍保留导出，单测/未来"按时间窗汇总"还会用。
- **[测试覆盖]**：
  - `agent-core/kairos/storage/test/usage-accumulator.test.ts` 5 个用例：累加正确性、币种 MIXED 切换、写盘+重建、文件损坏时 fallback、reset 删盘。
  - `agent-core/kairos/test/controller.test.ts` 3 个新用例：usageToday 在多次 `llm_usage` 后累加 / `resetToday` 清空并删 accumulator 文件 / 预放 accumulator.json 模拟"上次进程的账"启动后能恢复。
  - `desktop/renderer/test/kairos-page.test.tsx` 把原"按 events 聚合"那个用例改为"按 `state.usageToday` 渲染"；并新增"controller 通过 state stream 推用量后胶囊实时更新"用例。
  - 其它 KairosRuntimeState 构造的 fixture（`kairos-page.test.tsx` / `right-panel-kairos.test.tsx` / `kairos-ipc-internals.test.ts`）全部补 `usageToday: emptyKairosUsageSummary()`。
- **[文档同步]**：
  - `docs/design-docs/kairos/agent-kairos-autonomous-mode.md` runner 章节追加 `KairosUsageAccumulator` 段，说明持久化路径、跨重启恢复、resetToday 行为。
  - `docs/design-docs/kairos/front-Kairos监控页规范.md` 用量胶囊章节改写数据来源：从 `aggregateKairosUsage(events)` 改成 `KairosRuntimeState.usageToday`，并显式说"不再 renderer 端聚合 ring buffer"以及为什么（ring buffer 200 条会滚动 → 跑久了胶囊会变小）。

### 🧠 Design Intent (Why)

用户的反馈一句话能转成两条工程约束：

1. 累计**不能因 ring buffer 滚动而失真**——这是产品行为正确性的硬要求。
2. 累计**应当跨进程重启不丢**——这是用户对"成本数字"的基本信任阈值。

在两条之间选实现方案时排除了几种走法：

- **renderer 端按需 IPC 倒读 jsonl 全部 `llm_usage` 再聚合**：每次开页一次性扫盘，启动期 / 大文件下都会卡。而且 IPC 调用次数会随 LLM 调用数变多而变多，远比"controller 维护一份内存账"昂贵。
- **直接给 ShortMemoryStore 加 `loadAll(): SessionEvent[]`**：同上，把"全量历史"塞进单次 IPC 不可扩展，最终一样要做增量+累加。
- **走 v1 ring buffer + 容量到 5000**：治标不治本，跑一阵子仍然会滚。

最终选 **"controller 维护账本（in-memory + 持久化 + 启动重建）"**，理由：

- **职责更对**：账本是运行时状态机的一部分，理应跟着 `todayTickCount` / `totalSleepSecondsToday` 一起活在 controller 里。
- **跨重启信任最强**：accumulator.json 是单一权威；崩溃中段时还有"扫今日 jsonl 兜底重建"作为冗余。即使 accumulator 写盘失败，下一次启动也能近似复原。
- **renderer 简化**：胶囊变成纯展示组件，前端不再需要在意"事件流是不是完整的"这种语义复杂度。

边界决策记录：

- **`重置今日` 同时清零 usageToday**：与 `todayTickCount` 命名 + 行为对齐，让"重置今日"按钮在产品语义上保持一致（"今天重新开始 = 清空所有 today\* 字段"）。如果以后要"全生命周期总账"再加个 `usageLifetime` 字段并配单独按钮，**不**改 today 的语义——避免现有按钮被复用导致用户对"重置"的预期错位。
- **debounce 300ms 写盘**：单次 LLM 调用毫秒级，但短时间内可能连续多条；debounce 300ms 把突发 N 次写合成 1 次，落盘 IO 极小但仍保留"几乎实时"的恢复点。
- **atomic write（writeFile .tmp + rename）**：避免崩溃中段把 accumulator.json 截断成 0 字节，让重建路径必须靠扫 jsonl 才能找回——直接 rename 保证文件始终是完整的旧版本或新版本。
- **`load()` 不写盘**：从兜底源重建出来的 summary 不立刻落地，等下一次 `accumulate()` / `flush()` 才真的写——避免只读引导阶段触发 IO，也避免"重建结果可能有微小不一致"的情况下立刻把它"洗白成磁盘事实"。
- **UTC 日期键**：扫盘兜底必须跟 `ShortMemoryStore.toIsoDate`（UTC）对齐，否则跨时区会找错段。controller 其它 today\* 计数继续走本地时区（产品视角），两条线分开正常。

### 📁 Files Modified

- `packages/shared/src/kairos-contracts.ts`
- `packages/shared/src/kairos-aggregator.ts`
- `packages/shared/src/index.ts`
- `packages/agent-core/src/kairos/controller.ts`
- `packages/agent-core/src/kairos/storage/usage-accumulator.ts`
- `packages/agent-core/src/kairos/storage/test/usage-accumulator.test.ts`
- `packages/agent-core/src/kairos/test/controller.test.ts`
- `packages/desktop/src/renderer/state/kairosSelectors.ts`
- `packages/desktop/src/renderer/pages/KairosPage.tsx`
- `packages/desktop/src/renderer/test/kairos-page.test.tsx`
- `packages/desktop/src/renderer/test/right-panel-kairos.test.tsx`
- `packages/desktop/src/main/test/kairos-ipc-internals.test.ts`
- `docs/design-docs/kairos/agent-kairos-autonomous-mode.md`
- `docs/design-docs/kairos/front-Kairos监控页规范.md`
