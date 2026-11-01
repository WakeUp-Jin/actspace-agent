## [2026-11-01 23:00] | Task: 包搬家与改名（插件结构 S1）

### 🤖 Execution Context

- **Agent ID**: `subagent (架构优化 S1)`
- **Base Model**: `Claude Sonnet 5.5`
- **Runtime**: `Claude Code`

### 📥 User Query

> 执行插件结构 S1：把 62 个现有 package 按 `packages/<能力>/<包>` 两级结构搬家，改 16 个包名，新建 `@actspace/tool-subagent` 和 `@actspace/skill`；运行时 id（Entry、plugin、service、事件类型）不变；提交内只做搬家，不改逻辑和格式。

### 🛠 Changes Overview

**Scope:** `packages/`（全部）、`apps/`、`scripts/`、根配置、`docs/`

**Key Actions:**

- **搬家**: 62 个包映射到 23 个能力目录，共 64 个包（含 2 个新包）；`core/agent`、`core/agent-loop`、`core/scope` 目录不变，实际移动 59 个目录。`pnpm-workspace.yaml` 只留 `apps/*` 和 `packages/*/*`。
- **改名**: 16 个包名（`core-agent`→`agent`、`tools-runtime`→`tool-runtime`、`session-jsonl`→`session-persistence-jsonl`、`tools-*`→`tool-*`、`tools-approval`→`approval` 等）；全仓 import、依赖、tsconfig、脚本和当前文档同步。
- **新包**: `@actspace/tool-subagent`（从 `core/runtime` 的 `harness-subagent-tools.ts` 搬出，带 manifest 和 2 个生命周期测试）；`@actspace/skill`（从 `context/prompt` 抽出 catalog 与 discovery，纯库）。
- **Entry 映射**: `defaultHarnessEntrySource` 改为显式映射表，未知 id 抛错；Entry id 本身不变。
- **检查脚本**: `check-package-boundaries` 新增两条规则，包必须位于 `packages/<能力>/<包>`、目录名必须等于包名去掉 `@actspace/`；对应测试补充。
- **生成文件**: 只用脚本重新生成 `tsconfig.desktop-deps.json`、各包 `tsconfig.build.json`、contract matrix 文档；contract matrix 注册表加入两个新包。
- **sharedModules 结论**: `artifact.json` 的 `sharedModules` 记录 specifier、绝对 file URL 和完整性；默认 Harness 每次启动都会重新发布，路径或 dist 变化本来就会使旧 artifact 校验失败。旧 specifier 别名帮不上忙，所以没有加。用户固定选择的旧版本会得到 `RESTART_REQUIRED`，这是原有行为。

### 🧠 Design Intent (Why)

目录名等于包名，能力一目了然，后面 S2/S3 按能力开关插件、S4 重写 README 都依赖这个布局。搬家单独成一个提交，用 `git diff -M --stat` 能直接看到 925 个 rename（737 个 100% 相似），review 只需要看那 175 个修改。属于「架构优化」插件结构（`docs/design-docs/架构优化/02-插件结构设计.md`）。

注意：本机搬家后要重建 pnpm 的隐式提升链接（删 `node_modules/.pnpm/node_modules` 与 `node_modules/.modules.yaml` 后 `pnpm install --offline`），否则 Host 进程测试因旧路径链接失败。清空 dist 后第一次 `build:deps:dev` 会因 agent-service 测试缺依赖产物失败，重跑即过（原有顺序依赖）。

### 📁 Files Modified

- `packages/**`（59 个目录移动，新增 `packages/subagent/tool-subagent/`、`packages/skill/skill/`）
- `packages/core/runtime/src/harness/default-harness-definition.ts`、`src/test/tool-contracts.test.ts`
- `packages/context/prompt/`（去掉 catalog/discovery，改依赖 `@actspace/skill`）
- `pnpm-workspace.yaml`、`tsconfig.desktop-deps.json`、`apps/*` 的 package.json / tsconfig / vite 配置
- `scripts/check-package-boundaries.mjs`、`scripts/test/package-boundaries.test.mjs`、`scripts/contract-matrix/source-registry.mjs`
- `README.md`、`docs/ARCHITECTURE.md`、`packages/README.md`、`docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`、`agent-contract-matrix.generated.md`
- 历史文档里的 22 个失效链接目标（exec-runs、已完成计划、自进化设计文档 06）
- `docs/exec-runs/20261101-feature-subtraction/execution-process.md`
