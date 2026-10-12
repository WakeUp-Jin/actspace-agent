# Context 面板前端重做（mock 先行）

> 状态：2026-10-11 T1–T9 实现与自动化验证完成（未提交）。浏览器 mock 截图与 Electron 实机待人工验收，见[执行摘要](../../exec-runs/20261011-context-panel-frontend/execution-summary.md)。执行模式：交互模式。
> 设计：[右侧面板与文件渲染规范 · Context 面板](../../design-docs/frontend/front-右侧面板与文件渲染规范.md#context-面板)；视觉：[context-panel-demo.html](../../design-docs/frontend/context-panel-demo.html)；数据契约：[Context 面板后端数据需求](../../design-docs/frontend/front-Context面板后端数据需求.md)。
> 执行记录：`docs/exec-runs/20261011-context-panel-frontend/`。

## 目标

把右侧 Context Tab 从「按分类列条目」换成五个区块：当前上下文、会话统计、上下文明细（对比上次请求，会话内容跳轨迹）、趋势、事件。

- 浏览器 mock 下能看到完整界面。
- Electron 下，后端未就绪前用现有数据显示前两块和当前明细，不比现在差。
- 后端实现 `describeContextPanel` 后，前端不改代码。

## 范围

### 包含

- shared 契约：`ContextPanelView` 类型，`sessions.describeContextPanel` 的 channel 和契约成员，main 注册（暂时返回 `null`），guard 和 mock。
- 过渡视图：返回 `null` 时，由 `describeContext` 和 projection 的 `activity` / `usage` 拼出。
- 面板五个区块的组件、纯函数和单测，替换 `ContextRenderView`。
- 轨迹「定位记录」：`revealInTrajectory` Context，TrajectoryView 接收目标并选中记录。
- Composer Context 弹层对齐：共用格式函数、补占比、接上压缩次数。
- 文档、history、执行记录。

### 不包含

- 后端实现 `describeContextPanel` 和 `readContextEntry`（Context 引擎 V2 负责，见数据需求文档）。
- 稳定条目 key、会话子类型、`trajectoryRef` 的真实数据（后端负责）。
- 编辑上下文、历史请求切换、导出、子 Agent Context。
- 轨迹视图除定位入口外的任何改动。

## 必读

- `AGENTS.md`
- `docs/design-docs/frontend/front-新功能开发清单.md`
- `docs/design-docs/frontend/front-preload-bridge与mock规范.md` §4（新增 IPC 的 7 步）
- `docs/design-docs/frontend/front-主题与配色规范.md`
- `docs/FRONTEND_VERIFICATION.md`
- 本计划顶部列出的三份设计材料

## 代码路径

`R/` = `apps/desktop/src/renderer/`

| 用途 | 路径 |
| --- | --- |
| 新类型 | `packages/shared/src/context-panel.ts`（新），从 `packages/shared/src/index.ts` 导出 |
| channel | `packages/shared/src/runtime-v2/fixed-renderer.ts` |
| 契约 | `packages/shared/src/desktop-bridge/contract.ts`（`sessions.describeContextPanel`） |
| main 注册 | `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`（紧挨 `describeContext`） |
| mock | `R/mock/handlers.ts`、`R/mock/context-panel-fixture.ts`（新） |
| 格式函数 | `R/context-format.ts`（新） |
| 面板 | `R/components/right-panel/context/`（新目录）：`ContextPanel.tsx`、`ContextOverview.tsx`、`ContextStats.tsx`、`ContextBrowser.tsx`、`ContextConversationList.tsx`、`ContextTrend.tsx`、`ContextEvents.tsx`、`context-panel-model.ts`、`use-context-panel.ts` |
| 接入 | `R/components/RightPanel.tsx`（替换 `ContextRenderView`）；删除 `R/components/right-panel/ContextRenderView.tsx` 和 `R/test/context-render-view.test.tsx` |
| 轨迹定位 | `R/trajectory/reveal.ts`（新，纯函数）、`R/components/trajectory/TrajectoryNavigation.tsx`（新，Context）、`R/components/TrajectoryView.tsx`、`R/components/WorkbenchLayout.tsx` |
| 弹层 | `R/components/ContextPopup.tsx` |
| 原生按钮基线 | `scripts/native-button-baseline.json` |

## 任务

按顺序执行。T2、T3 可以和 T1 并行，T4 以后依赖前面的结果。

### T1 契约与 IPC 地基

- 新建 `context-panel.ts`：
  - 照抄数据需求 §2 的类型，加 `DescribeContextPanelInput = { sessionId: string }`。
  - `BucketKey` 复用 registry 的 key 类型。如果 shared 里没有现成类型，就在本文件按字面量定义，并加注释指向 `context-buckets.ts`。
- 加 channel `describeContextPanel: "runtime-v2:fixed-renderer:describe-context-panel"` 和契约成员 `invoke<DescribeContextPanelInput, ContextPanelView | null>`。
- main 注册：handler 直接返回 `null`，注释写「由 Context 引擎 V2 实现，形状见 front-Context面板后端数据需求.md」。`describeContext` 有 guard 就照着加。
- mock 默认实现返回 `mockContextPanelView(sessionId)`。fixture 在 T4 写，这一步先返回一个最小合法对象。
- 验证：
  - `pnpm --filter @actspace/desktop typecheck` 通过。
  - `pnpm check:ipc-channels` 通过。
  - 如果改了 guard，`M/test/ipc-guards.test.ts` 补一合法一非法两条用例并通过。

### T2 格式函数

`R/context-format.ts` 提供：

- `formatTokenCount(n)`：小于 1000 原样输出；千级输出 `12.3K`，去掉末尾 `.0`；百万级输出 `1.8M`。
- `formatApproxTokens(n)`：在 `formatTokenCount` 前面加 `≈`。
- `formatSignedTokens(n)`：带 `+` 或 `−`（U+2212），0 返回空串。
- `formatShare(part, whole)`：比例在 0 和 1% 之间时输出 `<1%`，`whole` 为 0 时输出 `—`。

验证：`R/test/context-format.test.ts` 覆盖每个函数的边界值（0、999、1000、12_340、1_000_000、负数、`whole=0`），通过。

### T3 轨迹定位纯函数

在 `R/trajectory/reveal.ts` 写 `type TrajectoryRevealTarget` 和 `findRevealRecord(records, target)`，映射表按设计文档「跳到轨迹」一节。

验证：`R/test/trajectory-reveal.test.ts` 覆盖五种目标；还要覆盖 callId 同时出现在 tool 和其他记录上时只命中 tool；找不到时返回 `null`。

### T4 面板数据层

- `context-panel-model.ts`：
  - `buildInterimPanelView({ sessionId, contextState, activity, usage, modelLabel })` 返回 `{ view, source: "interim" }`。
    - `previous` 为 `null`，`trend` 和 `events` 为空数组，会话条目不带 `kind` 和 `trajectoryRef`。
    - `model.contextWindow` 取 `contextState.maxTokens`，非正数时记为 `null`。`autoCompactAtTokens` 为 `null`。
  - `buildCategories(view, { compare })`：
    - 按 registry 顺序返回每类的条目、总量、上次总量、项数增减、token 增减、已移除条目（`previous` 里有、`current` 里没有的 key）。
    - 每个条目带 `isNew` 和 `tokenDelta`。
  - `conversationRows(entries, kinds)`：按类型过滤，最新在前（输入顺序的倒序）。
  - `cacheHitRate(usage)` 和 `cumulativeTokens(usage)`：口径按设计文档，无数据时返回 `null`。
  - `trendLayout(points)`：每根柱的高度比例、分段比例，以及压缩分隔的位置。
- `use-context-panel.ts`：
  - 先调 `describeContextPanel`，返回 `null` 时再调 `describeContext` 并拼过渡视图。
  - projection 的 `throughJournalSeq` 变化时重拉，迟到的旧结果丢弃。
  - 失败时保留旧数据，返回 `error` 和 `retry`。
- `R/mock/context-panel-fixture.ts`：
  - 按 demo 构造完整数据：6 类条目、上次请求 manifest（含 1 个已移除工具）、26 个趋势点（含一次压缩）、6 个事件、费用。
  - 会话条目里最新的几条用 mock 会话真实的 messageId / callId（从 mock-db 的会话读），浏览器里跳转能命中。读不到时退回构造值。
- 验证：`R/test/context-panel-model.test.ts` 覆盖以下情况，并通过：
  - 过渡视图
  - 新增 / 移除 / 同 key 增减
  - 不对比时没有增减
  - previous 为 null
  - 上限为 null
  - 缓存命中率无数据
  - 趋势压缩分隔

### T5 面板组件

- 按设计文档写五个区块组件和入口 `ContextPanel.tsx`。
  - 入口只做装配和空态 / 错误态，目标 200 行以内，任何文件不超过 500 行。
  - 对比开关用 `ui/Select`，图标按钮用 `IconButton` 加 Tooltip。
  - 分类行、条目行、会话行、chip 是列表行交互，用原生 `<button type="button">`，带 focus-visible 样式，并在基线里登记。
  - 颜色只用 `--act-context-*` 和主题语义类。
- `RightPanel.tsx` 改为渲染 `ContextPanel`，删除 `ContextRenderView.tsx` 和它的测试，更新原生按钮基线（删旧文件条目，加新文件条目）。
- 验证：`R/test/context-panel.test.tsx` 用 `setupBridge` / `overrideBridge` 覆盖以下情况，并通过：
  - mock 完整数据下五块都在
  - `describeContextPanel` 返回 null 时显示过渡视图和「趋势和事件需要后端数据」说明
  - 聚焦分类
  - 切到「不对比」后增减标记消失
  - 会话类型 chip 过滤，「在轨迹中打开最新工具调用」文字
  - 点会话行调用 `revealInTrajectory` 并带正确目标
  - 费用为 null 时隐藏费用格
  - 拉取失败显示重试

### T6 轨迹定位接线

- `TrajectoryNavigation.tsx` 提供 `revealInTrajectory(target)`、待处理目标和 `consume()`。
- `WorkbenchLayout` 提供它：切 `sessionMainView` 为 `trajectory` 并记入按会话的 Map。
- `TrajectoryView` 有待处理目标且 `runtime` 就绪时：用 `findRevealRecord` 找记录，找到就 `select`，找不到就显示可关闭的说明。处理完调用 `consume()`。
- 验证：在 `R/test/trajectory-render-view.test.tsx` 加两条，并通过：
  - 带目标渲染时，选中对应 callId 的记录并打开详情。
  - 找不到时显示说明。

### T7 Composer 弹层对齐

- `ContextPopup.tsx` 改用 `R/context-format.ts`，`~` 改为 `≈`。
- 分类行补 `formatShare`。
- `compressionCount` 改为读 projection 的 `activity.compactionCount`。
- 验证：相关现有测试（`grep -l ContextPopup R/test`）更新后通过。

### T8 文档与收尾

- 数据需求文档 §6：写明前端已加好契约成员、channel、main 注册（返回 null）和类型文件，后端只需替换 handler 实现。
- 文档 README 索引；若 FRONTEND_VERIFICATION 里有场景表需要更新，同步改。
- history、执行记录两份文档、记忆。

### T9 验证

在仓库根运行：

```bash
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop test
pnpm check:frontend-tokens
pnpm check:frontend-theme
pnpm check:renderer-bridge
pnpm check:ipc-channels
pnpm check:current-docs   # 已知 8 处 Context 引擎文档旧断链不属于本计划
```

- 浏览器 mock：浅色、深色、480px 窄窗下看面板五块、会话行跳轨迹、弹层。
- 如果截图工具被拦，在执行摘要里写明没做，转为人工验收项。
- Electron 实机属于人工验收，写进执行摘要。

## 风险

- **与 Context 引擎 V2 的后端改动冲突**：main 只加一个返回 null 的 handler，紧挨 `describeContext`。合并冲突时以后端实现为准，删掉本计划的 null handler。
- **过渡视图被误当成最终效果**：面板底部明确说明趋势和事件需要后端数据；执行摘要写清 Electron 下看到的是过渡视图。
- **轨迹定位找不到记录**：过渡数据没有 `trajectoryRef`，会话行不可点；mock 只保证部分条目命中，其余显示说明。
- **原生按钮基线增加**：列表行交互用原生按钮是有意的，在 history 里写明理由；旧文件的计数同时删除。

## 回退

- 所有改动都在新文件和少量接入点。回退时把 `RightPanel.tsx` 改回渲染 `ContextRenderView`（从 git 恢复），再撤掉契约成员即可。
- main 的 null handler 可以单独保留，对现有功能没有影响。

## 进度记录

- [x] T1 契约与 IPC 地基
- [x] T2 格式函数
- [x] T3 轨迹定位纯函数
- [x] T4 面板数据层
- [x] T5 面板组件
- [x] T6 轨迹定位接线
- [x] T7 Composer 弹层对齐
- [x] T8 文档与收尾
- [x] T9 验证（自动化部分；浏览器截图被拦，和 Electron 一起转人工验收）

## 决策记录

- 2026-10-11：不另写设计文档。前端设计直接写进右侧面板规范的「Context 面板」一节（它本来就是右侧面板的单一事实来源），配合 demo 和数据需求文档。
- 2026-10-11：前端先把 `describeContextPanel` 的契约成员和 main 注册加好，main 返回 null，由后端替换实现。这样 mock 能提供完整数据，Electron 走过渡视图，后端就绪后前端不改。
- 2026-10-11：去掉旧视图的导出 .md / .json：会话原文已改到轨迹里看，导出出来的东西不完整。需要时再加回。
