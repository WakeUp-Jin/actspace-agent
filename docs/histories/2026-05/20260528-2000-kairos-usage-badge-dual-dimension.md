## [2026-05-28 20:00] | Task: Kairos 用量胶囊升级双维度（累计 lifetime + 阶段 sinceReset，logo 可切换）

### 🤖 Execution Context

- **Agent ID**: 本地 Cursor 协作
- **Mode**: Implementation
- **Trigger**: 用户反馈"现在重置按钮会清除统计吗？这个显示的胶囊要不要再加一个 logo（切换 logo）放在胶囊旁边"

### 用户原话

> 什么意思，现在重置按钮会清除统计吗？这个显示的胶囊要不要在加一个 logo（切换 logo）放在胶囊旁边
> 1. 一个是全部的统计，重置也不会清空，因为是根据持久化的历史记录计算的。除非删除文件
> 2. 一个是阶段的统计，不点击重置按钮就一直积累，点击之后，就从 0 开始

把上一轮做完的"持久化累加器（单维度）"扩展成双维度：

- **lifetime（累计）**：全期账，从 Kairos 第一次有 `llm_usage` 起；`重置今日` 不清；只有手动删 `usage-accumulator.json` 才归零（此时下次启动从全部 jsonl 段重建）。
- **sinceReset（本阶段）**：阶段账，与 `todayTickCount` 同生命周期；`重置今日` 清零；文件丢失时也归零（reset 边界只能由 accumulator 文件维护）。

胶囊左侧 logo 改成"模式切换按钮"——`sinceReset` 显示 `Coins`、`lifetime` 显示 `Infinity`，点击切换。选择持久化到 `localStorage["kairos.usageBadgeMode"]`，默认 `sinceReset`。

### 变更总览

#### shared 包

- `packages/shared/src/kairos-contracts.ts`：`KairosRuntimeState.usageToday` 拆成 `usageLifetime` + `usageSinceReset`，注释中明确双维度语义、清零边界。
- `packages/shared/src/kairos-aggregator.ts`：注释更新，指明聚合函数现在用于驱动**两份**维度的累加。

#### agent-core 包

- `packages/agent-core/src/kairos/storage/usage-accumulator.ts`：
  - 引入内部 `UsageDimensionState`，封装单条维度的 summary + currency 状态机；accumulator 持有 `lifetime` 和 `sinceReset` 两份实例。
  - 文件 schema 升级到 v2：`{ schemaVersion: 2, lifetime, sinceReset, lastUpdatedAt }`。
  - 兼容 v1：自动迁移，把旧 `summary` 同时拷贝到 lifetime / sinceReset 作为升级锚点。
  - `accumulate()` 同步更新两份维度。
  - **`reset()` 改名 `resetSinceReset()`**——**只清阶段维度**，写盘但不删文件（lifetime 段保留）。
  - `load(rebuildFromAllJsonl)`：文件存在直接 apply；文件缺失/损坏时从**全部** jsonl 段重建 lifetime，sinceReset 归零。
- `packages/agent-core/src/kairos/controller.ts`：
  - 启动时 fallback 改为扫描"所有日期段"（`store.listAllDates() + loadDailyAll`），不再只看当日；只在文件缺失/损坏时跑（冷路径）。
  - eventSink `llm_usage` 同步累加两份维度并推送新 state。
  - `resetToday()` 调 `accumulator.resetSinceReset()` 而非 unlink；同时 runtimeState 把两份维度都刷新。
  - 删掉不再需要的 `utcDateKey()` helper（之前用于"当日"重建，新方案用全扫所以不需要）。

#### desktop 包

- `packages/desktop/src/renderer/state/kairosSelectors.ts`：
  - 引入 `KairosUsageBadgeMode = "lifetime" | "sinceReset"`。
  - `buildKairosUsageBadge` 签名从 `(KairosUsageSummary | null)` 改成 `({ lifetime, sinceReset } | null, mode)`，返回模型多出 `mode` / `oppositeMode` / `modeLabel` / `oppositeModeHint`。
  - tooltip 内含当前 mode 的明细 + 对面 mode 的简要 token+成本（用户瞥一眼就能对比）。
- `packages/desktop/src/renderer/pages/KairosPage.tsx`：
  - 新增 `useKairosUsageMode()` hook：localStorage 读写 + memo 化。
  - `KairosUsageBadge` 增加左侧 `<button>`（`data-testid="kairos-usage-toggle"`），点击切换 mode；右侧加 mode chip（`本阶段` / `累计`）。
  - 图标按 mode 切换：`Coins` ↔ `Infinity`。
  - 胶囊样式更新：`pl-[6px] pr-[11px]`，给按钮腾出 22px 圆角点击区域；保持视觉简洁。

#### 测试

- `packages/agent-core/src/kairos/storage/test/usage-accumulator.test.ts`：6 个用例覆盖
  - 双维度同步累加；
  - 混合币种两份维度都 MIXED；
  - `resetSinceReset` 只清阶段、保留 lifetime + 文件；
  - 写盘后重新加载能恢复两份维度；
  - v1 → v2 自动迁移（旧 summary 拷贝到两份）；
  - 文件缺失/损坏从 events 重建 lifetime、sinceReset 归零。
- `packages/agent-core/src/kairos/test/controller.test.ts`：替换原 `usageToday` 三个用例为四个新用例
  - 累加两份维度并通过 getState 暴露；
  - resetToday 只清 sinceReset、保留 lifetime + accumulator 文件 schemaVersion=2；
  - v1 accumulator 文件自动迁移到双维度；
  - accumulator 文件缺失时从全部 jsonl 段重建 lifetime。
- `packages/desktop/src/renderer/test/kairos-page.test.tsx`：
  - fixture 全部把 `usageToday` 换成 `usageLifetime` + `usageSinceReset`；
  - 重写"渲染胶囊"用例为"默认 sinceReset 模式且 tooltip 同时显示对面 mode 的总数"；
  - **新增**"点击 toggle 切换 lifetime ↔ sinceReset 并持久化到 localStorage"用例；
  - 重写"实时刷新"用例，让 controller 推一份 lifetime + sinceReset。
- `packages/desktop/src/renderer/test/right-panel-kairos.test.tsx`、`packages/desktop/src/main/test/kairos-ipc-internals.test.ts`：fixture 补 `usageLifetime` + `usageSinceReset`。

#### 文档

- `docs/design-docs/agent-kairos-autonomous-mode.md`：双维度说明 + v1→v2 迁移路径。
- `docs/design-docs/front-Kairos监控页规范.md`：用量胶囊章节重写，含切换按钮、双语义清零边界、tooltip 双 mode 对比、localStorage 持久化默认值。

### 验证

- `pnpm -r exec tsc --noEmit`：clean。
- `pnpm -r test --run`：shared + agent-core 404 通过 + desktop 107 通过，共 511 项绿。

### 设计意图

1. **不清的"全期账"是用户对账单的信任锚点**：之前 reset 会一起清掉胶囊数字，与"我重置今日 = 重新开始本轮 tick 计数 + 时长统计"的预期一致，但和"我想看长期成本走势"的诉求冲突。把账分两份后两个心智都能满足。
2. **持久化历史即真相**：用户的语言是"根据持久化的历史记录计算的，除非删除文件"——这要求 lifetime 不依赖任何 ephemeral 状态。所以文件丢失时 fallback 路径必须**全扫 jsonl 段**重建，不能只看当日；这是冷路径，可接受秒级耗时。
3. **sinceReset 在文件丢失时归零是有意的妥协**：reset 边界只能由 accumulator 文件本身维护——原始 jsonl 上没有"用户点过 reset"的事件标记，无法推断。这一边宁可保守归零，也不要让 lifetime 被误污染。文档明确告知这一边界。
4. **图标切换 + localStorage 记忆**：模式 chip 是辅助提示，主信号还是数字本身；切换交互轻量（一次点击）+ 跨开关页持久化，让用户找到"自己常用的视图"后不被反复打断。
5. **默认 sinceReset**：用户日常关注的是"本阶段花了多少"，更贴近 todayTickCount 的心智；累计是辅助参考，需要主动切换才会看到。

### 不命中学习沉淀

上一篇 `docs/learnings/2026-05/runtime-counters-need-persistent-accumulator.md` 已经把"持久化累加器"模式沉淀过；本轮只是在它之上做"双维度分裂 + UI mode 切换"，复用度高、可迁移性弱（强耦合于"清零按钮"产品决策），不单独再写学习文档。
