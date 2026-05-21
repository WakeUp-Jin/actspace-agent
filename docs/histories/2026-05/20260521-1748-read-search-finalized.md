## [2026-05-21 17:48] | Task: 定稿 Read / Search 组件

### 🤖 Execution Context

- **Agent ID**: `local`
- **Base Model**: `gpt-5.5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 生成 Read / Search 组件图片，确认无图标、无卡片、与 Thinking 同级，整理到文档里。

### 🛠 Changes Overview

**Scope:** `docs/design-docs`, `docs/histories`, `docs/design-docs/frontend-ui/image`

**Key Actions:**

- **保存定稿图**：将 Read / Search 组件最终图保存为 `frontend-ui/image/read-search-final.png`。
- **更新消息区规范**：在 `中间消息区规范.md` 中补充 Read / Search 的结构、交互和视觉原则。
- **同步目录页和图片说明**：更新 `frontend-ui/index.md` 与 `image/README.md` 中的图引用。

### 🧠 Design Intent (Why)

Read / Search 必须保持最轻量的文本流感，作为工具调用日志而不是卡片型组件，这样才能和 Thinking、Edit diff 构成清晰的消息语法。

### 📁 Files Modified

- `docs/design-docs/frontend-ui/index.md`
- `docs/design-docs/frontend-ui/中间消息区规范.md`
- `docs/design-docs/frontend-ui/image/README.md`
- `docs/design-docs/frontend-ui/image/read-search-final.png`
- `docs/histories/2026-05/20260521-1748-read-search-finalized.md`
