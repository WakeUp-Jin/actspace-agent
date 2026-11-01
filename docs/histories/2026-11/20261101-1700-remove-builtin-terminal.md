## [2026-11-01 17:00] | Task: 删除内置终端

### 🤖 Execution Context

- **Agent ID**: `subagent (架构优化 P2)`
- **Base Model**: `Claude Sonnet 5.5`
- **Runtime**: `Claude Code`

### 📥 User Query

> 执行功能减法 P2：删除内置终端（node-pty、xterm、右侧终端标签、终端 IPC），先把 `capabilities.terminal` 改名为 `workspacePanels`。

### 🛠 Changes Overview

**Scope:** `@actspace/shared`、`@actspace/desktop`、`apps/site`、打包脚本、`docs/`

**Key Actions:**

- **先改名**: `RunTargetCapabilities.terminal` 改为 `workspacePanels`（文档、改动、子 Agent、后台任务等工作区面板），`WorkbenchLayout` 同步。这个开关原本借用「终端」这个名字，同时管着文件树、Review 等面板。
- **删除 main 终端服务**: 整个 `main/terminal/` 目录、`index.ts` 里的创建 / 清理 / `hasNodePty()`、`desktop-shell-ipc.ts` 的 8 个终端 handler、`guards.ts` 的两条 guard、`tsconfig.electron.json` 的 5 个条目。`attachWindowLifecycle` 只剩 `onClosed`。
- **删除契约**: `contract.terminal`、`events.terminal`、9 个 `terminal*` channel 常量、`TERMINAL_LIMITS` 和全部 `Terminal*` 类型。
- **删除 renderer**: `TerminalRenderView` 等 6 个文件；`RightPanel` 的终端标签同步、关闭分支、启动页项；`RightPanelContext` 的三种 terminal tab 和 `syncTerminalTabs`；「+」菜单的终端项；`RightPanel` 的异步关闭状态（只有终端会用到）一并去掉。
- **删除依赖与打包**: `@xterm/xterm`、`@xterm/addon-fit`、`node-pty`；`pnpm-workspace.yaml` 的 `allowBuilds`；`release-package.sh` 的 spawn-helper 检查块（不删的话没有 node-pty 时打包会直接失败）；`scripts/experiments/terminal-native-spike/`。
- **同步文档**: 删「右侧终端与会话生命周期规范」和站点「交互式终端」页（含截图）；ARCHITECTURE、前端规范、安全、质量分、验证文档、站点其余页面去掉终端引用；更新日志追加移除说明。

### 🧠 Design Intent (Why)

内置终端是产品里最重的一块：node-pty 原生模块要按平台编译、签名、修执行位，xterm 带来一整套渲染与主题代码，而 Agent 的 Bash 工具和系统终端已经覆盖了运行命令的需求。属于「架构优化」第一步功能减法（`docs/design-docs/架构优化/01-功能减法设计.md` 第 4 节）。Agent Bash 工具（`packages/tools/shell-tools`）不依赖 `main/terminal/`，不受影响；「在 Terminal / iTerm2 中打开」用系统终端打开目录，保留。

### 📁 Files Modified

- `apps/desktop/src/main/terminal/`（整个目录删除）
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/main-lifecycle.ts`
- `apps/desktop/src/main/runtime-v2/desktop-shell-ipc.ts`
- `apps/desktop/src/renderer/components/RightPanel.tsx`
- `apps/desktop/src/renderer/components/right-panel/RightPanelContext.tsx`
- `apps/desktop/src/renderer/target/run-target.ts`
- `packages/shared/src/desktop-bridge/contract.ts`
- `packages/shared/src/runtime-v2/fixed-renderer.ts`
- `packages/shared/src/ipc.ts`
- `apps/desktop/package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`
- `scripts/release-package.sh`
- `docs/releases/feature-release-notes.md`
