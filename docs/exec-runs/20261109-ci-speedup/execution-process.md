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

### 步骤 2：P2 拆 job 与 tsc 缓存

- **操作**：
  - 新建 composite action `.github/actions/setup-workspace`：pnpm / Node / `pnpm install` + `actions/cache` 恢复 `packages/*/*/dist`。key 带 `github.sha`，`restore-keys` 退到同 lockfile 前缀；`workflow_dispatch` 跳过缓存。
  - `ci.yml`：`typecheck-test` 拆成 `lint-typecheck`、`test-process`、`test-packages`、`test-desktop`（2 分片），互不 `needs`。`check:desktop-build-graph` 放在 `build:deps` 之前。
  - 根 `package.json`：原 `test` 链拆成 `test:scripts`（根脚本与进程级测试）和 `test`（`test:scripts` + `pnpm -r test`），让 `test-process` 与 `test-packages` 各跑一半。
  - `scripts/check-action-pinning.sh`：跳过 `uses: ./...` 的本地 action，并把扫描范围扩到 `.github/actions`。
- **验证**：`./scripts/check-action-pinning.sh` 通过；`ci.yml`、`action.yml` 能被 YAML 解析；`pnpm lint`、`pnpm check:docs` 通过。

### 步骤 3：P3 desktop 分片与 main 走 node 环境

- **操作**：`apps/desktop/vitest.config.ts` 改为两个 project：`main`（node 环境）、`renderer`（jsdom）。`setupFiles` 保留在根配置由两个 project 继承。
- **验证**：本地 `vitest run --shard=1/2` 152 个文件 1309 用例 65 s、`--shard=2/2` 151 个文件 1589 用例 68 s，全部通过；全量不分片原为 136 s。main 单独跑从 24 s 降到 17.6 s，93 passed / 1 skipped 与之前一致。

## 遇到的问题

- **问题**：`tsc -b` 第一次在本地跑出 `agent-service` 的 TS2307。
  - **原因**：见步骤 0；`pnpm build` 之所以能过，是因为 pnpm 按含 devDependencies 的拓扑序恰好先编了 `boot` / `composition` 等包，`tsc -b` 的 references 只来自 `dependencies`。
  - **应对**：修 `exclude`，而不是把 devDependencies 加进 references 图——测试文件本来就不该进 `dist/`。
- **问题**：本地 `vitest list` 一度只列出 0 个文件。
  - **原因**：只跑了 `tsc -b`，没跑 `build:deps` 的其余步骤，`english-learning/dist/prompts/*.md` 不存在导致 runtime 的模块加载失败。
  - **应对**：CI 各 job 统一用 `pnpm build:deps`，不要只调 `tsc -b`。

### 步骤 4：第一次 CI 运行（run 42627494856）暴露的四个问题

- **现象与原因**：
  - `包测试` 失败：`pnpm -r --filter '!@actspace/desktop' test` 把 workspace 根包 `actspace` 也选进来，根的 `test` 又去跑 `pnpm -r test`，递归后在根脚本的进程级测试里找不到 `apps/cli/dist/cli.js`。本地复现：只带排除式 `--filter` 时 pnpm 选中 73 个项目（含根），再加 `--filter '!actspace'` 是 72 个。
  - `桌面端测试 (2/2)` 失败两例：`runtime-v2-output-reference-flow` 的 grep 返回 `failed`，是 `test-desktop` job 漏装 ripgrep；`workbench-responsive` 的「返回应用」按钮 1 s 内没出现，是 `SettingsPage` 走 `React.lazy`，分片后 vite 转译缓存冷，第一次打开设置超过 `findBy` 默认超时。
  - `Lint 与类型检查` 步骤 1:11 跑完，但 `Post Run setup-workspace`（缓存保存）跑了 5 min 以上没结束：`actions/cache` 的 `packages/**/dist` 跟进 `packages/*/*/node_modules` 里指向 pnpm store 的符号链接，本地统计匹配 16 880 个第三方 `dist`，而真正的包产物只有 67 个、都在 `packages/*/*/dist`。
- **应对**：`--filter '!actspace'`；`test-desktop` 补装 ripgrep；该测试文件两处等待改为 10 s 超时的 `findSettingsBackButton()`；缓存 `path` 改为 `packages/*/*/dist`。
- **首轮各 job 时长（缓存全 miss）**：`官网` 0:41、`Browser Bridge` 1:01、`构建` 2:43、`包测试` 2:54（含递归的多余工作）、`桌面端测试 (2/2)` 2:55、`Lint 与类型检查` 正常步骤 1:11。

## 跳过或推迟的事项

- `构建` job 与 `release-package.sh` 复用 `tsc -b` 缓存：推迟，原因见计划的决策记录。
