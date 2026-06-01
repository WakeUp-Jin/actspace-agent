## [2026-05-21 15:00] | Task: 整理前端设计文档与右侧面板规范

### 🤖 Execution Context

- **Agent ID**: `local`
- **Base Model**: `gpt-5.5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 整理桌面端前端设计文档，把已确定的右侧面板与文件渲染规范写入 `docs/design-docs/front-*`，`Context` 组件先保留待细化。

### 🛠 Changes Overview

**Scope:** `docs/design-docs`, `docs/histories`

**Key Actions:**

- **新增前端设计目录说明**：补充 `front-index.md`，说明图片与设计文档的组织方式。
- **拆分右侧面板规范**：新增 `右侧面板与文件渲染规范.md`，明确横向 Tab、文件渲染、会话级 diff、Task 展示边界。
- **收敛主设计文档**：将 `前端设计文档.md` 中的右侧面板细节抽离，仅保留总纲与 `Context` 待细化项。

### 🧠 Design Intent (Why)

把已经确定的对象渲染与右侧工作区规则先落盘，避免后续讨论 `Context` 时混入未定内容，同时让设计文档结构更清晰、可继续迭代。

### 📁 Files Modified

- `docs/design-docs/index.md`
- `docs/design-docs/front-index.md`
- `docs/design-docs/front-前端设计文档.md`
- `docs/design-docs/front-右侧面板与文件渲染规范.md`
- `docs/histories/2026-05/20260521-1500-frontend-design-docs-sidebar.md`
