# CI 提速：拆 job 并行 + tsc -b 增量缓存 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261109-ci-speedup.md`
- **执行模式**：交互
- **开始时间**：2026-11-09 13:20
- **结束时间**：见文末

## 执行时间线

### 步骤 0：基线测量

- **操作**：拉 `main` 最近两次 `ci.yml` 运行的 step 时间和 Test 步骤日志，按包拆出 vitest 的 `Duration`；本地（4 核）对比逐包 `tsc -p` 与 `tsc -b` 的冷 / 热耗时，单独跑 desktop vitest 及 main / renderer 两段。
- **结果**：数字写进了计划的「背景」一节。额外发现两件事：
  - `tsconfig.package.json` 的 `exclude` 相对根目录解析，是空操作；`tsc -b` 在 `agent-service` 报 5 个 TS2307。
  - vitest 4 不再默认排除 `**/dist/**`，`runtime` 的 26 个同目录 `*.test.ts` 被编进 `dist/` 后在 CI 被跑了两遍（66 个文件 / 37 s，实际只有 33 个）。

### 步骤 1：P1 `exclude` 修正与根脚本切到 `tsc -b`

- **操作**：
  - `tsconfig.package.json`：`exclude` 改为 `["**/test", "**/tests", "**/*.test.ts"]`。
  - `packages/client/client/tsconfig.json`、`packages/session/session-persistence-jsonl/tsconfig.json`：这两个包自己覆盖了 `exclude`，补上 `src/**/*.test.ts`。
  - 根 `package.json`：新增 `build:deps`（委托 desktop 的 `build:deps:dev`），`typecheck` 改为 `build:deps` + `--filter '{apps/*}' --filter '{packages/test-support/*}' --filter '{packages/util/util}' typecheck`；删除 `typecheck:contracts`。
- **决定**：不新写 `scripts/build-deps.mjs`，直接复用 `build:deps:dev`——它已经包含 `tsc -b` 之后 client / agent-host 的 esbuild 包、english-learning 的 prompts 拷贝和 runtime 的默认 harness；dev 启动和 CI 走同一条链，少一份要同步的清单。
- **验证**：
  - `--listFilesOnly` 不再包含任何 `src/test` 或 `*.test.ts`；清空 `packages/**/dist` 后 `tsc -b` 8.8 s 通过，`dist/` 下 `*.test.js` 为 0。
  - `pnpm build:deps` 热 5 s；`pnpm typecheck` 24 s（原 `typecheck:contracts` 32 s + `pnpm -r typecheck` 50 s）。
  - `pnpm --filter @actspace/agent-cli build && pnpm test:harness-recovery && pnpm test:agent-host:process && pnpm --filter @actspace/runtime test` 通过；runtime 33 个文件 10 s。

## 遇到的问题

- **问题**：`tsc -b` 第一次在本地跑出 `agent-service` 的 TS2307。
  - **原因**：见步骤 0；`pnpm build` 之所以能过，是因为 pnpm 按含 devDependencies 的拓扑序恰好先编了 `boot` / `composition` 等包，`tsc -b` 的 references 只来自 `dependencies`。
  - **应对**：修 `exclude`，而不是把 devDependencies 加进 references 图——测试文件本来就不该进 `dist/`。
- **问题**：本地 `vitest list` 一度只列出 0 个文件。
  - **原因**：只跑了 `tsc -b`，没跑 `build:deps` 的其余步骤，`english-learning/dist/prompts/*.md` 不存在导致 runtime 的模块加载失败。
  - **应对**：CI 各 job 统一用 `pnpm build:deps`，不要只调 `tsc -b`。

## 跳过或推迟的事项

- `构建` job 与 `release-package.sh` 复用 `tsc -b` 缓存：推迟，原因见计划的决策记录。
