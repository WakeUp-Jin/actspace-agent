## [2026-07-29 14:17] | Task: 完善 Environment 与本地 Git 操作

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: `GPT-5 Codex`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 参考 Codex 完善顶部 Environment 信息窗口和编辑器选择：展示 This Mac / Worktree、Changes、当前分支或 Create branch，并提供 Commit、Commit and push、Push；不实现 Pull Request。

### 🛠 Changes Overview

**Scope:** `@actspace/shared`、`@actspace/desktop`、前端设计与安全文档

**Key Actions:**

- **Environment 信息面板**: 展示 Review 变更统计、This Mac / linked Worktree、真实分支、Sources，并在窄窗口保持可达。
- **本机工具选择**: 检测并打开 VS Code、Cursor、Finder、Terminal、iTerm2，通过 macOS App Bundle 缩略图展示真实图标，记住上次选择并在不可用时回退 Finder。
- **本地 Git 工作流**: 在单一 action panel 支持分支创建、Commit、Commit and push、Push 和多 remote 选择；Include unstaged changes 默认开启且可显式关闭，不加入 Pull Request。
- **安全边界**: renderer 只传稳定 action / tool id；main 仅对已登记 workspace 使用固定 Git argv 和应用映射，裁剪路径与 URL 凭据错误信息。
- **状态一致性**: 多 remote 在 commit 前预检；push 失败时保留并展示已创建 commit 的 hash。
- **文档与验证**: 新增长期设计规范和执行计划，补 main / renderer 测试，并完成主题、响应式、浏览器 mock 与真实 Electron 验收。

### 🧠 Design Intent (Why)

Environment 应当是当前 workspace 的可信控制面，而不是远程托管入口。高频状态保持紧凑可见，写操作在单一 action panel 中显式表达范围和结果；main 进程拥有 Git 与本机应用能力，renderer 只表达用户意图。Commit 默认覆盖 workspace 全部变更，但允许用户显式关闭 Include unstaged changes 以只提交 staged changes；Push 不猜测多个 remote，也不掩盖部分成功。

### 📁 Files Modified

- `docs/design-docs/frontend/front-environment-and-git-actions.md`
- `docs/exec-plans/completed/20260729-environment-and-local-git-actions.md`
- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/workspace-environment-service.ts`
- `packages/desktop/src/main/workspace-open-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/components/workspace/WorkspaceChromeControls.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`

### ✅ Verification

- `pnpm --filter @actspace/shared build`
- `pnpm --filter @actspace/agent-core build`
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/desktop test`：69 files / 558 tests passed
- 浏览器 mock：`480 / 820 / 1440px`，浅色 / 深色，Environment、工具菜单和统一 Git action panel
- 真实 Electron：确认 VS Code / Cursor / Finder / Terminal / iTerm2 原生图标、无竖线分体按钮、紧凑 Environment、This Mac / Worktree、main / New branch 与统一 Git action panel
- 未对用户仓库执行真实 Commit / Push；凭据远端 Push 仍保留为用户验收边界
