## [2026-05-21 17:05] | Task: 细化中间消息区消息语法

### 🤖 Execution Context

- **Agent ID**: `local`
- **Base Model**: `gpt-5.5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 继续细化中间消息区，把它从消息类型清单升级成更明确的消息语法和顺序规则。

### 🛠 Changes Overview

**Scope:** `docs/design-docs`, `docs/histories`, `docs/design-docs/public/front`

**Key Actions:**

- **升级消息区规范**：将 `中间消息区规范.md` 改写为“消息语法 + 类型规则 + 顺序原则”的结构。
- **补充图片目录说明**：新增 `public/front/README.md`，让当前图片的用途更明确。
- **同步目录结构说明**：更新 `front-index.md` 的目录描述。

### 🧠 Design Intent (Why)

消息区是主工作流，先把消息语法讲清楚，后面才能逐个设计单条消息组件而不混乱。

### 📁 Files Modified

- `docs/design-docs/frontend/front-中间消息区规范.md`
- `docs/design-docs/frontend/README.md`
- `docs/design-docs/frontend/README.md`
- `docs/histories/2026-05/20260521-1705-message-area-grammar.md`
