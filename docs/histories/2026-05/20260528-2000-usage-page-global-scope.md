## [2026-05-28 20:00] | Task: Usage 页面改成跨所有 session + Kairos 的"全部数据"统计

### 🤖 Execution Context

- **Agent ID**: 本地 Cursor 协作
- **Base Model**: Claude Opus 4.7
- **Runtime**: Cursor Desktop（IDE 内 Agent）

### 📥 User Query

> 现在的Usage页面统计的信息是什么？我怎么感觉是一个会话的那种。我想要的不是一个会话，而且全部数据的统计，全部数据呀。

进一步澄清后明确范围：跨所有普通对话 session + Kairos 自主模式的全部历史，时间 tab 走纯时间窗（day=今天 / week=近 7 天 / month=近 30 天 / total=全部）。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、`docs/`

**Key Actions:**

- **[shared 契约升级]**：`packages/shared/src/ipc.ts` 给 `UsageStatisticsGetInput` 增加 `scope?: "session" | "global"`，`sessionId` 改为可选；给 `UsageStatisticsSnapshot` 增加 `scope`、`sourceCount` 字段，`sessionId` 改为 `string | null`、`title` 改为可选。`scope` 字段是单一权威——renderer 用它判断标题与 sessionId 字段渲染，main 用它在 IPC 入口分流读盘策略。
- **[agent-core 聚合层重构]**：
  - `packages/agent-core/src/persistence/usage-statistics.ts` 抽出私有的 `aggregateEvents(events, range, now)`，把"事件 → summary / model / tool / dailyRows"统一收口。
  - 旧 `createUsageStatisticsSnapshot(record, range, now)` 改为薄包装，保持向后兼容（仍用于 `scope === "session"` 路径）。
  - 新增 `createGlobalUsageStatisticsSnapshot({ sessionRecords, kairosEvents, range, now, title })`，把所有来源的 `SessionEvent[]` **事件级合流**后调同一个聚合函数。这样占比、缓存命中率、成本等派生指标只做一次舍入，避免按 snapshot 再合并时的精度漂移。
  - `packages/agent-core/src/persistence/index.ts` 导出新增函数。
- **[Kairos 全量历史 loader]**：`packages/agent-core/src/kairos/storage/short-memory-store.ts` 给 `ShortMemoryStore` 加 `loadAll()`：调用 `listAllDates()` 反向遍历后 flatMap `loadDailyAll(date)`，得到按时间顺序的全部 SessionEvent。该方法仅用于跨重启统计这类冷路径，避免污染热路径。
- **[main IPC handler 改写]**：`packages/desktop/src/main/index.ts`
  - `usage-statistics:get` 按 `scope` 分流：`session` 走旧的"单 record 聚合"，`global` 调 `loadAllSessionRecords(sessionRoot)` + `loadAllKairosEvents(<kairosRoot>/memory/short-term)` 后调用 `createGlobalUsageStatisticsSnapshot`。
  - 两个 IO helper 抽到 main 私有空间，单 session 读失败 / Kairos 目录不存在时都静默跳过，不让单点损坏炸掉整张账单。
- **[renderer 全局口径]**：
  - `packages/desktop/src/renderer/components/WorkbenchLayout.tsx` 的 `loadUsageStatistics` 不再依赖 `activeSessionId / sessions`，直接 `getUsageStatistics({ range, scope: "global" })`。删除"No session selected"这条历史兜底——在 global 语义下没有意义。
  - `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx` 空态文案改为"汇总所有对话 + Kairos"的口径；底部"排名"那一行改为按 `scope` 渲染：`"全部数据 · N 个来源"` vs 单 session 的 title。
  - `packages/desktop/src/renderer/fixtures/usageStatisticsFixture.ts` mock 数据加上 `scope: "global"` / `sessionId: null` / `sourceCount`，与新契约对齐。
- **[测试]**：
  - 新增 `packages/agent-core/src/persistence/test/usage-statistics.test.ts`（6 用例）：单 session 聚合、跨多 session 合流、Kairos 事件并入、day/week/month/total 时间窗、CNY→USD 折算、空输入稳健性。
  - 扩展 `packages/agent-core/src/kairos/storage/test/short-memory-store.test.ts`：补 `loadAll` 跨月跨段顺序 + 空目录返回空数组两条用例。
- **[文档]**：`docs/design-docs/frontend/front-usage-statistics.md` 「数据来源」段重写，明确 scope/range 二维语义，并显式说明 Kairos `usage-accumulator.json` 不进入 Usage 账本。

### 🧠 Design Intent (Why)

用户的痛点本质是：**UI 字段"全部 / total"暗示全量，但底层悄悄被 sessionId 限定了**。

旧实现在 `usage-statistics:get` handler 里直接传 `sessionId` 给 `createUsageStatisticsSnapshot`，前端 `loadUsageStatistics` 用 `activeSessionId ?? sessions[0]?.id` 兜底取一条。结果是：切换不同对话页时 Usage 数字会跟着变；点击"总计"也只是"这条 session 的所有事件"。从产品语义上看，这是一个"参数收窄了取数范围"的反直觉陷阱——用户在监控页头部看到 Kairos 的胶囊在涨，但 Usage 总账却看不到它。

在两条候选里做了选择：

- **方案 A（已采纳）：main 进程在 IPC handler 内做事件级合流**。优点：聚合逻辑收敛在 agent-core 一处，前端只看 snapshot；Kairos 与普通对话在事件层就被同等对待，未来加新事实源也只是新增一个 loader。
- **方案 B：前端拉多个 sessionId 各取 snapshot 再前端合并**。否决理由：IPC round-trip 数量与 session 数量成正比，前端要重做百分比/缓存命中率合并，舍入误差会累积，且分布式失败语义复杂（一条 session 拉失败时全表是否要降级？）。

边界决策：

- **`createUsageStatisticsSnapshot` 不删除**：保留它作为 `scope === "session"` 的官方入口和兼容点，让未来"按会话钻取"视图有现成 API；测试也保留覆盖。
- **`sessionId === null` 而不是 `sessionId === ""`**：null 比空字符串更明确地表达"语义上不存在"，前端 TS 类型也能强制提醒"必须先看 scope 再读 sessionId"。
- **Kairos 走 `ShortMemoryStore.loadAll()` 而不是读 `usage-accumulator.json`**：accumulator 只覆盖"自上次 reset_today 起"的累计，会被"重置今日"按钮清空——拿它做 Usage 账本会复刻和 ring buffer 同样的问题（用户看见数字突然变小）。重新基于 jsonl 事件重建虽然慢，但是真相、且与 reset_today 语义解耦。
- **时间窗按当前时刻往回数 N 天**（而不是"按自然日 / 自然周"）：与 controller 里 `todayTickCount` 等 today\* 计数器保持不同思路——today\* 是"日历今天"，Usage 的 day/week/month 是"最近 N 天"，更接近产品 dashboard 的常见心智。`total` 是"全部历史"。
- **dataRoot 路径硬编码 `kairos/memory/short-term`**：与 `ensureKairosScaffolding` 里 `mkdir(join(kairosRoot, "memory", "short-term"))` 对齐。如果后续要可配置，建议从 KairosController 暴露一个 getter，而不是各处拼字符串。

### 📁 Files Modified

- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/persistence/usage-statistics.ts`
- `packages/agent-core/src/persistence/index.ts`
- `packages/agent-core/src/persistence/test/usage-statistics.test.ts`（新增）
- `packages/agent-core/src/kairos/storage/short-memory-store.ts`
- `packages/agent-core/src/kairos/storage/test/short-memory-store.test.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `packages/desktop/src/renderer/fixtures/usageStatisticsFixture.ts`
- `docs/design-docs/frontend/front-usage-statistics.md`
