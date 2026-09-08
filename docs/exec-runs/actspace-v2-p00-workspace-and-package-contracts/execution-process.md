# ActSpace v2 P00：Workspace 与包契约地基 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260824-actspace-v2-package-layout-and-plugin-packaging/actspace-v2-p00-workspace-and-package-contracts.md`
- **执行模式**：交互
- **开始时间**：2026-08-25
- **结束时间**：2026-08-25
- **状态**：完成

## 执行时间线

### 步骤 1：确认迁移基线

- 当前 v2 实现仍集中在 `packages/agent-runtime`；旧用户数据和既有工作树改动保留。
- 本阶段不删除旧入口、不改 renderer、不改 Browser Bridge。

### 步骤 2：建立 workspace 与 package map

- 扩展 `pnpm-workspace.yaml` 发现 `packages/*/*`。
- 新增 `tsconfig.package.json`，统一 NodeNext / strict / ESM leaf package 基线。
- 新增 `agent-package-ledger.md`，固定 package、plugin、Entry 三类身份。

### 步骤 3：建立 leaf manifests 与静态入口

- 新增 runtime、boot、bundle、composition、diagnostics、Cordis adapter 基础包。
- 新增 core、session、llm、context、prompt、tools、subagent、compaction、host、client 等 leaf package manifests。
- 为可装载领域包提供独立 `manifest`、`plugin`、`index` 入口；Session Journal 额外提供纯 `codec` 入口。

### 步骤 4：建立 boundary verifier

- 新增 `scripts/check-package-boundaries.mjs` 和 Node test。
- 检查公开 exports、禁止 sibling `src` deep import、禁止 Cordis 私有 deep import、禁止通用 harness/plugins package，并检查 workspace dependency cycle。

### 步骤 5：收口应用与可复用包的物理边界

- 将 Electron Desktop、managed CLI 和 Astro Site 从 `packages/` 迁入 `apps/desktop`、`apps/cli`、`apps/site`，保持 `@actspace/desktop`、`@actspace/agent-cli`、`@actspace/site` package identity 不变。
- 更新 workspace discovery、lockfile importer、TypeScript/Vite/Vitest 路径、构建/打包脚本和 CI workflow。
- 扩展 package boundary verifier：应用必须是 private workspace package；`packages/` 不得依赖 `apps/`；应用之间不得建立 package dependency，也不得读取 sibling `src/`。

## 验证结果

- `CI=true pnpm install --frozen-lockfile`：通过，33 个 workspace project。
- `pnpm check:packages`：通过，32 个 package manifest，依赖图无 cycle。
- `pnpm typecheck`：通过，32/33 workspace projects 执行成功（根 package 无 typecheck）。
- `pnpm test`：通过；包括 Runtime 157 tests、Desktop 522 tests，以及 Shared、CLI、Site 和新增 package tests。
- `pnpm check:docs`、`pnpm check:repo`、`git diff --check`：通过。
- 2026-08-26 应用目录收口后：`pnpm install --frozen-lockfile --offline`、`pnpm check:packages`（31 manifests）、`pnpm test:package-boundaries`、strict cutover/legacy scan、`pnpm typecheck`、`pnpm build`、`pnpm test`、Site check/test/build、managed CLI package/smoke/process 和 Browser/Go checks 均通过。
- 最终完成审计把 `check:packages` 从普通 workspace 边界扩展到真实插件包契约：任何导出 `./plugin` 的 package 都必须同时具备并导出 Static Manifest、Behavior Entry，拥有 lifecycle test；存在 `src/codec.ts` 时必须提供 `./codec` export。负向 fixture 已证明删除 lifecycle contract 会让门禁失败。

## 失败与回退

P00 失败时只回退本次新增的 manifest/config/boundary 文件，不触碰 `packages/agent-runtime`、旧 Session 数据和已有用户改动。
