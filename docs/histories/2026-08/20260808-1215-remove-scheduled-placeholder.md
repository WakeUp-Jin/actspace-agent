## [2026-08-08 12:15] | Task: 移除 Scheduled 占位分区

### 🤖 Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-5
- **Runtime**: Codex Desktop

### 📥 User Query

> 左侧栏当前没有定时任务功能，移除 Scheduled 及其空状态。

### 🛠 Changes Overview

**Scope:** `packages/desktop`、`docs`

**Key Actions:**

- **删除占位入口**：移除 Sidebar 的 Scheduled 标题、空状态和无行为的更多/新建按钮。
- **清理状态**：删除没有生产数据来源的 renderer `scheduled` 会话状态及相关测试。
- **同步事实来源**：左侧栏信息架构收敛为 `Pinned → Workspaces`；保留与此产品入口无关的内部工具调度状态。

### 🧠 Design Intent (Why)

不在高频导航中展示尚未存在的产品能力，避免无效入口和空状态占用空间，也避免用户误以为定时任务已经可用。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/test/sidebar.test.tsx`
- `docs/design-docs/frontend/front-左侧会话栏规范.md`
- `docs/design-docs/frontend/README.md`

### ✅ Validation

- Sidebar 聚焦 Vitest：38 项测试通过。
- `pnpm typecheck`
- `pnpm build`（通过；保留既有 Vite 大 chunk 警告）
- `pnpm check:docs`
- `pnpm check:frontend-theme`
- `git diff --check`
- 浏览器 renderer 实测：Usage 后直接展示 Workspaces，可访问结构与首屏均无 Scheduled 标题、空状态或操作按钮。
- 首次构建受到上一轮开发 watch 与 `dist` clean 并发冲突；停止该开发进程并重建 `@actspace/agent-core` 依赖产物后，根构建通过。
