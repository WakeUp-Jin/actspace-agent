## [2026-11-01 22:00] | Task: Review 只留查看（功能减法 P5）

### 🤖 Execution Context

- **Agent ID**: `subagent (架构优化 P5)`
- **Base Model**: `Claude Sonnet 5.5`
- **Runtime**: `Claude Code`

### 📥 User Query

> 执行功能减法 P5：「改动」（Review）只查看改动，删除暂存 / 还原、已查看、复制 apply、创建 PR、初始化 Git、面板内提交对话框和实时文件监听；输入框 +N/−M 改为在每轮结束、打开面板、手动刷新和顶部菜单提交后强制刷新。

### 🛠 Changes Overview

**Scope:** `@actspace/shared`、`@actspace/desktop`（main + renderer）、`apps/site`、`docs/`

**Key Actions:**

- **删除后端服务**: `review-view-state-service`、`review-pr-service`、`review-git-service`、`review-workspace-watcher`、`review-ignore-filter` 与测试；6 个 IPC channel（stage / revert / viewed / PR / copy-apply / initGit）。
- **引擎与协调器只读**: `ReviewGitEngine` 只剩 snapshot、file diffs、file contents、分支和提交列表；`ReviewCoordinator` 的 `refreshSnapshot` 成为唯一递增 generation 并广播 `reviewChanged`（reason `refresh`）的路径。
- **契约瘦身**: `ReviewCapabilities` 只剩 `canLoadFullFile`，去掉 `viewed`、`lastTurn` selection、hunk 指纹。
- **界面瘦身**: 去掉 git 菜单、提交 / PR 对话框、文件与 hunk 级写操作、已查看、复制 apply、「最近一轮」；非 Git 目录显示「当前目录不是 Git 仓库」。
- **强制刷新**: 面板挂载、每轮结束、切换目标、手动刷新、顶部菜单提交都走 `refreshSnapshot`；同 generation 的通知跳过，避免 diff 闪动。
- **文档**: Review 总规范重写并新增「刷新时机」，其他规范、索引、站点 `review.md`、更新日志同步。

### 🧠 Design Intent (Why)

动手操作 git 的入口只留顶部工作区菜单，Review 回到「看清改动」。去掉写操作后，generation / 指纹防过期的整套机制、文件监听和忽略过滤随之不需要，主进程少了常驻的 watcher 和大量 git 子进程，CPU 占用来源被拿掉。属于「架构优化」第一步功能减法（`docs/design-docs/架构优化/01-功能减法设计.md`）。

注意：`docs/exec-runs/20261008-review-resource-test/` 下的基准脚本依赖已删的 watcher 和 `scheduleInvalidation`，现在无法运行。

### 📁 Files Modified

- `packages/shared/src/review.ts`、`desktop-bridge/contract.ts`、`runtime-v2/fixed-renderer.ts`
- `apps/desktop/src/main/review-coordinator.ts`、`review-git-engine.ts`、`runtime-v2/desktop-shell-ipc.ts`、`fixed-renderer-ipc.ts`、`tsconfig.electron.json`
- `apps/desktop/src/renderer/components/review/`、`composer/ReviewStrip.tsx`、`workspace/WorkspaceChromeControls.tsx`、`RightPanel.tsx`、`WorkbenchLayout.tsx`、`right-panel/ReviewRenderView.tsx`
- `scripts/native-button-baseline.json`
- `docs/design-docs/core-review-change-sources.md`、`core-review-large-diff-loading.md`、`frontend/` 下三份规范、`docs/ARCHITECTURE.md`、`docs/design-docs/index.md`
- `apps/site/src/content/docs/review.md`
- `docs/releases/feature-release-notes.md`、`docs/exec-runs/20261101-feature-subtraction/execution-process.md`
