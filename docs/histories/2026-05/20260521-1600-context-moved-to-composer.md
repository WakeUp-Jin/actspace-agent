## [2026-05-21 16:00] | Task: 将 Context 从右侧面板迁回聊天输入框

### 🤖 Execution Context

- **Agent ID**: `local`
- **Base Model**: `gpt-5.5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 右边视图不需要 Context 组件了，Context 应该作为聊天输入框里的弹窗出现。

### 🛠 Changes Overview

**Scope:** `docs/design-docs`, `docs/histories`

**Key Actions:**

- **收敛右侧面板职责**：移除右侧 `Context` 定位，仅保留文件预览与会话级 diff。
- **升级聊天输入框规范**：在 `聊天输入框规范.md` 中新增 Context 弹窗结构和统计内容。
- **清理目录索引**：删除过时的 `上下文组件规范.md` 引用并移除该文档。

### 🧠 Design Intent (Why)

Context 更符合输入区弹窗而不是常驻面板，放回 Composer 能让用户在输入上下文时更直接、更符合真实交互。

### 📁 Files Modified

- `docs/design-docs/index.md`
- `docs/design-docs/frontend/README.md`
- `docs/design-docs/frontend/front-聊天输入框规范.md`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
- `docs/design-docs/frontend/front-聊天输入框规范.md`
- `docs/histories/2026-05/20260521-1600-context-moved-to-composer.md`
