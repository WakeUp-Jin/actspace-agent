## [2026-06-01 23:50] | Task: 扁平化 design-docs 结构

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> `docs/design-docs` 中不应该继续有专题子文件夹。前端设计文档用 `front-` 前缀，后端 / Agent 设计用 `agent-` 前缀，资产可以放在 `docs/design-docs/public/` 下。

### 🛠 Changes Overview

**Scope:** `docs/design-docs`, `docs/`, `AGENTS.md`, `README.md`, path comments in packages

**Key Actions:**

- **[Flatten Design Docs]**: 将 `agent-core/`、`frontend-ui/`、`lab/`、`llm-agent-fix-plan/` 下的 `.md` 设计文档移动到 `docs/design-docs/` 一层，并统一改为 `agent-`、`front-`、`lab-`、`fix-` 前缀。
- **[Public Assets]**: 将前端图片、前端 HTML prototype、Lab HTML prototype 移到 `docs/design-docs/public/front/` 与 `docs/design-docs/public/lab/`。
- **[Navigation Sync]**: 重写 `docs/design-docs/index.md`、`agent-index.md`、`front-index.md`、`lab-index.md`，并同步 `AGENTS.md`、`README.md`、`docs/ARCHITECTURE.md`、`docs/FRONTEND.md` 等入口。
- **[Link Migration]**: 全仓替换旧专题子目录引用，并修复迁移中出现的重复前缀和重复 `public/` 路径。
- **[Verification]**: 执行文档骨架检查，并用脚本扫描 765 个文本文件中的 `design-docs` 路径，确认仍指向现有文件。

### 🧠 Design Intent (Why)

旧结构把专题拆成多层目录，初看清楚，但日常检索和渐进式披露反而变重：Agent 需要先判断目录，再进目录，再读索引。改成一层文件 + 稳定前缀后，`rg --files docs/design-docs` 就能直接看到所有主题；入口索引负责解释分组，`public/` 只承载资产，不再让图片和 prototype 混入正式设计文档。

### 📁 Files Modified

- `docs/design-docs/index.md`
- `docs/design-docs/agent-index.md`
- `docs/design-docs/front-index.md`
- `docs/design-docs/lab-index.md`
- `docs/design-docs/public/front/*`
- `docs/design-docs/public/lab/*`
- `AGENTS.md`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/histories/2026-06/20260601-2350-flatten-design-docs.md`
- `docs/learnings/2026-06/design-docs-flat-prefix-public-assets.md`
