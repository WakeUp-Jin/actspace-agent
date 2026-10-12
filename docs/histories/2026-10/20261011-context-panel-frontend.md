# [2026-10-11] | Task: Context 面板前端重做（mock 先行）

### 🤖 Execution Context

- **Agent ID**: `root`
- **Base Model**: `Claude Opus 5.5`
- **Runtime**: `Claude Code CLI`

### 📥 User Query

> 可以开始实现，先梳理一个设计文档看看有没有必要，再生成一个执行计划，然后就可以开始执行了。

### 🛠 Changes Overview

**Scope:** `packages/shared` 契约；`apps/desktop` main 注册、renderer 右侧面板 / 轨迹 / Composer 弹层 / mock；前端与 Context 引擎相关文档。

**Key Actions:**

- **契约**：新增 `ContextPanelView` 类型与 `sessions.describeContextPanel`（channel、契约成员、main 注册）。main 暂时返回 `null`，后端只需替换 handler。
- **面板**：右侧 Context Tab 换成五个区块：当前上下文、会话统计、上下文明细、趋势、事件。
  - 上下文明细默认对比上次请求，会话内容只列清单，点一行跳到轨迹。
  - 收到 `null` 时用 `describeContext` 和 projection 拼过渡视图，趋势和事件显示「需要后端数据」。
- **轨迹定位**：新增 `TrajectoryNavigationProvider` / `revealInTrajectory`。轨迹按 messageId、callId 或「最新某类型」选中记录，找不到时显示可关闭的说明。
- **Composer 弹层**：和面板共用格式函数（≈、千位、占比），分类行补占比，压缩次数读 projection。
- **删除**：`ContextRenderView.tsx` 及其测试，旧视图的导出 .md / .json 一并去掉。

### 🧠 Design Intent (Why)

后端（Context 引擎 V2）还在重构，前端先把契约成员和 main 注册占好位，main 返回 `null`。浏览器 mock 下显示完整界面，Electron 下显示过渡视图，后端只换 handler 实现，前端不用再改。

会话原文已经能在轨迹里看，面板不再重复展示，只回答「哪些条目占了多少」。导出功能导出的内容会不完整，所以先去掉。

原生按钮基线增加了 7 个（面板 4 个文件）。分类行、条目行、会话行、图例项和 chip 都是列表行交互，`ui/Button` 的尺寸和内边距不合适；这些按钮统一使用 focus-visible 轮廓样式。

### 📁 Files Modified

- `packages/shared/src/context-panel.ts`（新）、`packages/shared/src/index.ts`、`packages/shared/src/runtime-v2/fixed-renderer.ts`、`packages/shared/src/desktop-bridge/contract.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
- `apps/desktop/src/renderer/context-format.ts`（新）
- `apps/desktop/src/renderer/components/right-panel/context/`（新目录：`ContextPanel`、`ContextOverview`、`ContextStats`、`ContextBrowser`、`ContextEntryList`、`ContextConversationList`、`ContextTrend`、`ContextEvents`、`ContextPanelParts`、`context-panel-model.ts`、`use-context-panel.ts`）
- `apps/desktop/src/renderer/components/RightPanel.tsx`、`WorkbenchLayout.tsx`、`TrajectoryView.tsx`、`ContextPopup.tsx`
- `apps/desktop/src/renderer/components/trajectory/TrajectoryNavigation.tsx`（新）、`apps/desktop/src/renderer/trajectory/reveal.ts`（新）、`trajectory/index.ts`
- `apps/desktop/src/renderer/mock/context-panel-fixture.ts`（新）、`mock/handlers.ts`
- 删除：`apps/desktop/src/renderer/components/right-panel/ContextRenderView.tsx`、`apps/desktop/src/renderer/test/context-render-view.test.tsx`
- 测试：`context-format.test.ts`、`trajectory-reveal.test.ts`、`context-panel-model.test.ts`、`context-panel.test.tsx`（均新），`trajectory-render-view.test.tsx`、`context-popup.test.tsx`、`composer.test.tsx`、`workbench-responsive.test.tsx`、`right-panel-workspace.test.tsx`、`fixtures/chinese-ui-preview.tsx`
- `scripts/native-button-baseline.json`
- 文档：`front-右侧面板与文件渲染规范.md`、`front-Context面板后端数据需求.md`、`model-context/agent-context-model-facts-and-composer.md`、上下文管理引擎 V2 设计 `01`、`04`、V2 执行计划 `README.md` 与 `test-acceptance-plan.md`（旧路径改名）、`docs/FRONTEND_VERIFICATION.md`、`docs/exec-plans/README.md`、`docs/exec-plans/completed/20261011-context-panel-frontend.md`、`docs/exec-runs/20261011-context-panel-frontend/`

### ✅ Verification

- desktop `tsconfig.json` 和 `tsconfig.electron.json` 的 `tsc --noEmit` 通过。
- `check-frontend-design-tokens`、`check-frontend-theme-colors`、`check-renderer-bridge-access`、`check-ipc-channels` 通过。
- desktop 全量 vitest：1723 通过，7 条应用级集成测试在并行负载下超时，单独运行均通过。
- 浏览器 mock 截图（dev server 被自动模式拦截）和 Electron 实机没有做，转为人工验收，见执行摘要。
