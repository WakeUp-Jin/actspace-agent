## [2026-05-25 22:49] | Task: architecture-doc-reorg

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 优化 `docs/ARCHITECTURE.md`，将过多内容抽离到单独文档；设计规范放入 `docs/design-docs`；同步更新 `AGENTS.md`，避免把过多 design-docs 直接写进 AGENTS。

### 🛠 Changes Overview

**Scope:** `docs`

**Key Actions:**

- **[Architecture routing]**: 将 `docs/ARCHITECTURE.md` 收敛为顶层架构入口，保留仓库结构、依赖边界、阅读路线和维护规则。
- **[Topic extraction]**: 新增 `docs/design-docs/agent-core/current-module-map.md` 承接 agent-core 当前模块清单。
- **[Storage boundaries]**: 新增 `docs/design-docs/storage-and-observability.md` 承接本地存储、应用数据目录、workspace root 和排障日志边界。
- **[Navigation cleanup]**: 更新 `AGENTS.md` 和 design-docs 索引，修正不存在的 `docs/backend-agent-testing.md` 路径。

### 🧠 Design Intent (Why)

`ARCHITECTURE.md` 已经同时承载顶层架构、模块实现清单、存储模型、IPC 和数据流，导致入口文档过重。将实现事实拆入专题文档后，Agent 每轮可以先读较短的架构入口，再按任务类型进入具体设计文档，降低导航成本并减少 AGENTS.md 膨胀。

### 📁 Files Modified

- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/QUALITY_SCORE.md`
- `docs/design-docs/index.md`
- `docs/design-docs/agent-core/index.md`
- `docs/design-docs/agent-core/current-module-map.md`
- `docs/design-docs/storage-and-observability.md`
