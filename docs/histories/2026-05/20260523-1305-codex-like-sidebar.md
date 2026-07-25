## [2026-05-23 13:05] | Task: 调整侧边栏为 Codex 风格

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 用户希望去掉侧边栏 logo 和厚重菜单感，参考 Codex/Claude 的轻量侧栏：分区标题灰色、右侧有操作按钮，会话列表不缩进、不做三级分组，底部只保留 Settings。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer UI, frontend design docs

**Key Actions:**

- **[Sidebar structure]**: 移除品牌 logo / wordmark，把折叠控制改成轻量窗口区按钮。
- **[Sidebar visual]**: 将 `New chat`、`Search`、`Chats`、`Scheduled`、`Settings` 改为低对比、紧凑的 Codex 风格行式导航。
- **[Session list]**: 会话列表保持两层关系，分区下直接顶格展示会话；当前会话右侧使用状态点占位。
- **[Docs sync]**: 更新左侧会话栏规范，明确不做 workspace/project 三级层级和左侧圆点缩进。

### 🧠 Design Intent (Why)

侧边栏是高频导航，不应该承担过重的品牌展示或卡片式视觉。改为灰色 section label、顶格文本行和轻量操作按钮后，信息密度更接近 Codex，同时保留 actspace 只有 `Chats / Scheduled` 两层关系的产品边界。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/styles.css`
- `docs/design-docs/frontend/front-左侧会话栏规范.md`
