# CI 提速：拆 job 并行 + tsc -b 增量缓存 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261109-ci-speedup.md`
- **执行过程**：`docs/exec-runs/20261109-ci-speedup/execution-process.md`
- **执行模式**：交互
- **执行结果**：部分完成——代码与文档已落地并本地验证；修复首轮 CI 暴露的问题后的第二轮 CI 时长待 PR #70 的下一次运行确认。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| `exclude` 修正，测试不再编进 `dist/` | `tsconfig.package.json`、`packages/client/client/tsconfig.json`、`packages/session/session-persistence-jsonl/tsconfig.json` | 原 `src/**/test` 相对根目录解析成 `../../../src/**/test`，对所有包都是空操作；`tsc -b` 因测试 import 的 devDependencies 不在 references 图里而报 TS2307，vitest 4 还把 `dist/` 里的测试跑了第二遍。 |
| 根脚本切到 `tsc -b` | `package.json` | 新增 `build:deps`（复用 desktop `build:deps:dev`）、`test:scripts`；`typecheck` 改为 `build:deps` + 只对 apps 与图外包 `tsc --noEmit`；删除 `typecheck:contracts`。本地 82 s → 24 s。 |
| 四个并行 job + composite action + 缓存 | `.github/workflows/ci.yml`、`.github/actions/setup-workspace/action.yml`、`scripts/check-action-pinning.sh` | `typecheck-test` 拆为 `lint-typecheck` / `test-process` / `test-packages` / `test-desktop`(2 分片)，都从 `setup-workspace` 开始：装依赖并用 `actions/cache` 恢复 `packages/*/*/dist`。pin 检查脚本跳过本地 `uses: ./`。 |
| desktop 测试拆 project 并分片 | `apps/desktop/vitest.config.ts`、`apps/desktop/src/renderer/test/workbench-responsive.test.tsx` | `main` 用 node 环境、`renderer` 用 jsdom；CI 按 `--shard=N/2` 切两台。懒加载的 `SettingsPage` 等待放宽到 10 s。 |
| 文档同步 | `docs/CICD.md`、`docs/exec-plans/tech-debt-tracker.md` | 工作流表、分支保护段、根命令列表、各 job 说明；`build` job / release 链复用缓存登记为技术债。 |

## 人工验证指引

### 必须验证

1. **PR #70 的 CI 全绿且最长 job ≤ 5 min**
   - 验证方式：打开 PR 的 Checks 页，看 `Lint 与类型检查`、`仓库脚本与进程级测试`、`包测试`、`桌面端测试 (1/2)`、`桌面端测试 (2/2)`、`构建` 的时长。
   - 预期结果：全部 success；首轮（缓存 miss）里 `构建` 2:43、`包测试` 2:54、`桌面端测试 (2/2)` 2:55、`Lint 与类型检查` 1:11，第二轮应持平或更短。

2. **缓存命中后 `build:deps` 明显变短**
   - 验证方式：对比同一 PR 连续两次运行里 `Build workspace dependencies` 步骤时长，以及 `Post Run ./.github/actions/setup-workspace` 是否在 1 min 内完成。
   - 预期结果：第二次 `tsc -b` 只重编改动过的包；post 阶段保存缓存不再卡住（首轮因 `packages/**/dist` 跟进 `node_modules` 符号链接卡了 5 min 以上，已改为 `packages/*/*/dist`）。

### 建议验证

1. **本地 dev 链路不受影响**
   - 验证方式：`pnpm dev:log` 启动桌面端。
   - 预期结果：`build:deps:dev` 行为未改（本轮只是让根脚本复用它），正常启动。

## Agent 已完成的验证

- `pnpm --dir packages/core/agent-service exec tsc -p tsconfig.json --listFilesOnly | grep src/test` 为空；清空 `packages/**/dist` 后 `tsc -b` 8.8 s 通过，`dist/` 下 `*.test.js` 为 0。
- `pnpm build:deps` 热 5 s；`pnpm typecheck` 24 s 通过。
- `pnpm --filter @actspace/agent-cli build && pnpm test:harness-recovery && pnpm test:agent-host:process && pnpm --filter @actspace/runtime test` 通过；runtime 从 66 个文件 37 s 降到 33 个文件 10 s。
- desktop `vitest run --shard=1/2`（152 文件 / 1309 用例）65 s、`--shard=2/2`（151 文件 / 1589 用例）68 s 全过；`src/main` 单独 24 s → 17.6 s，93 passed / 1 skipped 不变。
- `pnpm lint`、`pnpm check:docs`、`pnpm check:desktop-build-graph`、`./scripts/check-action-pinning.sh` 通过；`ci.yml` / `action.yml` 能被 YAML 解析。
- 首轮 CI（run 42627494856）暴露的四个问题（根包递归、desktop job 缺 ripgrep、缓存路径匹配 `node_modules`、懒加载超时）已修复并本地复现 / 复验，见执行过程步骤 4。

## 已知风险和遗留事项

- `actions/cache` 的 key 带 commit SHA，每次运行都会存一份约 16 MB 的新缓存；仓库 10 GB 配额下由 GitHub 按 LRU 自动淘汰，暂不需要清理。
- `build` job 与 `release-package.sh` 仍走逐包 build，未接缓存；已登记 `docs/exec-plans/tech-debt-tracker.md`「CI 与工程化遗留」。
- `test-packages` 用 `pnpm -r` 跑 70 多个包，默认 4 并发；若将来某个包的测试明显变长，可以再按包拆分片。

## 后续建议

- 第二轮 CI 出结果后，把各 job 时长补进计划的进度记录，然后把结果写进 history，删除计划和本目录。
