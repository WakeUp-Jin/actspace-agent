## [2026-11-08 18:15] | Task: 文档面板改名「MD 文档」、去图例、修大工作区清单截断

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI (macOS)`

### 📥 User Query

> 文档面板只显示 MD，改名「MD 文档」；树底「绿点 = 本会话 Agent 写过或改过」删掉；为什么显示「文件过多，仅显示前 3031 篇」？

### 🛠 Changes Overview

**Scope:** `apps/desktop`（main + renderer）、`packages/util/shared`、文档

**Key Actions:**

- **改名**：右侧面板标签、菜单、启动列表、空状态都改成「MD 文档」。
- **去图例**：删掉树底常驻的绿点说明，文件名后的绿点和「本会话改过」筛选保留。
- **清单截断**：非 git 工作区遍历时，子目录本身是 git 仓库就改用 `git ls-files`；截断时返回没走完的顶层目录 `incompleteDirs`，树顶写「N+ 篇」，树底 warning 提示具体目录并给「继续加载」（`expanded: true`，上限 ×4）。

### 🧠 Design Intent (Why)

learn-subagent 工作区本身不是 git 仓库，里面放了 7 个完整开源仓库（约 5.7 万个目录项），遍历在 5 万项上限处停在 opencode 中途，pi-mono 整个没出现；而提示把原因写成「仅显示前 3031 篇」，像是篇数上限。嵌套仓库走 git 后这类工作区不再碰上限；真碰上时用户能看到是哪些目录不全，并能主动放大上限。

### 📁 Files Modified

- `apps/desktop/src/main/workspace-fs-service.ts`
- `apps/desktop/src/main/ipc/guards.ts`
- `apps/desktop/src/main/runtime-v2/desktop-shell-ipc.ts`
- `packages/util/shared/src/ipc.ts`
- `apps/desktop/src/renderer/components/right-panel/docs/{DocsTree,DocsPanel,DocsReader,DocsLeaveDialog,use-docs-listing}.ts(x)`
- `apps/desktop/src/renderer/components/{RightPanel,WorkbenchLayout}.tsx`、`right-panel/{RightPanelContext,RightPanelObjectMenu}.tsx`、`files/open-workspace-path.ts`
- 测试：`main/test/workspace-fs-service.test.ts`、`renderer/test/{docs-panel,right-panel-workspace,right-panel-object-menu,chat-presentation-recovery,open-workspace-path,docs-panel-line}.test.*`
- 文档：`front-文档面板规范.md`、`front-右侧面板与文件渲染规范.md`、`front-工作台布局与面板交互规范.md`、`apps/site/src/content/docs/file-preview.md`
