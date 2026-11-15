# 代码库审查修复 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261110-codebase-review-fixes.md`
- **执行模式**：夜间（Cursor Cloud Agent，云端 Linux VM，用户离线）
- **开始时间**：2026-11-10 15:36（UTC，下同）
- **结束时间**：进行中，见最后一个步骤

## 执行时间线

### 步骤 0：准备

- **操作**：读 `docs/REPO_COLLAB_GUIDE.md`、`docs/PLANS_GUIDE.md`、`docs/HISTORY_GUIDE.md`、`CONTRIBUTING.md`、`docs/ARCHITECTURE.md`、`packages/README.md`、`docs/coding-standards/perf-memory-conventions.md`、`docs/CICD.md`；`git pull --ff-only origin main` 到 `2738ecd0`；`pnpm install --frozen-lockfile` 与 `pnpm build:deps` 通过（Node 22.23.4，pnpm 10.33.0）。
- **决定**：8 个 PR 排成一条线性栈，每个 PR 的 base 是上一个 PR 的分支，合并方式用 merge commit。理由写在计划的「决策记录」。
- **验证**：只读查询确认 `main` ruleset：1 个 approve、strict、必需检查只有 `仓库基础检查`；合并后自动删分支。

### 步骤 1：PR 1，CI 门禁（H2）

- **操作**：
  1. `main` 的 `仓库基础检查` 从 #78 起是红的（markdownlint MD045，6 张图没有 alt）。先补 alt，否则这批 PR 每一个都带着这个失败。
  2. `ci.yml` 去掉工作流级 `paths-ignore`，新增 `changes` 与 `ci-gate` 两个 job，八个工程 job 加 `needs` 与 job 级 `if`。
  3. 同步 `base-checks.yml` 的头注释与 `docs/CICD.md`。
  4. 写本计划、登记到 `docs/exec-plans/README.md`、建执行记录。
- **影响文件**：`docs/design-docs/site-v6/README.md`、`.github/workflows/ci.yml`、`.github/workflows/base-checks.yml`、`docs/CICD.md`、`docs/exec-plans/active/20261110-codebase-review-fixes.md`、`docs/exec-plans/README.md`、`docs/exec-runs/20261110-codebase-review-fixes/*`、`docs/histories/2026-11/20261110-1550-ci-gate-required-check.md`。
- **决定**：
  - `changes` 用 `git diff --name-only --no-renames -z HEAD^1 HEAD`。`-z` 是因为默认输出会给中文路径加引号和转义，`docs/*` 这类模式匹配不上；`--no-renames` 是因为开着改名检测时「代码文件改名成文档」只列出新路径，会被判成纯文档。
  - `ci-gate` 用 `if: always()` 而不是 `!cancelled()`：运行被取消时汇总 job 也要跑并失败，否则它的结果是 skipped，ruleset 会当成通过。
  - 纯文档的判定范围和原 `paths-ignore` 一字不差，不借机调整。
- **验证**：
  - 在临时仓库里造 merge commit 模拟五种改动，`changes` 的判断脚本输出：纯文档（含中文文件名、`docs/` 下的 JSON、issue 模板）`code=false`；代码、代码改名成文档、工作流文件、中文路径的代码文件都是 `code=true`。
  - YAML 解析后 9 个 job 的 `needs` / `if` 符合预期；`./scripts/check-action-pinning.sh` 通过。
  - `./scripts/ci.sh` 通过；`npx -y markdownlint-cli2@0.24.0 "**/*.md"` 0 条。
  - PR 上的实际运行结果见本步骤末尾的补充。

## 遇到的问题

- **问题**：`main` 的必需检查是红的。
  - **原因**：#78 新增的 `docs/design-docs/site-v6/README.md` 有 6 张图没有 alt，markdownlint MD045。
  - **应对**：作为 PR 1 的第一个提交修掉。

## 跳过或推迟的事项

- M4（每条命令起一个登录 shell）：需要 macOS 实机验证，云端只有 Linux；用户也还没有给出本机的耗时对比。不做。
- L3（`App.tsx` 拆分）：按已有计划 `20261110-app-assembly-split.md`，不在这批。

## 夜间模式补充记录

夜间模式没有人工审批环节，以下操作在交互模式下通常需要人工确认，在此记录：

- 推送分支并创建 PR：每个 PR 一个 `cursor/review-0N-*-e412` 分支。没有合并任何 PR，没有强制推送，没有改 GitHub 设置（Agent 的 GitHub 权限是只读加「创建 / 更新 PR」）。
- 修改 CI 工作流（`.github/workflows/ci.yml`）：改动只影响触发条件和新增两个不执行仓库代码的 job，没有改 permissions、没有新增 action、没有引入 secret。
