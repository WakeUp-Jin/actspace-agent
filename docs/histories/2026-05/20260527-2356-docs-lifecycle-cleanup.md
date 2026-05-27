## [2026-05-27 23:56] | Task: docs lifecycle cleanup

### 🤖 Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 一起检查 `docs/` 是否有必要整理，并按 `AGENTS.md` 要求给出方案；方案获批后执行整理。

### 🛠 Changes Overview

**Scope:** `docs`

**Key Actions:**

- **[Plan lifecycle]**: 将已完成的 DeepSeek/Kimi、Grep/Glob、真实 Agent turn、Sidebar 对齐、Bash 工具/权限/UI、早期 UI bug fix 和 SplitView 计划从 `active/` 归档到 `completed/`。
- **[Active cleanup]**: 将 `settings-general-typography` 从 active plan 收敛为 `tech-debt-tracker.md` 条目，并交由 `20260527-frontend-interaction-polish.md` 承接。
- **[Navigation sync]**: 更新 `docs/exec-plans/README.md`、Bash 计划簇 README、design-docs 三个索引和 `docs/TODOLIST.md`，让当前入口与目录事实一致。
- **[Backlog trim]**: 将 `docs/TODOLIST.md` 从已完成细节档案瘦身为当前焦点、验收缺口、已完成入口和未来方向。

### 🧠 Design Intent (Why)

`AGENTS.md` 要求 `docs/` 是仓库知识的正式来源，`PLANS_GUIDE.md` 要求 `active/` 只保留可信的进行中计划。整理前，一批已完成计划仍留在 `active/`，而 `TODOLIST.md` 同时承载看板、实现记录和未来设想，容易让后续 Agent 误判下一步。此次只做生命周期和导航收口，不重写设计正文，也不追改 history 中记录当时状态的旧路径。

### 📁 Files Modified

- `docs/TODOLIST.md`
- `docs/exec-plans/README.md`
- `docs/exec-plans/tech-debt-tracker.md`
- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/README.md`
- `docs/design-docs/index.md`
- `docs/design-docs/agent-core/index.md`
- `docs/design-docs/frontend-ui/index.md`
- `docs/design-docs/agent-core/权限设计规则和原则.md`
- `docs/design-docs/agent-core/deepseek-kimi-hybrid-capabilities.md`
- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-bash-session-allowlist-plan.md`
- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-tool-pause-session-boundary-plan.md`
- `docs/exec-plans/completed/actspace-bash-tool-plan.md`
