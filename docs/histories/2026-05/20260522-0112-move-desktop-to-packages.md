## [2026-05-22 01:12] | Task: move desktop package

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 把桌面端迁到 `packages/desktop`，保留简单启动命令。

### 🛠 Changes Overview

**Scope:** `packages/desktop`, workspace config, `docs/`

**Key Actions:**

- **[目录迁移]**: 将桌面端源码迁移到 `packages/desktop`，保留包名 `@actspace/desktop` 不变。
- **[workspace 收口]**: 更新 `pnpm-workspace.yaml`，移除 `apps/*`，统一只使用 `packages/*`。
- **[路径与文档同步]**: 更新仓库结构文档、执行计划和相关 histories，使目录描述与真实代码位置一致。
- **[启动入口保持简单]**: 保持根目录继续使用 `pnpm dev` 作为桌面端开发启动入口。

### 🧠 Design Intent (Why)

当前项目只有一个真正的应用，就是桌面端。继续保留旧的 `apps` 语义更像模板仓库，而不是产品仓库。迁到 `packages/desktop` 后，结构更符合当前项目实际，也避免为了“可能存在的多个 app”提前背上多余目录层级。

### 📁 Files Modified

- `pnpm-workspace.yaml`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/exec-plans/completed/actspace-v1-foundation.md`
- `docs/histories/2026-05/20260521-2215-actspace-foundation-skeleton.md`
- `docs/histories/2026-05/20260521-2310-agent-runtime-skeleton.md`
- `docs/histories/2026-05/20260521-2330-workbench-ui-skeleton.md`
- `docs/histories/2026-05/20260521-2356-runtime-ui-integration.md`
- `docs/histories/2026-05/20260522-0020-integration-acceptance-complete.md`
- `docs/histories/2026-05/20260522-0048-stable-app-data-path.md`
- `docs/histories/2026-05/20260522-0112-move-desktop-to-packages.md`
