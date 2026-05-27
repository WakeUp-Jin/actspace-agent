## [2026-05-28 00:57] | Task: GitHub CI workspace checks

### 🤖 Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 可以考虑一下 GitHub 的流水线部署情况，看看文档；确认后开始推进。

### 🛠 Changes Overview

**Scope:** `.github/workflows`, `docs`

**Key Actions:**

- **[CI workflow]**: 在 `.github/workflows/ci.yml` 中新增 `workspace-checks` job，执行 `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test` 和 `pnpm build`。
- **[Pinned action hygiene]**: 没有新增第三方 action；通过 Corepack 读取根 `package.json` 的 `packageManager` 字段启用 pnpm，避免引入未 pin action。
- **[Docs sync]**: 更新 `docs/CICD.md`，说明 CI 已从纯仓库门禁扩展到真实 workspace 工程门禁。
- **[Supply chain sync]**: 更新 `docs/SUPPLY_CHAIN_SECURITY.md`，明确 dependency review 当前是 `warn-only` 告警模式，而不是硬阻断。

### 🧠 Design Intent (Why)

此前 GitHub CI 主要守住 docs、repo hygiene、action pinning 和 shell syntax，本地的 TypeScript workspace 健康仍依赖人工运行。新增 `workspace-checks` 后，PR 和 main push 都会覆盖依赖安装、类型检查、测试和构建，能更早发现包边界、Electron 构建和共享契约回归。

### 📁 Files Modified

- `.github/workflows/ci.yml`
- `docs/CICD.md`
- `docs/SUPPLY_CHAIN_SECURITY.md`
