## [2026-06-04 03:07] | Task: Wire Review Summary Refresh

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 继续执行 Review V1 Git Review 计划，补齐 Composer Review summary 的真实刷新状态。

### 🛠 Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **[Renderer state]**: 在 `App.tsx` 维护轻量 `ComposerReviewSummary`，由 `window.actspace.getWorkspaceReview` 的结构化结果投影得到。
- **[Refresh triggers]**: 初次加载、workspace 变化、agent turn 完成、右侧 Review 面板触发变更后刷新 Composer Review 入口。
- **[Right panel refresh]**: 给 Review tab 增加 `refreshKey`，重复点击 Composer 的 Review 入口时会聚焦并刷新右侧 Review view。
- **[Tests]**: 更新 Composer 单测为 prop-driven summary，新增 App 集成测试覆盖初次加载和 turn 完成后的 Review summary 刷新，并补右侧 Review view 的 `refreshKey` 重新拉取测试。
- **[Learning]**: 沉淀 request id guard 模式，记录如何避免旧异步响应覆盖新的 UI 状态。

### 🧠 Design Intent (Why)

Composer 只需要显示 `Review +N -M` 这类轻量入口状态，不应该持有完整 `ReviewChangeSet` 或 diff body。完整 diff 仍由右侧 `ReviewRenderView` 按需加载，App 层只负责刷新和投影 summary，避免把文件级 diff 状态抬到全局 UI。

刷新函数带 request id guard，避免用户快速切换 workspace 或重复触发刷新时，旧请求晚返回覆盖新 workspace 的 summary。

### 📁 Files Modified

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/RightPanel.tsx`
- `packages/desktop/src/renderer/components/right-panel/RightPanelContext.tsx`
- `packages/desktop/src/renderer/components/right-panel/ReviewRenderView.tsx`
- `packages/desktop/src/renderer/test/composer.test.tsx`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `packages/desktop/src/renderer/test/right-panel-review.test.tsx`
- `docs/exec-plans/active/20260604-review-v1-git-review.md`
- `docs/learnings/2026-06/request-id-guard-for-ui-refresh.md`
