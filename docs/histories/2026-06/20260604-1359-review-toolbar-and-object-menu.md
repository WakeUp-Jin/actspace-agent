## [2026-06-04 13:59] | Task: Polish Review Toolbar And Object Menu Entry

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户希望右侧 Review 顶部中间区域更清晰、有样式和颜色；`Uncommitted` 前加文件夹图标；右侧 `+` 新建对象菜单增加 `Review`，点击后打开当前会话 / workspace 的 Review。

### Changes Overview

**Scope:** `packages/desktop`, `docs/design-docs`

**Key Actions:**

- **[Review toolbar]**: 将 Review 顶部 scope 控件调整为轻量无边框的 `Folder + N Uncommitted Changes + Chevron` 触发器，并把总增删统计拆成 success / danger 语义色。
- **[Scope menu]**: 点击 scope 触发器会打开轻量菜单；V1 真实支持 `Uncommitted`，`Unstaged` / `Staged` / `All Branch Changes` 先弱化展示为未来 scope。
- **[Object menu]**: 右侧 chrome `+` 菜单新增 `Review` 入口，复用 Composer 已有的 `openReviewTab` 逻辑。
- **[Tests]**: 补充 renderer 测试，覆盖 Review toolbar 的文件夹图标与彩色统计，以及从右侧 `+` 菜单打开 Review tab。
- **[Docs sync]**: 更新右侧面板规范，记录 `+` 菜单对象列表和 Review toolbar 视觉语义。

### Design Intent

Review 是工作台工具面板，不需要大 summary card，也不应该把 scope 做成视觉过重的 bordered pill。文件夹图标帮助表达当前展示的是一组工作区变更；增删数字使用既有 success / danger token，避免中性灰色把关键状态压平。

右侧 `+` 菜单是“往面板里加对象”的入口，把 Review 放进去能让用户在不依赖 Composer strip 的情况下直接打开 Git Review，同时保持同一个 Review tab 去重和刷新逻辑。

### Files Modified

- `packages/desktop/src/renderer/components/right-panel/ReviewRenderView.tsx`
- `packages/desktop/src/renderer/components/right-panel/RightPanelObjectMenu.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/test/right-panel-review.test.tsx`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
