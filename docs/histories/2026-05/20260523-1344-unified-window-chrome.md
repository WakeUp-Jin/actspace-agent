## [2026-05-23 13:44] | Task: 统一顶部 chrome 控件基线

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 用户希望顶部像 Codex/Cursor 一样形成统一水平 chrome，左右 `PanelLeft` / `PanelRight` 不要因为分属不同布局而错位，并移除主视图顶部栏底部分割线。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer UI

**Key Actions:**

- **[Chrome baseline]**: 新增窗口 chrome 控件变量，统一左右 panel 按钮的顶部坐标和尺寸。
- **[Right panel control]**: 将右上角 `PanelRight` 从普通 topbar flex 对齐改为窗口 chrome 绝对定位。
- **[Topbar surface]**: 移除 topbar 底部分割线，让内容区与顶部自然衔接，弱化割裂感。

### 🧠 Design Intent (Why)

顶部区域在视觉上应是一条统一的窗口 chrome baseline，而不是左栏和主栏各自定位控件。统一变量后，左右 panel 控件在三栏布局中仍能保持同一水平感；去掉 topbar 分割线后，主内容更接近 Codex/Cursor 的轻量桌面工具界面。

### 📁 Files Modified

- `packages/desktop/src/renderer/styles.css`
