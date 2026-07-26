## [2026-07-26 11:04] | Task: 添加会话 Fork 与 Copy

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 在左侧会话菜单中添加 Fork，以及 Copy ID / Copy Transcript 功能。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、会话与前端设计文档

**Key Actions:**

- **会话 Fork**：复制当前稳定会话快照，重写新会话身份与内部目录引用，并保留附件、Context、SubAgent transcript 等 sidecar。
- **安全边界**：renderer 与 Main Process 双层阻止运行中、等待审批中的会话 Fork。
- **Copy 功能**：增加 Copy 二级菜单，可复制 session ID，或导出只含 User / Assistant 正文与附件名的 Markdown transcript。
- **交互接线**：Fork 成功后自动切换到新会话；本地无 preload 的 renderer 模式也提供等价行为，方便浏览器验证。
- **回归覆盖**：补充持久化、transcript formatter、Sidebar 菜单与 App 行为测试。

### 🧠 Design Intent (Why)

会话分支必须成为一份拥有独立身份、可继续恢复和写入的结构化快照，不能只复制 UI 消息或继续引用源目录。Transcript 则刻意过滤 Thinking 和工具 payload，避免“可读分享文本”演变成内部运行日志导出。

### 📁 Files Modified

- `packages/agent-core/src/persistence/session-store.ts`
- `packages/shared/src/session-transcript.ts`
- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `docs/design-docs/core-storage-and-observability.md`
- `docs/design-docs/frontend/front-左侧会话栏规范.md`

### ✅ Validation

- Fork persistence：14 tests passed。
- Transcript formatter：2 tests passed。
- Sidebar menu：34 tests passed。
- App session actions：1 test passed。
- `pnpm typecheck`、`pnpm build`、`pnpm check:frontend-theme`、`pnpm check:docs`、`git diff --check` 通过。
- 浏览器 renderer 验收确认菜单层级、Copy 子菜单和 Fork 后自动切换行为；Electron 主进程确认加载包含 `session:fork` 的 preload / main 构建。
