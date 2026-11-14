# CI 提速：类型检查与测试拆 job 并行 + tsc -b 增量缓存

## 目标

`ci.yml` 的「类型检查与测试」job 从 9–13 min 降到 5 min 以内：把串行的 typecheck → build → test 拆成互不依赖的并行 job，用 `tsc -b` 的 project-references 图代替逐包 `tsc -p` 并让 `.tsbuildinfo` 跨运行缓存，desktop 的 vitest 分片到多台 runner。

## 范围

- 包含：
  - `tsconfig.package.json` 的 `exclude` 修正，让 `tsc -b tsconfig.desktop-deps.json` 在 CI 能干净通过。
  - 根 `package.json`：新增 `build:deps`（走 desktop 的 `build:deps:dev` 链），`typecheck` 改为 `build:deps` + 只对 apps 和两个图外包跑 `typecheck`。
  - `.github/workflows/ci.yml`：`typecheck-test` 拆成 `lint-typecheck`、`test-process`、`test-packages`、`test-desktop`（分片矩阵）；共用一个 composite action 做 install + 缓存恢复 + `build:deps`。
  - `apps/desktop/vitest.config.ts`：`src/main/**` 默认 node 环境。
  - `docs/CICD.md`、`CONTRIBUTING.md` 同步。
- 不包含：
  - `构建` job 与 `release-package.sh` 的构建链（`pnpm build` → desktop `build:deps` 仍走逐包 `tsc -p`）。原因见决策记录。
  - 测试本身的提速（desktop 单测 CPU 时间 6.5 min 不变，只是分摊到多台 runner）。
  - 改 `base-checks.yml`、`site`、`browser-bridge` job。

## 背景

- 相关文档：`docs/CICD.md`、`docs/exec-plans/completed/20261108-ci-pipelines.md`（上一轮 CI 拆分）、`docs/histories/2026-11/20261109-1130-base-checks-workflow.md`。
- 相关代码路径：`.github/workflows/ci.yml`、`package.json`、`tsconfig.package.json`、`tsconfig.desktop-deps.json`、`scripts/generate-desktop-build-graph.mjs`、`apps/desktop/package.json`（`build:deps:dev`）、`apps/desktop/vitest.config.ts`。
- 基线（`main` 最近两次运行，4 vCPU runner）：
  - Typecheck 1:47–2:33：`typecheck:contracts` 逐包全量 `tsc -p` 约 1 min，再起 73 个 `tsc --noEmit` 进程。
  - Build Agent CLI 0:43–1:01：同一批包再编一遍。
  - Test 6:16–8:54：根目录 `node --test` 串行约 1.5 min；`pnpm -r test` 中 desktop 拓扑序最后，单独跑 137 s，和 runtime / cli 的 vitest 撞车时 279 s（`pnpm -r` 4 并发 × 每个 vitest 3 worker 超订 4 vCPU）。
  - 本地实测：`tsc -b` 冷 9 s、无变更 0.5 s、改 `shared` 公开类型后增量 6 s；逐包 `pnpm --filter 'runtime...' --filter 'client...' build` 冷 32 s。`pnpm -r typecheck` 50 s，只跑 apps + 图外包 18 s。desktop vitest 单独 136 s，其中 main 24 s、renderer 111 s。
- 已知约束：
  - `tsconfig.package.json` 的 `exclude: ["src/**/test", "tests"]` 相对根目录解析成 `../../../src/**/test`，对所有包都是空操作；没自己写 `exclude` 的 10 个包把测试编进了 `dist/`，测试 import 的 devDependencies 不在 references 图里，所以 `tsc -b` 在 `agent-service` 报 TS2307。
  - `@actspace/test-support`、`@actspace/util` 没有被任何包依赖，不在 `tsconfig.desktop-deps.json` 图里，要单独 `typecheck`。
  - `build:deps:dev` 会先重新生成 `tsconfig.build.json`，所以 `check:desktop-build-graph` 必须排在它前面跑才有意义。
  - GitHub Actions 缓存：PR 分支只能读自己和 base 分支的缓存，`main` 的缓存所有 PR 可读。

## 风险

- 风险：`exclude` 修正后，原来被误编进去的 5 个包（`agent-service`、`runtime`、`english-learning`、`side-chat`、`session-projection-cache`）的测试文件不再被 `tsc` 类型检查。缓解：和已经写了 `exclude` 的其余 50 多个包行为一致，vitest 仍会执行它们；记入 history。
- 风险：`.tsbuildinfo` 从缓存恢复后增量结果和全量不一致。缓解：`tsc -b` 用源码 hash 判定过期，`workflow_dispatch` 时不恢复缓存，留一个强制全量的入口。
- 风险：vitest `--shard` 按文件数切，renderer 测试更重，分片不均。缓解：先两片看数据，不均再调三片。
- 风险：main 进程测试改成默认 node 环境后，个别依赖 `window` 的 main 测试会失败。缓解：本地跑一遍 `vitest run src/main`，失败的加 `@vitest-environment jsdom`。

## 里程碑

1. P1：`exclude` 修正；根 `build:deps` / `typecheck` 改用 `tsc -b`；本地 `pnpm typecheck`、进程级测试、runtime 测试通过。
2. P2：`ci.yml` 拆四个 job + composite action + `actions/cache`。
3. P3：desktop 分片矩阵 + main 测试 node 环境。
4. 验证：推送后看一次完整 CI，记录各 job 时长；文档同步；plan 移到 `completed/`。

## 验证方式

- 命令：
  - `pnpm --dir apps/desktop exec tsc -p tsconfig.json --showConfig`（任一包）里 `exclude` 为 `../../../**/test`；`pnpm --dir packages/core/agent-service exec tsc -p tsconfig.json --listFilesOnly | grep src/test` 为空。
  - 清空 `packages/**/dist` 后 `pnpm build:deps` 退出码 0；`pnpm typecheck` 退出码 0。
  - `pnpm --filter @actspace/agent-cli build && pnpm test:agent-host:process && pnpm test:harness-recovery` 通过（证明 `tsc -b` 产物能支撑进程级测试）。
  - `pnpm --filter @actspace/desktop exec vitest run --shard=1/2` 与 `--shard=2/2` 都通过。
  - `pnpm lint`、`pnpm check:docs`、`./scripts/check-action-pinning.sh`。
- 手工检查：PR 的 CI 里 `lint-typecheck`、`test-process`、`test-packages`、`test-desktop (1/2)`、`test-desktop (2/2)`、`构建` 全绿，最长的 job 不超过 5 min；第二次推送时 `build:deps` 步骤明显短于第一次（缓存命中）。

## 进度记录

- [x] P1 `exclude` 修正、根脚本切到 `tsc -b`。
- [x] P2 `ci.yml` 拆 job + 缓存。
- [x] P3 desktop 分片 + node 环境（本地两分片 65 s / 68 s，全部通过）。
- [x] 推送后记录 CI 各 job 时长。2026-11-13 补记，取 #70 合入后、2026-11-11 至 11-13 仓库最近 50 次工作流运行（其中 `ci.yml` 14 次）的中位数：`Lint 与类型检查` 69 s、`仓库脚本与进程级测试` 119 s、`包测试` 131 s、`桌面端测试` 每片 138 s（p90 166 s）、`构建` 182 s（`main` 上带打包冒烟约 250 s）；缓存命中时 `build:deps` 约 8 s。PR 上整个 `ci.yml` 约 3 min，目标达成。数据来源和后续提速见 `docs/exec-plans/completed/20261113-ci-speedup-round2.md`。
- [x] 文档同步，plan 移到 `completed/`（2026-11-13，随第二轮提速一起收尾）。

## 决策记录

- 2026-11-09：用 `actions/cache` 缓存 `packages/*/*/dist`（含 `.tsbuildinfo`，约 16 MB）而不是用 artifact 在 job 间传递产物：各 job 不加 `needs`，都从 install 开始并行，关键路径只取最长的那个 job；缓存 miss 时每个 job 自己 `tsc -b` 冷编一次（9 s 级），比等上游 job 再下载 artifact 便宜。
- 2026-11-09：根 `typecheck` 不再跑 `pnpm -r typecheck`。`tsc -b` 已经用每个包自己的 `tsconfig.json` 全量检查过 packages，再起 60 多个 `tsc --noEmit` 是重复劳动；只补 apps 和图外的 `test-support`、`util`。
- 2026-11-09：`构建` job 和 `release-package.sh` 这一轮不动。`pnpm build` 里 desktop 的 `build:deps` 走逐包 `tsc -p`，还带 `context-compaction` 的 license 拷贝和 `clean`，是发布链路；`构建` job 2:37 本来就不是关键路径，收益小于改发布链的风险。登记到 `docs/exec-plans/tech-debt-tracker.md`。

## 执行模式

- **交互模式**：用户在线审批，Cloud Agent 在 PR 分支推进。

## 执行文档

- `docs/exec-runs/20261109-ci-speedup/execution-process.md`
- `docs/exec-runs/20261109-ci-speedup/execution-summary.md`
