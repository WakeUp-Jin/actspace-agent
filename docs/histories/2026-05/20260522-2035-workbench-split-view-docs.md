## [2026-05-22 20:35] | Task: document workbench SplitView foundation

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 自研工作台布局底座，并把受影响的设计文档和执行计划先落到仓库里；未来可能支持接近 IDE 的拖动交互。

### Changes Overview

**Scope:** `docs/design-docs`, `docs/exec-plans`, `docs/histories`

**Key Actions:**

- **[Layout spec]**: 新增工作台布局与面板交互规范，锁定自研 SplitView、左侧 rail、右侧可调对象区、中间主区保护和未来拖动边界。
- **[Design sync]**: 更新前端总设计、左侧会话栏、右侧对象面板和设计索引，让可调面板决策进入正式设计文档。
- **[Execution plan]**: 新增 active execution plan，写清 SplitView 底座分层、首版范围、风险、里程碑和前端分层验证方式。
- **[Renderer layout]**: 实现横向 `SplitView` 底座，接入 pointer/keyboard separator、左侧 rail、右侧 resize、本地尺寸恢复和中间区保护。
- **[UI verification]**: 用浏览器 mock 验证右栏打开、左栏折叠/键盘恢复、右栏宽屏 resize 和窄空间下的主区保护。
- **[Plan index]**: 更新 execution plan 索引，把 SplitView 计划加入 active 列表。

### Design Intent

当前聊天态布局把左右面板宽度固化在 grid 中，右侧对象面板打开后会挤压中间聊天区。先把工作台 SplitView 作为仓库内的布局底座决策写清楚，可以让后续实现围绕 resize、collapse、restore 和主区保护收敛，同时把未来 tab 拖动、区域换位和 docking 留给单独的工作台模型设计，而不是混进这一轮宽度修复。

### Files Modified

- `docs/design-docs/front-工作台布局与面板交互规范.md`
- `docs/design-docs/front-前端设计文档.md`
- `docs/design-docs/front-左侧会话栏规范.md`
- `docs/design-docs/front-右侧面板与文件渲染规范.md`
- `docs/design-docs/front-index.md`
- `docs/design-docs/index.md`
- `docs/exec-plans/active/actspace-workbench-split-view-foundation.md`
- `docs/exec-plans/README.md`
- `docs/histories/2026-05/20260522-2035-workbench-split-view-docs.md`
- `packages/desktop/src/renderer/components/SplitView.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/components/RightPanel.tsx`
- `packages/desktop/src/renderer/styles.css`
