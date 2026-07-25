## [2026-05-23 13:48] | Task: Add global visual language

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 用户希望在修改前端全局样式前，先沉淀一份全局视觉语言规范；方向为中性黑文本、灰白界面基底、蓝色作为关键动作和品牌记忆色。

### 🛠 Changes Overview

**Scope:** `docs`

**Key Actions:**

- **Added visual language spec**: 新增 `全局视觉语言规范.md`，定义字体、颜色、间距、圆角、阴影和动效 token。
- **Updated frontend navigation**: 在前端设计目录和 `docs/FRONTEND.md` 中加入全局视觉语言入口。
- **Captured design decision**: 明确“黑色负责阅读，灰白负责承载，蓝色负责行动和品牌记忆”的设计基线。

### 🧠 Design Intent (Why)

全局样式调整会影响整个桌面端应用的品牌感和阅读体验。先把视觉规则版本化到仓库，可以避免后续组件各自散写颜色、字号和圆角，也能让 Agent 在执行前端任务时先对齐统一设计语言。

### 📁 Files Modified

- `docs/design-docs/frontend/front-全局视觉语言规范.md`
- `docs/design-docs/frontend/README.md`
- `docs/FRONTEND.md`
- `docs/histories/2026-05/20260523-1348-global-visual-language.md`
