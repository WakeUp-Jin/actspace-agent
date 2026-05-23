## [2026-05-23 13:10] | Task: top-level three-column window

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 用户对比 Codex 窗口后指出：actspace 当前像是先有上下两栏，再在下方进入三栏；希望调整成 Codex 那种从窗口顶层开始的完整三栏布局，并统一浅色滚动条。

### 🛠 Changes Overview

**Scope:** `packages/desktop`, `docs/design-docs/frontend-ui`

**Key Actions:**

- **[Window Chrome]**: 将桌面窗口切到隐藏系统标题栏，并配置 macOS 窗口按钮位置，让 renderer 内容可以从窗口顶部开始。
- **[Top-Level Layout]**: 让 `SplitView` 的左、中、右区域在视觉上直接占据顶层窗口，主消息区和右侧面板的顶部栏使用同一高度和轻量分割线。
- **[Electron Safe Area]**: renderer 检测 Electron bridge 后添加 `is-electron` class，为左侧栏预留 macOS 窗口按钮安全距离；左侧 rail 态下再给中间标题留出保护偏移。
- **[Scrollbars]**: 增加全局浅色细滚动条，覆盖消息区、会话列表和右侧横向 tabs 等滚动区域。
- **[Docs]**: 更新工作台布局规范，明确桌面端不再在三栏外套全局系统标题栏。

### 🧠 Design Intent (Why)

Codex 的窗口层级不是在应用内容上方再放一条系统标题栏，而是让应用自己的左、中、右区域成为顶层 chrome。actspace 原来虽然功能上已经能开三栏，但默认标题栏和应用内 topbar 叠加后，会被感知成“先上下分区、再三栏”。

这次改动把窗口 chrome 和工作台 layout 合并到同一个视觉层级：系统标题栏隐藏，拖拽区域交给 sidebar/topbar/right-tabs，交互按钮显式标成 no-drag。这样保留桌面窗口行为，同时让工作台结构更接近 Codex 的整屏三栏。

### 📁 Files Modified

- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/renderer/main.tsx`
- `packages/desktop/src/renderer/styles.css`
- `docs/design-docs/frontend-ui/工作台布局与面板交互规范.md`
