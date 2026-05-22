## [2026-05-23 00:04] | Task: polish sidebar against spec

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 对照 `左侧会话栏规范.md` 调整当前左侧边栏，让它更接近文档里的聊天态定稿图，而不是参考全局总览图。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer UI

**Key Actions:**

- **[Sidebar structure]**: 将会话项从“圆点 + 标题/时间两行”改为“标题 + 时间同一行”的紧凑文本导航。
- **[Action entries]**: 将 `New chat` 和 `Search` 从边框按钮组调整为图标加文字的轻量入口。
- **[Visual polish]**: 降低选中态蓝色权重，补充分区细线和底部 `Settings` 固定位置。

### 🧠 Design Intent (Why)

左侧会话栏规范强调“轻量优先”“纯文本感”和“高密度文本导航”。当前实现偏按钮化和卡片化，会让侧栏比中间工作区更抢视觉层级。此次调整把侧栏收回到会话切换索引的角色，保留清晰选中态和 rail 态能力，同时避免引入新导航层级。

本次改动不触发单独学习文档：它是局部 UI 还原和样式收口，没有形成新的通用技术概念或架构模式。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/styles.css`
- `docs/histories/2026-05/20260523-0004-sidebar-spec-polish.md`
