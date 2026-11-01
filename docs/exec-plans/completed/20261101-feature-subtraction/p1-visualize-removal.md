# P1 删除「转成可视化 HTML」

## 目标

回复下方不再有「可视化」按钮，右侧不再有「Reply」视图，main 不再有生成可视化 HTML 的逻辑和接口。

## 范围

- 包含：按钮、菜单项、Reply 视图、生成逻辑、IPC 与类型、mock、测试、文档。
- 不包含：`registry.completeText`（通用能力，保留）；`HtmlRenderView.tsx`（P3 删）；磁盘上已有的 `sessions-v2/<sessionId>/visualizations.json`（不读也不删）。

## 必读

- `AGENTS.md`
- [01 功能减法设计](../../../design-docs/架构优化/01-功能减法设计.md) 第 7 节
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`「Reply 视图」「消息可视化转换」两节

## 步骤

行号以 `b590e02f` 为准，动手前用 `grep -n` 复核。

### 1. 删除整文件

- `apps/desktop/src/main/runtime-v2/fixed-renderer-visualization.ts`（含内联 `SYSTEM_PROMPT`）
- `apps/desktop/src/renderer/components/right-panel/ReplyHtmlRenderView.tsx`
- `apps/desktop/src/renderer/api/visualize.ts`

### 2. 契约与 main

- `packages/shared/src/desktop-bridge/contract.ts`：删 `visualize: {…}`（约 60–63 行）。
- `packages/shared/src/runtime-v2/fixed-renderer.ts`：删 `visualizeReply`、`listVisualizations`（约 88–89 行）。
- `packages/shared/src/ipc.ts`：删 `VisualizeReplyInput`、`VisualizeReplyResult`、`ListVisualizationsInput`、`SessionVisualizationItem`、`ListVisualizationsResult`（约 350–397 行）。
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`：删 visualization 的 import（约 78 行）和两个 handler（约 660–661 行）。

### 3. renderer

- `components/conversation/TurnActions.tsx`：删 `visualizeApi` import、`VisualizeState`、`deriveVisualizeTitle`、`visualizeState` / `visualizeError` / `visualizeHtmlRef`、`visualizeTabId`、`focusVisualizeTab`、`handleVisualize`、`visualizeLabel`、可视化按钮（约 190–207 行）、“重新生成可视化”菜单项（约 224–225 行）。`Wand2`、`Eye` 图标确认没有其他用处再删 import。
- `components/RightPanel.tsx`：删 `ReplyHtmlRenderView` import、`replyHtml` 分支（约 272–274 行）、launcher 的 `reply` 项（约 449–456 行）。
- `components/right-panel/RightPanelObjectMenu.tsx`：删“可视化回复”菜单项（约 71 行）。
- `components/right-panel/RightPanelContext.tsx`：删 `replyHtml` kind（约 42 行）。
- `mock/handlers.ts`：删 `visualize: {…}`（约 118 行）。
- `apps/desktop/test-fixtures/session-background-runs.tsx`：删 `visualizeReply`、`listVisualizations`（约 53–54 行）。
- `scripts/native-button-baseline.json`：删 `ReplyHtmlRenderView.tsx` 一行（约 53 行）。

### 4. 测试

- `renderer/test/conversation-view-tooltip.test.tsx`：删 visualize 按钮标签断言（约 304 行）和 “visualizes only the final reply…” 用例（约 438–490 行）。
- 以下 App 级测试的 bridge stub 删掉 `visualize.*` 键：`session-ipc-budget`、`chat-app-rejection`、`host-feedback`、`app-workbench-context`、`app-session-evict`、`app-response-annotations`、`app-approval-recovery`、`app-streaming-user-message`、`app-session-errors`、`app-remote-host-refresh`（均在 `apps/desktop/src/renderer/test/`）。

### 5. 文档

- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`：删「Reply 视图」「消息可视化转换」两节和概述里的 Reply 引用（约 38、69、83–89、436–455 行）。
- `docs/design-docs/frontend/front-工作台布局与面板交互规范.md`：删 Reply 入口卡片。
- 逐个检查以下文档里的“可视化 / Reply”是不是只拿来举例，是举例就换成别的例子：`front-主题与配色规范.md`、`front-icon-button-tooltip-guidelines.md`、`front-基础组件封装规范.md`、`docs/design-docs/core-storage-and-observability.md`、`docs/design-docs/model-context/agent-context-model-facts-and-composer.md`。
- `docs/releases/feature-release-notes.md` 追加移除说明。
- `docs/histories/` 记一条。

## 验证

- 命令：README「统一验证命令」。
- 残留检查：`grep -rn "visualize\|replyHtml\|ReplyHtml" apps/desktop/src packages/shared/src` 只允许剩下与本功能无关的命中。
- 手工检查：Electron 里一条回复下方只剩复制等原有动作；右侧面板「+」里没有 Reply；右侧对象菜单没有“可视化回复”。

## 风险

- App 级测试 stub 漏删会让类型检查失败。缓解：先跑 `typecheck`，按报错逐个清。

## 回滚

`git revert` 本子计划的提交。
