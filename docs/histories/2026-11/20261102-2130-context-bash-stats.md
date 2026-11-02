## [2026-11-02 21:30] | Task: Context 面板 · Bash 命令统计

### 🤖 Execution Context

- **Agent ID**: `main`
- **Base Model**: `Claude Opus 5.5`
- **Runtime**: `Claude Code`

### 📥 User Query

> 上下文统计里加一个 Bash 命令统计：cat、ls 等各调用了多少次。参考 DSH 插件 dsh-context 的命令面板但只留核心；放在右侧「上下文」面板最底下；先写设计规范、再写执行计划、再实现，新 worktree 新分支，没问题就提 PR。

### 🛠 Changes Overview

**Scope:** `packages/util/shared`、`apps/desktop/src/main/runtime-v2`、`apps/desktop/src/renderer/components/right-panel/context`、`docs/`

**Key Actions:**

- **规范与 demo**: `front-Context面板Bash命令统计.md` 与 `context-bash-demo.html`，用户确认 D1–D6（位置、三个数、程序分布与子命令、出现即计、失败按程序去重、砍掉逐条命令等）。
- **解析器**: `bash-programs.ts` 从命令里拆程序与子命令（引号、`$(...)`、heredoc、包装命令、cd 前缀等）。
- **投影**: 上下文历史投影新增三张表，投影版本 1→2 让老会话打开面板时自动补齐；不升使用统计库 Schema，Worker 打开时补表。
- **卡片**: `ContextBash` 显示调用、失败、合计耗时和程序分布，`git` 等 8 个程序可展开子命令。

### 🧠 Design Intent (Why)

统计只回答「Agent 用 Bash 干了什么、哪些老失败」，具体某条命令去轨迹看，所以不做逐条列表、输出和筛选。走现有的按需上下文投影，避免为一个统计重建整个使用统计库，也避开另一分支正在升的 Schema 版本。

### 📁 Files Modified

- `packages/util/shared/src/context-panel.ts`
- `apps/desktop/src/main/runtime-v2/bash-programs.ts`（新）
- `apps/desktop/src/main/runtime-v2/context-history-version.ts`（新）
- `apps/desktop/src/main/runtime-v2/context-history-projection.ts`
- `apps/desktop/src/main/runtime-v2/context-history-query.ts`
- `apps/desktop/src/main/runtime-v2/context-panel-service.ts`
- `apps/desktop/src/main/runtime-v2/usage-read-model.ts`
- `apps/desktop/src/main/runtime-v2/usage-read-model-worker.ts`
- `apps/desktop/src/renderer/components/right-panel/context/ContextBash.tsx`（新）
- `apps/desktop/src/renderer/components/right-panel/context/context-bash-model.ts`（新）
- `apps/desktop/src/renderer/components/right-panel/context/ContextPanel.tsx`
- `apps/desktop/src/renderer/mock/context-panel-fixture.ts`
- `scripts/native-button-baseline.json`
- 测试：`bash-programs.test.ts`、`context-bash-projection.test.ts`、`context-bash.test.tsx`（新），`context-panel.test.tsx`
- 文档：规范、demo、计划、exec-runs、`front-右侧面板与文件渲染规范.md`、`front-Context面板后端数据需求.md`、`docs/exec-plans/README.md`

### 📝 Notes

- desktop typecheck 与 2201 个测试通过；浏览器 mock 截图与 demo 一致。
- Electron 真实 Host 老会话对照未做，验证步骤见执行摘要。
