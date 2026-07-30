## [2026-07-30 12:40] | Task: 对齐工作台三栏顶部 Chrome

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 参考 Cursor 调整 Actspace 顶部标题与三栏设计，解决当前标题悬空、操作归属不清和整体不够优雅的问题。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer 工作台 Chrome、右侧对象面板、响应式交互与前端设计文档

**Key Actions:**

- **Pane-aware Chrome**：`WindowChromeBar` 从按内容分配宽度的全局 flex 改为与 `SplitView` 左、中、右真实宽度同步的 grid。
- **信息归属收口**：会话标题改为中间栏左对齐，IDE / Environment 移入中间栏尾部；对象菜单与右栏开关只保留在右侧对象栏。
- **右栏身份补齐**：无对象 Tab 时显示 `Objects`，进入文件浏览态后显示 `Files`，避免顶部只剩悬空图标。
- **紧凑窗口命中区**：右侧覆盖层打开时隐藏中间标题与 Workspace 操作、关闭中间拖拽命中，并让 600px 以下的 Tab 避开 macOS 窗口控制区域。
- **视觉统一**：三栏顶部共享主题感知底部分隔线，继续只消费现有语义颜色 token。
- **回归保护**：新增 pane 宽度、紧凑列宽和右栏空标题测试，并通过本地 renderer 对桌面与 480px 状态进行交互验证。

### 🧠 Design Intent (Why)

顶部区域的“左 / 中 / 右”不能只是一组视觉命名，它必须跟真实面板几何保持同源。否则标题会相对整窗居中，Workspace 操作会漂到对象栏上方，右侧 Tab 又需要依赖 z-index 和 padding 躲避浮层按钮。让 Chrome 直接消费工作台面板宽度，可以在不推翻 Electron 拖拽机制的前提下，让标题、操作和对象身份稳定归属于各自 pane。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/WindowChromeBar.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/RightPanel.tsx`
- `packages/desktop/src/renderer/styles/electron.css`
- `packages/desktop/src/renderer/styles/tokens.css`
- `packages/desktop/src/renderer/test/sidebar.test.tsx`
- `packages/desktop/src/renderer/test/right-panel-workspace.test.tsx`
- `docs/design-docs/frontend/front-工作台布局与面板交互规范.md`
- `docs/design-docs/frontend/front-左侧会话栏规范.md`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
- `docs/design-docs/frontend/front-environment-and-git-actions.md`
- `docs/learnings/2026-07/frameless-window-chrome-must-follow-pane-geometry.md`

### ✅ Verification

- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/sidebar.test.tsx src/renderer/test/right-panel-workspace.test.tsx src/renderer/test/workbench-responsive.test.tsx`：3 个测试文件、44 个测试通过。
- `pnpm --filter @actspace/desktop test`：71 个测试文件、581 个测试全部通过。
- `pnpm --filter @actspace/desktop typecheck`：通过。
- `pnpm check:frontend-theme`：通过。
- `pnpm check:docs`：通过。
- `pnpm --filter @actspace/desktop build`：通过；仅保留既有 renderer chunk size warning。
- Codex 内置浏览器：1440px 下确认 Chrome 与 `260 / 790 / 390px` 三栏严格对齐；480px 下确认 `Objects` 标题避开左侧窗口入口，Context Tab 可正常点击。
