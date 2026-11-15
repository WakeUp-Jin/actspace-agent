## [2026-11-10 15:50] | Task: ci.yml 加汇总检查，让工程 CI 可以设为合并必需

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> （代码库审查后的讨论）H2 我没懂什么意思，你可以说得再详细一些。……都可以按照你的建议去做吧。我希望是一步全部到位，可以多创建几个 PR，我明天早上起来去合并它们。

这是审查修复批次的第 1 个 PR，计划见 `docs/exec-plans/active/20261110-codebase-review-fixes.md`。

### 🛠 Changes Overview

**Scope:** `.github/workflows`、`docs/CICD.md`、`docs/exec-plans`、`docs/exec-runs`

**Key Actions:**

- **修 `main` 的红灯**：#78 新增的 `docs/design-docs/site-v6/README.md` 有 6 张图没有 alt，markdownlint MD045 让 `仓库基础检查` 在 `main` 上失败。补上 alt。
- **`ci.yml` 去掉工作流级 `paths-ignore`**：改成第一个 job `changes`（「变更范围」）比较 merge commit 的两个父提交，改动全部落在原忽略路径内时输出 `code=false`，八个工程 job 用 job 级 `if` 跳过。
- **新增 `ci-gate`（「CI 汇总」）**：`needs` 全部 job、`if: always()`，任何一个 failure 或 cancelled 就失败，skipped 算通过。它每个 PR 都报告，可以设为 required status check。
- **文档**：`docs/CICD.md` 新增「哪些 check 可以设为必需」一节，写明设置步骤、job 级跳过与工作流级过滤的区别、新增 job 时要改的三处；`base-checks.yml` 头注释同步。
- **立项**：审查修复批次的 execution plan、执行记录，登记到 `docs/exec-plans/README.md`。

### 🧠 Design Intent (Why)

必需检查原先只有 `仓库基础检查`，它不跑代码。lint、类型检查、测试、构建都在 `ci.yml`，而 `ci.yml` 带工作流级路径过滤：纯文档 PR 不触发它，GitHub 对没触发的必需检查一直显示 Expected，所以这些 job 一直不能设为必需，CI 红着也能合并。

GitHub 对两种「没跑」的处理不同：工作流没触发的必需检查卡住合并，job 级 `if` 跳过的必需检查算通过。把路径判断从工作流级挪到 job 级，再用一个始终运行的汇总 job 收拢结果，就得到一个每个 PR 都报告、又不拖慢纯文档 PR 的检查。

没有用第三方 paths-filter action，也没有调 GitHub API：前者新增一个供应链依赖，后者受 PR 文件列表接口的条数上限影响。`git diff` 的两个参数各防一个坑：不加 `-z` 时中文路径被加引号转义，`docs/*` 匹配不上；不加 `--no-renames` 时「代码文件改名成文档」只列出新路径。

把 `CI 汇总` 设为必需这一步要仓库管理员在 Rulesets 设置里操作，Agent 没有这个权限；步骤写在 `docs/CICD.md` 和执行摘要里。

### ✅ Verification

- 临时仓库里造 merge commit 模拟五种改动，`changes` 的判断脚本输出符合预期（纯文档含中文文件名为 `false`，代码、代码改名成文档、工作流文件、中文路径代码文件为 `true`）。
- `./scripts/check-action-pinning.sh`、`./scripts/ci.sh`、`npx -y markdownlint-cli2@0.24.0 "**/*.md"` 通过。

### 📁 Files Modified

- `.github/workflows/ci.yml`
- `.github/workflows/base-checks.yml`
- `docs/CICD.md`
- `docs/design-docs/site-v6/README.md`
- `docs/exec-plans/active/20261110-codebase-review-fixes.md`
- `docs/exec-plans/README.md`
- `docs/exec-runs/20261110-codebase-review-fixes/execution-process.md`
- `docs/exec-runs/20261110-codebase-review-fixes/execution-summary.md`
