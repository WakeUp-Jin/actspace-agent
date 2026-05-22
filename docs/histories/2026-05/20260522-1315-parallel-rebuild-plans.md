## [2026-05-22 13:15] | Task: create parallel rebuild plans

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 可以做三个计划吧，我来按照计划执行，但是这个计划最好不要强顺序依赖，我可以启动多个会话来执行计划，例如：一个计划一个会话，计划要写的详细一些，还有里面写好参考和需要前提读取的文档（用于初始化规则环境）

### Changes Overview

**Scope:** `docs/exec-plans`, `docs/histories`

**Key Actions:**

- **[Contract plan]**: 新增前后端契约与 mock fixtures 重建计划，聚焦 `SessionEvent`、`MessageBlock`、`ContextUsageSnapshot` 和 jsonl 恢复。
- **[UI plan]**: 新增前端高保真还原计划，按 `frontend-ui` 定稿图拆分左侧栏、Composer、Context popup、中间消息组件和右侧面板。
- **[Runtime plan]**: 新增 Agent 后端运行时重建计划，按 `llm-agent-dev` 的 V1 基础版边界规划 LLM、Context、Tools、Engine、Persistence。
- **[Plan index]**: 更新 `docs/exec-plans/README.md`，把三份并行计划加入 active 列表。

### Design Intent

当前前端和后端都需要重建，但直接强行串行会拖慢反馈。三份计划采用“契约层 / 前端高保真 / 后端运行时”并行拆分：每份都写清启动必读文档、边界、验收方式和与其他计划的接口，使新会话可以独立开工，同时通过共享契约避免再次出现 UI 与 runtime 脱节。

### Files Modified

- `docs/exec-plans/active/actspace-parallel-contracts-and-fixtures.md`
- `docs/exec-plans/active/actspace-parallel-ui-fidelity-rebuild.md`
- `docs/exec-plans/active/actspace-parallel-agent-runtime-rebuild.md`
- `docs/exec-plans/README.md`
- `docs/histories/2026-05/20260522-1315-parallel-rebuild-plans.md`
