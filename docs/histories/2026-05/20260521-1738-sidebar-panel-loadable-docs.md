## [2026-05-21 17:38] | Task: 整理适合新会话加载的左侧与右侧文档

### 🤖 Execution Context

- **Agent ID**: `local`
- **Base Model**: `gpt-5.5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 准备开多个窗口并行，希望左侧会话栏和右侧面板两份文档可以作为新会话起始加载的输入。

### 🛠 Changes Overview

**Scope:** `docs/design-docs`, `docs/histories`

**Key Actions:**

- **补强左侧文档**：明确左侧首版只做轻量会话切换，不做复杂管理。
- **补强右侧文档**：明确右侧首版重点是文件预览与会话级 diff，文件预览优先 `md`、`html`、`图片`。

### 🧠 Design Intent (Why)

让并行新会话在启动时就拿到稳定边界，避免每个窗口对左侧和右侧的设计目标产生不同理解。

### 📁 Files Modified

- `docs/design-docs/frontend/front-左侧会话栏规范.md`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
- `docs/histories/2026-05/20260521-1738-sidebar-panel-loadable-docs.md`
