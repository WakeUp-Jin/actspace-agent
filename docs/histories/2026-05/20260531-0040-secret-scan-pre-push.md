## [2026-05-31 00:40] | Task: Secret Scan Pre-Push

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### User Query

> 增加一个脚本检查仓库文件中的 key 等泄露问题，并在 push 前自动执行；扫描范围需要包含 logs。

### Changes Overview

**Scope:** repository scripts, git hooks, security docs

**Key Actions:**

- **[Secret Scan]**: 新增 `scripts/check-secrets.sh`，扫描仓库文本文件中的疑似 `sk-*`、Bearer token、Authorization/API key header 和非空 key 环境变量赋值，输出时脱敏命中内容。
- **[Pre-Push Hook]**: 新增 `.githooks/pre-push` 和 `scripts/install-git-hooks.sh`，通过 `core.hooksPath=.githooks` 启用 push 前扫描。
- **[Repo Hygiene]**: `scripts/check-repo-hygiene.sh` 接入密钥扫描，根 `package.json` 增加 `check:secrets` 与 `hooks:install` 命令。
- **[Hardcoded Key Removal]**: `scripts/probe-deepseek-web-search.js` 改为只从 `DEEPSEEK_API_KEY` 读取密钥，不再在脚本里写死真实 key。

### Design Intent (Why)

本轮排查确认 probe 脚本曾把真实 provider key 写入源码和 git 历史。新增扫描脚本和 pre-push hook 是为了把同类错误从人工记忆变成机械检查；扫描包含 `logs/`，因为本地排障日志同样可能误落鉴权信息。历史里已经暴露过的 key 仍必须在 provider 控制台撤销，代码清理只防止后续继续传播。

### Files Modified

- `scripts/check-secrets.sh`
- `scripts/install-git-hooks.sh`
- `.githooks/pre-push`
- `scripts/check-repo-hygiene.sh`
- `scripts/probe-deepseek-web-search.js`
- `package.json`
- `docs/SECURITY.md`
