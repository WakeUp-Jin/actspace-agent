## [2026-05-24 15:45] | Task: Implement tool permission scheduler foundation

### 🤖 Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 开始执行工具权限调度流程计划，并先落地第一个计划的后端调度地基。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`, `docs`

**Key Actions:**

- **[Permission Contract]**: 将工具权限结果收敛为 `allow`、`deny`、`ask` 三态，并把 `reason`、`summary`、`riskLevel`、`sanitizedArgs` 明确为 metadata。
- **[Tool Scheduler]**: 新增 `ToolScheduler`，集中处理权限检查、待审核结构化结果、工具执行、结果渲染和输出截断。
- **[Manager Integration]**: 让 `ToolManager.execute()` 委托给 `ToolScheduler`，保持 engine 和 desktop 协议暂不变化。
- **[Tests]**: 补充 allow、sanitized args、deny 不执行 handler、ask 生成 awaiting approval 的单测。
- **[Docs]**: 更新架构文档和 active plan 进度。

### 🧠 Design Intent (Why)

权限审核不应塞进 Bash 或前端组件里。先把工具权限判断与执行调度集中到 agent-core 的 ToolScheduler，可以让 Bash、未来写文件工具和网络工具共享同一套状态语义，并避免每个工具各自发明审批流程。

### 📁 Files Modified

- `packages/agent-core/src/internal-tools.ts`
- `packages/agent-core/src/tools/scheduler.ts`
- `packages/agent-core/src/tools/manager.ts`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/tools/test/manager.test.ts`
- `docs/ARCHITECTURE.md`
- `docs/exec-plans/active/actspace-tool-permission-scheduler-plan.md`
