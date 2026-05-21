## [2026-05-21 15:40] | Task: 重组 frontend-ui 前端设计目录

### 🤖 Execution Context

- **Agent ID**: `local`
- **Base Model**: `gpt-5.5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 将 `frontend-ui` 目录整理成先出大纲、再逐步细化组件的结构，并把当前认可的总览图放入目录中引用。

### 🛠 Changes Overview

**Scope:** `docs/design-docs`, `docs/histories`, `docs/design-docs/frontend-ui/image`

**Key Actions:**

- **新增组件级规范文档**：补齐左侧会话栏、中间消息区、聊天输入框等大纲文档。
- **重写目录首页**：`frontend-ui/index.md` 改为大纲入口，并引用当前基线图。
- **落地设计图资源**：将认可的总览图复制到 `frontend-ui/image/overview-two-column.png`。

### 🧠 Design Intent (Why)

先把设计拆成可独立迭代的组件级文档，再逐个打磨，避免把所有交互混在一份长文档里失焦。

### 📁 Files Modified

- `docs/design-docs/index.md`
- `docs/design-docs/frontend-ui/index.md`
- `docs/design-docs/frontend-ui/前端设计文档.md`
- `docs/design-docs/frontend-ui/左侧会话栏规范.md`
- `docs/design-docs/frontend-ui/中间消息区规范.md`
- `docs/design-docs/frontend-ui/聊天输入框规范.md`
- `docs/design-docs/frontend-ui/image/overview-two-column.png`
- `docs/histories/2026-05/20260521-1540-frontend-ui-outline-reorg.md`
