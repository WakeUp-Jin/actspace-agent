## [2026-07-24 23:47] | Task: 重组设计文档单层专题目录

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 将 `docs/design-docs/` 中强关联、同层级的设计文档放进专题文件夹；只允许在 `design-docs` 下创建一层目录，专题目录内禁止继续嵌套。

### 🛠 Changes Overview

**Scope:** `docs/design-docs`、仓库文档导航、设计路径引用和 Browser 文档一致性脚本

**Key Actions:**

- **[Single-level taxonomy]**: 创建十个一级专题目录；基础原则、跨专题 Agent 入口和独立 fs-watch 设计继续保留在根层。
- **[Asset flattening]**: 取消 `public/`、`mockups/`、`previews/`、`lab-rust-cli/` 多级目录，把 HTML 与 PNG 直接放进对应专题目录。
- **[Duplicate consolidation]**: 将前端总览收口到 `frontend/README.md`，将 Lab UI 原则并入 `lab-frontend-page-design.md`，由正式 Rust CLI 设计承接原始讨论稿。
- **[Atomic reference migration]**: 同步更新架构导航、AGENTS 路由、前端入口、源码注释、执行计划、历史文档和 Browser registry 检查脚本中的设计路径。
- **[Validation]**: 确认专题目录内无二级目录、设计文档 Markdown 相对链接无断链，并通过 `check:docs`、`check:browser`、`check:repo` 与 `git diff --check`。

### 🧠 Design Intent (Why)

完全平铺会让同一能力的设计、实现说明和原型彼此分散；按 Agent、Frontend、Lab 做多层树又会重新引入过深导航。本次采用“根层入口或独立文档 + 一级强关联专题目录”的折中结构，用目录表达稳定能力边界，同时用硬约束阻止专题内部继续生长子目录。

### 📁 Files Modified

- `docs/design-docs/index.md`
- `docs/design-docs/agent-index.md`
- `docs/design-docs/frontend/README.md`
- `docs/design-docs/lab/README.md`
- `docs/design-docs/browser/agent-browser-use-index.md`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `AGENTS.md`
- `scripts/check-browser-command-registry.mjs`
- `docs/exec-plans/completed/20260724-design-docs-single-level-reorganization.md`
