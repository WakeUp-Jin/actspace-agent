## [2026-05-21 18:18] | Task: 完善前端设置页设计文档

### 🤖 Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 用户希望将前端设计中的 `Settings` 明确定义为页面级切换，而不是聊天页右侧附属面板或弹窗；并要求把设置界面也加入前端设计文档。

### 🛠 Changes Overview

**Scope:** `docs/design-docs/frontend-ui`, `docs/histories`

**Key Actions:**

- **收紧左侧会话栏规则**: 明确聊天态左栏只包含 `New chat`、`Search`、`Session`、`Scheduled` 和 `Settings`，并补充设置态切换规则。
- **新增设置页规范**: 单独建立设置页文档，定义设置态的布局、导航和与聊天态的关系。
- **同步目录与图片索引**: 将设置页定稿图加入前端设计目录和图片说明。
- **补充总布局说明**: 在前端总文档里明确聊天态与设置态是两种主页面状态。

### 🧠 Design Intent (Why)

`Settings` 的交互模型如果不定义清楚，左侧导航和主工作区的边界会持续摇摆。把设置页提升为页面级状态切换，可以让聊天态保持干净，也让设置导航拥有稳定的信息架构，不再与会话列表混用。

### 📁 Files Modified

- `docs/design-docs/frontend-ui/左侧会话栏规范.md`
- `docs/design-docs/frontend-ui/设置页规范.md`
- `docs/design-docs/frontend-ui/index.md`
- `docs/design-docs/frontend-ui/前端设计文档.md`
- `docs/design-docs/frontend-ui/image/README.md`
- `docs/design-docs/frontend-ui/image/sidebar-chat-final.png`
- `docs/design-docs/frontend-ui/image/settings-page-final.png`
- `docs/histories/2026-05/20260521-1818-settings-page-docs.md`
