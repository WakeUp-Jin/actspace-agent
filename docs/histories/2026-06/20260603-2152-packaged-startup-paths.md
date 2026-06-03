## [2026-06-03 21:52] | Task: Fix packaged startup paths

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户通过安装版启动日志确认 macOS app 双击启动时 Dock 有图标但无窗口，需要根据日志定位并修复。

### Changes Overview

**Scope:** `packages/desktop` main process

**Key Actions:**

- **[Startup path fallback]**: 将 repo root、log root、workspace root 解析抽到 `app-paths.ts`，找不到真实仓库时返回 `null`，不再把 `/` 当作仓库根。
- **[Packaged logs]**: 当安装版从仓库外启动时，运行日志落到 `<userData>/logs`，避免尝试创建 `/logs`。
- **[Workspace fallback]**: 当没有显式 `ACTSPACE_WORKSPACE_ROOT` 且找不到 repo root 时，默认工作区回退到 Downloads，而不是 `/`。
- **[Regression tests]**: 新增单测覆盖 cwd 为 `/` 的安装版启动路径选择，锁定不会再生成 `/logs` 或 `/` workspace。

### Design Intent (Why)

安装版双击启动时 `process.cwd()` 可能是 `/`，旧逻辑在找不到仓库根时 fallback 到 cwd，导致 main 初始化阶段尝试创建 `/logs` 并触发未处理 rejection。路径解析改为显式区分“找到 repo”和“未找到 repo”，让开发态继续使用仓库 `logs/`，安装版使用用户数据目录里的日志。

### Verification

- `pnpm --filter @actspace/desktop test -- app-paths.test.ts`
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm package:desktop`

### Files Modified

- `packages/desktop/src/main/app-paths.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/test/app-paths.test.ts`
