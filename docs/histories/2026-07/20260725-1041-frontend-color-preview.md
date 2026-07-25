## [2026-07-25 10:41] | Task: 执行前端配色迁移里程碑 0–1

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 开始执行这个计划吧

### 🛠 Changes Overview

**Scope:** brand 消费审计与三个配色视觉样板；未修改 renderer。

**Key Actions:**

- **[Design source sync]**: 将已批准的 `DESIGN.md` 与 Ink & Emerald 主题规范同步到当前干净 worktree，并按现有扁平文档结构调整计划路径。
- **[Consumer audit]**: 以主仓库未提交工作区为快照，完成 40 文件 / 159 行 brand 命中的逐行分类，覆盖率 159 / 159。
- **[Visual preview]**: 新增 Sidebar、Composer、Settings standalone HTML 样板，覆盖 Light / Dark / System-Light / System-Dark。
- **[Accessibility]**: 内置对比度矩阵，并为 text-faint、light warning、line-strong 提出候选校准；selected 使用非颜色冗余提示。
- **[Browser verification]**: 在 1440×900 与 1100×720 下验证主题切换、布局、对比度刷新和控制台错误。

### 🧠 Design Intent (Why)

旧 `brand` 同时承担 action、selected、focus、running、info 和 visualization。视觉样板先证明“灰阶层级 + ink action + 稀缺 emerald operational”在真实工作台密度下成立，再允许生产 token 和组件迁移。

### 📁 Files Modified

- `DESIGN.md`
- `docs/design-docs/front-全局视觉语言规范.md`
- `docs/design-docs/front-主题与配色规范.md`
- `docs/design-docs/front-index.md`
- `docs/design-docs/public/front/ink-emerald-color-preview.html`
- `docs/exec-plans/active/20260725-frontend-color-system-migration.md`
- `docs/exec-plans/active/20260725-frontend-color-system-migration-audit.md`
- `docs/exec-plans/active/20260725-frontend-color-system-migration-preview-acceptance.md`
- `docs/histories/2026-07/20260725-0923-frontend-color-migration-plan.md`
- `docs/histories/2026-07/20260725-1041-frontend-color-preview.md`
- `docs/learnings/2026-07/interface-color-needs-role-separation.md`

### ✅ Verification

- 主仓库 brand 审计覆盖：159 / 159 行。
- 1440×900 Light / Dark：通过。
- System-Light / System-Dark：通过。
- 1100×720：无横向溢出。
- 浏览器控制台错误：0。
- 未运行 renderer typecheck / test：本阶段未修改 renderer、TypeScript 或生产 CSS。
