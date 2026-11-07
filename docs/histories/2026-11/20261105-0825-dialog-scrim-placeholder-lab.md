## [2026-11-05 08:25] | Task: 弹窗遮罩、输入框占位文字、Lab 占位页

### 🤖 Execution Context

- **Agent ID**: `main`
- **Base Model**: `Claude Opus 5.5`
- **Runtime**: `Claude Code`（主仓库目录，分支 `fix/bug-batch-1104`）

### 📥 User Query

> 文档整理时留下的三个待定项按建议处理：补上弹窗轻遮罩（按 demo 定为浅色 16%、深色 40%）、输入框占位文字先去掉「@ 引用文件」、删除没有入口的 Lab 占位页。

### 🛠 Changes Overview

**Scope:** `apps/desktop/src/renderer`、`docs/design-docs/frontend`

**Key Actions:**

- **弹窗遮罩**：`Dialog` 默认的 `scrim` 遮罩此前没有 token，渲染为透明，确认框等 7 个弹窗背后不变暗。新增 `--act-color-scrim`（浅色 `rgba(17,24,39,.16)`，深色 `rgba(0,0,0,.4)`）和 Tailwind `--color-scrim`；`overlay` 保持为重一档的遮罩。
- **占位文字**：Agent 新建页改为「描述你要做的事，/ 调用命令」，@ 引用文件（Composer PB）上线后再加回。
- **Lab 占位页**：侧栏没有任何入口能切到 `"lab"`，删除 `SidebarView` 的 `"lab"`、`WorkbenchLayout` 的占位分支与标题映射，以及只被它使用的 `PlaceholderView.tsx`。
- **文档**：`front-视觉token规范.md` 补 `scrim` / `overlay` 两行，`front-组件与交互模式规范.md` 写明 `backdrop` 两档的用法，`front-聊天输入框规范.md` 与文件引用设计文档同步占位文字。

### 🧠 Design Intent (Why)

界面上只描述当前能用的能力；默认遮罩应当有可见效果，普通弹窗用轻一档，需要专注的弹窗用 `overlay`。走不到的视图分支会让读代码的人误以为功能有入口，等 Lab 真正设计时再整体加回。

### 📁 Files Modified

- `apps/desktop/src/renderer/styles/tokens.css`、`styles/tailwind.css`
- `apps/desktop/src/renderer/components/composer/ComposerInput.tsx`、`test/composer.test.tsx`
- `apps/desktop/src/renderer/components/Sidebar.tsx`、`WorkbenchLayout.tsx`、`PlaceholderView.tsx`（删除）
- `docs/design-docs/frontend/front-视觉token规范.md`、`front-组件与交互模式规范.md`、`front-聊天输入框规范.md`、`front-composer-file-mentions-and-response-annotations.md`
