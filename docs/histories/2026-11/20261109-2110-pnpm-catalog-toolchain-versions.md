## [2026-11-09 21:10] | Task: 工具链依赖版本收进 pnpm catalog

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.1`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> pnpm catalog + 版本尾巴：typescript、vitest、vite、@types/node、@vitejs/plugin-react 收进 pnpm-workspace.yaml 的 catalog:；顺手修 apps/site 的 typescript 6.0.3 和两处 @types/node ^22。以后版本漂移只能在一个文件里发生。

### 🛠 Changes Overview

**Scope:** 根 `pnpm-workspace.yaml`、`pnpm-lock.yaml`、全部 73 个 workspace 包的 `package.json`、`scripts/check-package-boundaries.mjs`、`packages/README.md`、`docs/CICD.md`

**Key Actions:**

- **catalog 定版本**：`pnpm-workspace.yaml` 新增 `catalog:`，收录 `typescript ^5.8.3`、`vitest ^3.2.4`、`vite ^5.4.19`、`@types/node ^24.0.3`、`@vitejs/plugin-react ^4.5.2`（取当前多数包在用的范围，lockfile 解析结果不变：5.9.3 / 3.2.4 / 5.4.21 / 24.12.4 / 4.7.0）。
- **各包改写 `catalog:`**：73 个 `package.json` 里这五个依赖一律改成 `"catalog:"`，包括 `cordis-adapter`、`plugin-manager` 把 `typescript` 放在 `dependencies` 的两处。
- **修掉三处漂移**：`apps/site` 的 `typescript 6.0.3` → catalog（5.9.3），`vitest 4.1.10` → catalog（3.2.4）；`apps/desktop`、`apps/web` 的 `@types/node ^22` → catalog（24，与 Electron 45 / Node 24 一致）。lockfile 里 `typescript@6.0.3`、`vitest@4.1.10`、`@types/node@22.19.19` 及其独占的 vite 5(@types/node 22) 变体全部消失；`vite@8.1.5` 仍由 astro 7 间接引入，不在 catalog 管辖范围。
- **守住只改一处**：`scripts/check-package-boundaries.mjs` 读取 `pnpm-workspace.yaml` 的 `catalog:` 键名，任何包在 `dependencies` / `devDependencies` / `optionalDependencies` 里给这些依赖直接写版本号即失败；`scripts/test/package-boundaries.test.mjs` 补一条用例。该脚本已在 `pnpm check:packages` 和 `pnpm test:package-boundaries` 里。
- **文档**：`packages/README.md` 新增插件步骤、`docs/CICD.md` Dependabot 段落写明五个依赖只在 catalog 改。

### 🧠 Design Intent (Why)

73 个包各自复制一遍 `^5.8.3` / `^3.2.4` 这类字符串，只要有一个包漏改就会出现 `apps/site` 用 TypeScript 6、desktop/web 用 `@types/node` 22 这种静悄悄的漂移，lockfile 还要为每个变体多存一棵子树。pnpm catalog 让版本只有一个事实来源；但光有 catalog 挡不住下一个新包直接写版本号，所以把校验挂到已有的包边界检查里，而不是靠评审肉眼盯。

`apps/site` 原本刻意用 TypeScript 6 / Vitest 4（见 `docs/exec-plans/completed/20260727-actspace-site-v1.md`），这次按任务要求统一回 workspace 版本；站点 5 个测试文件 31 条用例和 `astro check` 在 5.9.3 / 3.2.4 下均通过，站点没有 vitest 配置、不依赖 astro 的 vite 8，所以不受影响。整个 workspace 升 vite 6 / vitest 4 仍是 `docs/exec-plans/tech-debt-tracker.md` 里的独立计划，以后在 catalog 一处改即可。

### ✅ Verification

- `pnpm install`：lockfile 生成 `catalogs.default`，净减约 240 行。
- `pnpm --filter @actspace/site test`（31 通过）、`pnpm --filter @actspace/site check`（0 错误）。
- `node scripts/check-package-boundaries.mjs`、`pnpm test:package-boundaries`（4 通过）、`pnpm lint`、`pnpm typecheck`。

### 📁 Files Modified

- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `apps/*/package.json`、`packages/*/*/package.json`
- `scripts/check-package-boundaries.mjs`
- `scripts/test/package-boundaries.test.mjs`
- `packages/README.md`
- `docs/CICD.md`
