## [2026-11-09 12:15] | Task: 清零供应链 OSV 扫描，升级 vite 7 / vitest 4 等开发依赖

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> 那接下来我们把这个 OSV scan 修复一下看看，给我看方案打算怎么修，我审核一下先……同意开始吧。

### 🛠 Changes Overview

**Scope:** 根 `package.json`、`apps/desktop`、`apps/web`、`apps/site`、`packages/*/*`（vitest 声明）、`packages/core/runtime`、`pnpm-lock.yaml`、`.github/workflows/supply-chain-security.yml`、`.github/dependabot.yml`、`docs/CICD.md`、`docs/exec-plans/tech-debt-tracker.md`

**Key Actions:**

- **升级有漏洞的开发依赖到修复版**：vite 5 → 7.3.7（desktop / web），vitest 3 → 4.1.12（全部 72 个 package），esbuild 0.21.5 → 0.28.2（与 vite 7 自带版本对齐，三处声明），astro 7.1.3 → 7.4.7 + sharp 0.35.5 + `@astrojs/check` 0.9.12 + `@astrojs/sitemap` 3.7.4（site），wait-on 8 → 9，katex 0.16.47 → 0.18.2 并加 `pnpm.overrides` 让 `rehype-katex` / `mermaid` 的间接 katex 同版（两者声明的是 `^0.16`，不 override 会留一份旧版在 lockfile 里）。
- **重新生成 lockfile**：`pnpm install` 后再 `pnpm update -r`（不带 `--latest`，只在现有 semver 范围内）把 fast-uri、follow-redirects、js-yaml、nanoid、shell-quote、smol-toml、source-map-js、zod、browserslist、`@babel/core` 等传递依赖拉到修复版。本地用 osv-scanner 2.7.1 以工作流同参数（`--recursive --allow-no-lockfiles ./`）扫描：93 条 → 0 条。
- **修 astro check 的 peer 解析**：`@astrojs/astro2tsx` 依赖 `@emnapi/core` 1.11.3，而 `@napi-rs/wasm-runtime` 的 peer 范围允许 `^2.0.0-alpha.4`，pnpm 自动选到图里 rolldown 带进来的 `@emnapi/runtime` 2.0.0-beta.2，core / runtime 不配对导致 `astro check` 启动即崩。site 自己声明 `@emnapi/runtime` 1.11.3 让 peer 解析回到配对版本。
- **适配 vitest 4 的 mock 语义**（desktop 两个测试文件、4 个用例）：ResizeObserver 假实现从箭头函数改为 `function`（vitest 4 不允许对箭头函数 mock 使用 `new`）；jsdom 没有 `matchMedia`，vitest 4 的 `vi.spyOn` 拒绝 undefined 属性，改为 `vi.stubGlobal` 并在 `afterEach` 用 `vi.unstubAllGlobals()` 还原。
- **工作流与 Dependabot**：`supply-chain-security.yml` 的 `paths` 显式列出 `**/package.json` 并排除 `docs/**`（文档里的原型 demo 不进安装包）；`dependabot.yml` 忽略 katex 的直接更新，由 overrides 统一管理。
- **文档**：`tech-debt-tracker.md` 的 katex 与 osv-scan 两条划掉并写明解法；`CICD.md` 的触发条件补上 `docs/**` 例外；`agent-contract-matrix.generated.md` 随 `package.json` 依赖摘要重新生成。

### 🧠 Design Intent (Why)

- osv-scan 对整个 lockfile（含 devDependencies）扫描，main 基线就有 93 条，导致所有碰 `pnpm-lock.yaml` 的 PR 这个 job 恒红。与其配 `osv-scanner.toml` 忽略 dev 条目，不如一次把根因（vite 5 / vitest 3 的 tinypool Critical、astro 精确锁定、wait-on 8 的 axios / joi、katex 0.16）升掉，之后新漏洞交给每周扫描和 Dependabot 兜底。
- 选 vite 7 而不是 8：`@vitejs/plugin-react` 4.7、`@tailwindcss/vite`、vitest 4 的 peer 都覆盖 7；astro 7.3.3+ 已依赖 vite 8，但 site 走自己的 vite 实例，与 desktop / web 不冲突。
- katex 用 override 硬升而不是 ignore：产品渲染代码只用 `renderToString` / 宏接口，0.16 → 0.18 的 Markdown 公式测试全过；留一份 0.16 在 lockfile 里扫描就不会归零。
- `pnpm update -r` 不带 `--latest`：只在 package.json 已声明的范围内动，避免把一堆无关大版本混进这一轮。

### ✅ Verification

- `pnpm lint`、`pnpm typecheck`（含 site 的 `astro check`）、`pnpm --filter '@actspace/agent-cli...' build`、根 `pnpm test` 全部脚本级测试、`pnpm -r test`（desktop 303 个测试文件）、`pnpm build`（agent-cli / desktop / web）、`pnpm check:site`、`pnpm build:site`、`./scripts/ci.sh`、`pnpm check:docs` 通过。
- 四处直接调用 esbuild 的脚本（desktop preload bundle、`build-default-harness.mjs`、`build-browser-locator-runtime.mjs`）在 0.28 下产物一致（locator runtime 生成后 git 无 diff）。
- 两处与本次改动无关的本地失败：`tool-runtime` 的 3 个用例因本机存在 `/workspace` 符号链接而 `denied`（已在技术债里登记，GitHub runner 没有）；`session-persistence-jsonl` 的「same-size rewrite falls back to a full read」偶发，依赖同毫秒内 mtime 变化，连续三次运行一次失败。
- `pnpm check:browser` 需要 Go 1.26 工具链，本机没有，未运行；Go 依赖本轮未动。

### 📁 Files Modified

- `package.json`、`pnpm-lock.yaml`
- `apps/desktop/package.json`、`apps/web/package.json`、`apps/site/package.json`
- `packages/*/*/package.json`（vitest 版本）、`packages/core/runtime/package.json`（esbuild）
- `apps/desktop/src/renderer/test/composer.test.tsx`
- `apps/desktop/src/renderer/test/conversation-view-tooltip.test.tsx`
- `.github/workflows/supply-chain-security.yml`、`.github/dependabot.yml`
- `docs/CICD.md`、`docs/exec-plans/tech-debt-tracker.md`
- `docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`
- `docs/histories/2026-11/20261109-1215-osv-lockfile-fixes.md`
