## [2026-05-23 13:36] | Task: 调整顶栏 panel 图标与右侧贴边

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 用户希望左侧折叠入口使用更简约的 `panel-left` 图标，右上角入口使用 `panel-right`，并让右上角按钮参考 Cursor 顶部布局更贴近右边缘。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer UI

**Key Actions:**

- **[Panel icons]**: 左侧折叠入口统一换成 `PanelLeft`，右上角对象面板入口统一换成 `PanelRight`。
- **[Topbar edge]**: 为顶栏新增独立右侧 edge inset，让右上角按钮不再跟正文内容 padding 绑定。
- **[Responsive]**: 小宽度下只收敛标题左侧 padding，保持右上角按钮靠近窗口边缘。

### 🧠 Design Intent (Why)

顶栏属于窗口 chrome 层，应独立于正文内容宽度。使用 `PanelLeft` / `PanelRight` 能降低状态图标的视觉噪音，而右侧按钮靠近窗口边界后更接近 Cursor/Codex 这类桌面工具的顶栏语法。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/styles.css`
