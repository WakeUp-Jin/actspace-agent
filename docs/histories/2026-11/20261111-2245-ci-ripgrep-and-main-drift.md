## [2026-11-11 22:45] | Task: 修复 PR #86 流水线失败

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI, worktree ../actspace-agent-typography, branch feat/typography-scale`

### 📥 User Query

> PR #86 流水线构建不通过，看看具体原因并修复。

### 🛠 Changes Overview

**Scope:** `.github/`、`scripts/contract-matrix/`、`docs/`

**Key Actions:**

- **[ripgrep]**: 新增 composite action `.github/actions/install-ripgrep`，从 ripgrep Release 下载 14.1.1 musl 静态包并校验 sha256；四处 `apt-get install ripgrep` 改用它。
- **[契约矩阵]**: `PACKAGE_PATHS` 补 `apps/promo-video/package.json`，重新生成 `agent-contract-matrix.generated.md`。
- **[markdownlint]**: `docs/design-docs/site-v6/README.md` 六张截图补 alt 文本。

### 🧠 Design Intent (Why)

PR 的 5 个失败 job 全部卡在「Install ripgrep」：runner 解析 `archive.ubuntu.com` 失败，apt 退出 100，重跑仍失败，同一时间其他分支也一样。改成从 GitHub Release 下载，和 checkout 走同一条网络路径，并用固定 sha256 守住供应链。另外 main 自身已有两处红：#82 新增 `apps/promo-video` 后契约矩阵登记表没跟上；site-v6 README 图片缺 alt。PR 跑的是合并后的代码，不修这两处 ripgrep 好了也会红。

### 📁 Files Modified

- `.github/actions/install-ripgrep/action.yml`（新增）
- `.github/workflows/base-checks.yml`、`.github/workflows/ci.yml`
- `scripts/contract-matrix/source-registry.mjs`
- `docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`
- `docs/design-docs/site-v6/README.md`
- `docs/CICD.md`
