## [2026-06-11 00:25] | Task: Lab 入口改为开发中占位页

### 🤖 Execution Context

- **Agent ID**: `Cursor Agent`
- **Base Model**: `Fable 5`
- **Runtime**: `Cursor IDE`

### 📥 User Query

> 当前的 Lab 功能还在开发考虑中，先把前端按钮点击封禁吧，或者出现弹窗表示功能正在开发中，你觉得呢？

### 🛠 Changes Overview

**Scope:** desktop renderer 视图路由

**Key Actions:**

- **[WorkbenchLayout]**: `view === "lab"` 不再渲染 `LabPage`，改为渲染既有的 `PlaceholderView`（FlaskConical 图标 + 「Lab 功能正在开发中」说明 + 规划要点 + Coming soon 标签）。
- **[保留原型]**: `LabPage.tsx` 与 `lab-page.test.tsx` 原样保留，组件级测试仍直接渲染 `LabPage`，功能定型后把 WorkbenchLayout 的渲染换回即可。

### 🧠 Design Intent (Why)

在「禁用按钮」「点击弹窗」「占位页」三个方案中选了占位页：禁用按钮会让用户误以为是 bug，弹窗打断操作流；占位页保持入口可发现（用户知道功能在规划中），并复用了仓库已有的 `PlaceholderView` 组件，改动只有路由一处，回滚成本最低。

### ✅ Verification

- `vitest run lab-page.test.tsx sidebar.test.tsx`：37 passed。
- `tsc --noEmit`（desktop 包）：无错误。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
