## [2026-10-31 18:00] | Task: 修复会话运行稳定性

### 🤖 Execution Context

- **Agent ID**: `0912-runtime`
- **Base Model**: `Claude Opus 5.5`
- **Runtime**: `Claude Code`

### 📥 User Query

> 修复会话运行稳定性组的 4 个问题：停止或失败后再发消息进入暂停队列；步数打满后没有回复也没有提示；中转站连接超时被判为不可重试的未知错误；助手消息菜单里「分叉会话」不可用。

### 🛠 Changes Overview

**Scope:** `packages/agent-service`、`docs/design-docs/frontend`

**Key Actions:**

- **停止/失败后发送**：`SessionRunManager.submit` 在没有运行中的回合、队列暂停且没有遗留待发任务时，让 `TaskLedger.submit` 在同一次提交里写入 accept 与 resume；遗留旧消息时整条队列保持暂停。

- **步数与审批超时**：main/chat/子 Agent 预设步数上限改为 1000；审批等待改为 3 小时；审批超时返回「不要换个命令重试」的明确文案；main 最后一步也走无工具收尾轮；chat 投影新增中性的 `agent_run_notice` 步数上限提示（Desktop/Web 复用 status 块），CLI 失败诊断补 `STEP_LIMIT`。

### 🧠 Design Intent (Why)

暂停只应该拦住「停止前排着的旧消息」，不应该让用户之后的新消息也卡住。放在后端 submit 里，Web、Desktop 与 fork 出的会话行为一致。

### 📁 Files Modified

- `packages/agent-service/src/run-manager.ts`
- `packages/agent-service/src/task-ledger.ts`
- `packages/agent-service/src/test/run-manager.test.ts`
- `docs/design-docs/frontend/front-中间消息区规范.md`
- `packages/core/agent-loop/src/loop.ts`、`packages/core/agent/src/main-preset.ts`、`packages/subagent/src/preset.ts`
- `packages/tools/runtime/src/prepared-execution.ts`、`apps/desktop/src/main/approval-registry.ts`、`packages/runtime/src/harness/evolution-approval.ts`
- `packages/client/src/sessions/chat.ts`、`packages/shared/src/session.ts`、`packages/shared/src/session-selectors.ts`、`apps/cli/src/runtime-v2/run.ts`
- `docs/releases/feature-release-notes.md`
