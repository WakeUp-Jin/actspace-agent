## [2026-06-03 23:39] | Task: Document Agent Skill Loading

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 先补充文档，一个是 skill 设计规范文档，放入到 design-docs 中，一个是执行计划，放入到 active 中去。

### 🛠 Changes Overview

**Scope:** docs

**Key Actions:**

- **[Design Doc]**: 新增 Agent Skill 设计与加载规范，明确 `.actspace/skills`、`.agents/skills`、`.claude/skills` 的扫描优先级、渐进式披露和 Skill 正文读取边界。
- **[Execution Plan]**: 新增 active plan，替代旧的项目级 `.agents/skills` summary-only 计划，收敛后续实现任务、验证方式和风险。
- **[Navigation]**: 更新架构与设计文档索引，并在旧 Skill plan 顶部标记已被新计划替代。

### 🧠 Design Intent (Why)

Skill 加载需要兼容当前主流生态，同时避免一次性注入所有 Skill 正文导致上下文膨胀。设计把 Skill 目录发现、catalog 注入和按需读取正文拆开，让后续实现可以小步推进，也方便其他 Agent 直接从 active plan 接手。

### 📁 Files Modified

- `docs/design-docs/tool-system/agent-skill-loading.md`
- `docs/exec-plans/completed/20260603-agent-skill-loading.md`
- `docs/design-docs/index.md`
- `docs/design-docs/agent-index.md`
- `docs/ARCHITECTURE.md`
- `docs/exec-plans/README.md`
- `docs/exec-plans/active/20260527-agent-tool-capabilities-breakdown/04-skill-backend-integration.md`
