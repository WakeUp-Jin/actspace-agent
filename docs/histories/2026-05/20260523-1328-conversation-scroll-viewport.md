## [2026-05-23 13:28] | Task: 修正主聊天区滚动条布局

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 用户指出中间聊天区滚动条没有贴到最右侧，而是在内容区域内侧留出缝隙；要求采用最佳实践式结构修正，不做临时 CSS 补丁。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer UI, frontend layout docs

**Key Actions:**

- **[Viewport boundary]**: 让 `.message-scroll` 成为满宽滚动 viewport，滚动条自然贴近主工作区右边界。
- **[Content constraint]**: 用 `--conversation-inline-padding` 和 `--conversation-content-width` 控制消息栈与 Composer 的阅读宽度。
- **[Composer zone]**: 为 Composer 增加外层 `.composer-zone`，将输入框定位从滚动 viewport 语义中拆开。
- **[Docs sync]**: 更新工作台布局规范，明确主区滚动容器与内容限宽容器分层。

### 🧠 Design Intent (Why)

滚动条属于主工作区 viewport，而不是消息内容排版。把滚动容器放进带 padding 的父级会导致滚动条被挤进内容区；改为外层满宽滚动、内层内容限宽，可以在保留阅读宽度的同时，让滚动条位置符合桌面应用直觉，并减少左侧 rail、右侧面板和窗口缩放时的布局补丁。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/styles.css`
- `docs/design-docs/frontend/front-工作台布局与面板交互规范.md`
