## [2026-05-24 00:11] | Task: add dev log entrypoint

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 希望终端启动项目时把日志写入仓库根目录 `logs/`，日志不提交到 Git，并在 `AGENTS.md` 中说明供 Agent 排障读取。

### 🛠 Changes Overview

**Scope:** repository scripts and docs

**Key Actions:**

- **[Dev log command]**: 新增 `pnpm dev:log`，通过脚本启动现有 `pnpm dev` 并同步写入 `logs/dev-*.log`。
- **[Log retention]**: 启动时自动清理 `logs/` 中超过约 2 天的 `*.log`，并维护 `logs/latest-dev.log` 作为稳定读取入口。
- **[Docs alignment]**: 在 `AGENTS.md` 与 `docs/RELIABILITY.md` 中记录本地开发日志约定，并将根目录 `logs/` 加入 `.gitignore`。

### 🧠 Design Intent (Why)

终端 stdout/stderr 默认只存在当前进程输出里，Agent 后续无法稳定读取。用 `tee` 让开发者仍能实时看终端，同时把同一份输出落到本地 `logs/`，为启动失败、Electron 报错和 provider 调试提供可读入口。日志目录不入库，降低敏感信息进入 Git 的风险。

### 📁 Files Modified

- `package.json`
- `.gitignore`
- `scripts/dev-with-logs.sh`
- `AGENTS.md`
- `docs/RELIABILITY.md`
- `docs/QUALITY_SCORE.md`
