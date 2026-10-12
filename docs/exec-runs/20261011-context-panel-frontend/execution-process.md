# Context 面板前端重做 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261011-context-panel-frontend.md`
- **执行模式**：交互
- **开始时间**：2026-10-11
- **结束时间**：2026-10-11

## 执行时间线

### 步骤 1：T1 契约与 IPC 地基

- **操作**：新建 `ContextPanelView` 等类型（照抄数据需求 §2），加 channel `runtime-v2:fixed-renderer:describe-context-panel`、契约成员 `sessions.describeContextPanel`，main 注册紧挨 `describeContext`，handler 返回 `null`。mock 默认实现返回 fixture。
- **影响文件**：`packages/shared/src/context-panel.ts`（新）、`packages/shared/src/index.ts`、`packages/shared/src/runtime-v2/fixed-renderer.ts`、`packages/shared/src/desktop-bridge/contract.ts`、`apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`、`R/mock/handlers.ts`。
- **决定**：输入只有 `sessionId`，main 直接返回 `null`，不加新 guard，沿用 `describeContext` 的会话 id 校验路径。
- **验证**：两个 tsconfig 的 typecheck 和 `check-ipc-channels` 通过。

### 步骤 2：T2 格式函数、T3 轨迹定位纯函数

- **操作**：`R/context-format.ts` 提供 `formatTokenCount` / `formatApproxTokens` / `formatSignedTokens` / `formatShare`；`R/trajectory/reveal.ts` 提供 `TrajectoryRevealTarget` 和 `findRevealRecord`，callId 优先命中 tool 记录。
- **影响文件**：上述两个新文件，`R/trajectory/index.ts` 导出，`R/test/context-format.test.ts`、`R/test/trajectory-reveal.test.ts`（新）。
- **验证**：两份单测通过。

### 步骤 3：T4 面板数据层

- **操作**：`context-panel-model.ts`（过渡视图、分类对比、会话行过滤、缓存命中率、累计 token、趋势布局）；`use-context-panel.ts`（先查 `describeContextPanel`，`null` 时拼过渡视图，按水位重拉、丢弃迟到结果、失败保留旧数据）；mock fixture 按 demo 造数据，最新几条会话条目读 mock 会话真实 id。
- **影响文件**：`R/components/right-panel/context/context-panel-model.ts`、`use-context-panel.ts`、`R/mock/context-panel-fixture.ts`、`R/test/context-panel-model.test.ts`（均新）。
- **验证**：model 单测通过。

### 步骤 4：T5 面板组件

- **操作**：五个区块拆成 `ContextOverview` / `ContextStats` / `ContextBrowser`（含 `ContextEntryList`、`ContextConversationList`）/ `ContextTrend` / `ContextEvents`，共用部件放 `ContextPanelParts.tsx`，入口 `ContextPanel.tsx` 只做装配、空态、错误态。`RightPanel` 改为渲染 `ContextPanel`（以 sessionId 为 key），删除 `ContextRenderView` 及其测试，原生按钮基线删旧加新。
- **影响文件**：`R/components/right-panel/context/*.tsx`（新）、`R/components/RightPanel.tsx`、`R/components/WorkbenchLayout.tsx`（去掉 `contextSnapshot` 传参）、`scripts/native-button-baseline.json`、`R/test/context-panel.test.tsx`（新）。
- **决定**：
  - 分类行、条目行、会话行、图例项、chip 用原生 `<button>`，统一 `ROW_FOCUS_CLASS` 焦点样式；这些是列表行交互，`ui/Button` 的尺寸和内边距不适合。
  - 去掉旧视图的导出 .md / .json（见计划决策记录）。
  - 帮助提示原想用小号「?」文字，会违反字号规则，改用 `CircleHelp` 图标。
- **验证**：`context-panel.test.tsx` 8 条通过。

### 步骤 5：T6 轨迹定位接线

- **操作**：`TrajectoryNavigation.tsx` 提供 `revealInTrajectory` / 待处理目标 / `consume`；`WorkbenchLayout` 用 `TrajectoryNavigationProvider` 包住主界面，切换时写入按会话的主视图 Map；`TrajectoryView` 在 runtime 就绪后查找记录，找到就清空筛选并选中，找不到显示可关闭的说明（有更早历史时提示加载）。
- **影响文件**：`R/components/trajectory/TrajectoryNavigation.tsx`（新）、`R/components/WorkbenchLayout.tsx`、`R/components/TrajectoryView.tsx`、`R/test/trajectory-render-view.test.tsx`。
- **验证**：轨迹测试 10 条通过（新增 2 条）。

### 步骤 6：T7 Composer 弹层对齐

- **操作**：`ContextPopup` 改用共享格式函数，`~` 改 `≈`，分类行补占比列，压缩次数读 projection 的 `activity.compactionCount`。
- **影响文件**：`R/components/ContextPopup.tsx`，以及断言文案随之更新的 `context-popup.test.tsx`、`composer.test.tsx`、`workbench-responsive.test.tsx`、`right-panel-workspace.test.tsx`、`fixtures/chinese-ui-preview.tsx`。
- **验证**：相关测试通过。

### 步骤 7：T8 文档

- **操作**：右侧面板规范改称「Context 面板」；数据需求 §6 写明前端已就绪、后端只替换 handler；把模型事实规范、V2 设计 01/04、V2 执行计划和测试验收计划里的 `ContextRenderView` 旧路径改成新面板。已完成计划里的历史引用保持原样。
- **影响文件**：见执行摘要。

### 步骤 8：T9 验证

- **验证**：
  - `tsc --noEmit`（`tsconfig.json`、`tsconfig.electron.json`）通过。
  - `check-frontend-design-tokens`、`check-frontend-theme-colors`、`check-renderer-bridge-access`、`check-ipc-channels` 通过。
  - desktop 全量 vitest：1723 通过，7 条失败。失败的都是应用级集成测试在并行负载下超时（app-message-queue、app-streaming-user-message ×3、main-bridge-install ×2、session-ipc-budget），单独运行全部通过（67 + 4）。
  - `check-current-docs`：见执行摘要。

## 遇到的问题

- **问题**：`CategoryEntry | RemovedEntry` 用 `entry.removed` 判断时 TypeScript 不收窄。
  - **应对**：改成 `entry.removed === true`。
- **问题**：「已移除」条目在工具分类里被「再显示」折叠，测试找不到。
  - **应对**：测试先点「再显示」。
- **问题**：mock 的 `previous.requestId` 没有对应的趋势点，「上次请求实际」那行不显示。
  - **应对**：fixture 末尾补一个与 `previous` 同 requestId 的趋势点。
- **问题**：自动模式拦截了 sed 原地改、vite dev server 和 Playwright。
  - **应对**：改用编辑工具；浏览器截图验收转为人工项。

## 跳过或推迟的事项

- 浏览器 mock 下浅色 / 深色 / 480px 窄窗的截图检查：dev server 被拦，转为人工验收。
- Electron 实机验收：属于人工验收；后端未实现前 Electron 显示过渡视图。
