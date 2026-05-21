## [2026-05-21 15:10] | Task: 细化 Context 组件规范

### 🤖 Execution Context

- **Agent ID**: `local`
- **Base Model**: `gpt-5.5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 细化右侧上下文入口打开的 Context 组件，先固定上下文组成和上下文统计两个子组件，并明确 token 消耗数与压缩次数等统计信息。

### 🛠 Changes Overview

**Scope:** `docs/design-docs`, `docs/histories`

**Key Actions:**

- **新增上下文组件规范**：创建 `上下文组件规范.md`，定义 Context 的入口、纵向子组件顺序和统计内容。
- **收敛主设计文档**：在 `前端设计文档.md` 中补充 Context 的组件结构与当前固定信息。
- **更新目录索引**：将 Context 规范加入 `docs/design-docs/index.md` 与 `frontend-ui/index.md`。

### 🧠 Design Intent (Why)

把 Context 从右侧面板中拆成独立规范，先锁定“上下文组成”和“上下文统计”两个固定模块，保证后续扩展时有清晰边界。

### 📁 Files Modified

- `docs/design-docs/index.md`
- `docs/design-docs/frontend-ui/index.md`
- `docs/design-docs/frontend-ui/前端设计文档.md`
- `docs/design-docs/frontend-ui/上下文组件规范.md`
- `docs/histories/2026-05/20260521-1510-context-component-spec.md`
