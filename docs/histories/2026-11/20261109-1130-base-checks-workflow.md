## [2026-11-09 11:30] | Task: 拆出不带路径过滤的 base-checks.yml，让 main ruleset 能配 required status check

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> https://github.com/WakeUp-Jin/actspace-agent/settings/rules/24842053 详细告诉我如何设置吧这个页面里面

### 🛠 Changes Overview

**Scope:** `.github/workflows/base-checks.yml`（新）、`.github/workflows/ci.yml`、`.github/workflows/docs.yml`（删）、`docs/CICD.md`、`docs/exec-runs/20261108-ci-pipelines/execution-summary.md`

**Key Actions:**

- 梳理 `main` ruleset 时发现它只有 `pull_request`（1 个审批）、`deletion`、`non_fast_forward` 三条规则，没有 required status checks——CI 红了并不拦合并。要补这条规则，需要有一个每个 PR 都会报告的 check。
- 现状里没有这样的 check：`ci.yml` 的 `repository-checks` 带 `paths-ignore`（纯文档 PR 不跑），`docs.yml` 的 `docs-checks` 带 `paths`（纯代码 PR 不跑），两者路径互斥。`docs/CICD.md` 和 #48 的执行摘要写的「把 `repository-checks` / `docs-checks` 都设为必需」是错的：GitHub 对未报告的 required check 一直显示 Expected，任一设为必需都会卡死另一类 PR。
- 两个 job 的步骤完全相同（装 ripgrep → `scripts/ci.sh` → markdownlint），所以合成一份 `base-checks.yml`：`pull_request` 不带任何路径过滤、`push: main`、手动。`ci.yml` 删掉 `repository-checks`，`docs.yml` 整个删除。纯文档 PR 的运行成本不变（原来也跑一遍同样的步骤）。
- `docs/CICD.md` 工作流表、分支保护段落、根命令段落、下一步推荐同步；#48 执行摘要的分支保护预期加更正说明。

### 🧠 Design Intent (Why)

- required status check 的语义是「这个名字的 check 必须报告成功」，不是「如果有就必须成功」。所以能设为必需的 job 必须对所有 PR 无条件触发；任何 `paths` / `paths-ignore` 都会让它在某类 PR 上失效。
- 没有用第三方 paths-filter action 在一个工作流里做条件跳过（skipped 的 job 对 required check 算通过），是为了不引入新的第三方 action；拆成独立工作流更直观，且这个 job 不需要 pnpm，本身就很轻。
- 审批规则本身没动：仓库有两位 write 协作者，他们的 PR 仍需审批。admin 自己的 PR 每次要 bypass 的问题，通过 ruleset 的 Bypass list 加 Repository admin 解决，这是仓库设置，不在代码里。

### 📁 Files Modified

- `.github/workflows/base-checks.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/docs.yml`
- `docs/CICD.md`
- `docs/exec-runs/20261108-ci-pipelines/execution-summary.md`
