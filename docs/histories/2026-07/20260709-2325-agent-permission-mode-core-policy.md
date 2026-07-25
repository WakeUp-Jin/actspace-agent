## [2026-07-09 23:25] | Task: 下沉评估权限模式策略

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### User Query

> 继续完成 Agent 评估执行计划。

### Changes Overview

**Scope:** `packages/agent-core`、`packages/agent-cli`、Agent 评估文档

**Key Actions:**

- **共享策略**: 在 `agent-core` 工具层新增 `PermissionMode` 和 `createApprovalGateForPermissionMode`，把 `yolo` 自动审批策略从 CLI 私有实现下沉为共享运行策略。
- **CLI 复用**: `agent-cli` 改为复用 `agent-core` 的权限策略导出，保留原有 `createApprovalGate` 兼容入口。
- **测试迁移**: 在 `agent-core` 增加权限模式测试，覆盖 `default`、`trusted`、工作区内 `yolo` 自动批准、工作区外拒绝和嵌套路径逃逸。
- **文档同步**: 更新 Agent 评估设计文档和执行计划，并同步外部评估仓库设计文档副本。

### Design Intent (Why)

评估模式需要和真实 Agent 运行层共用权限语义，不能让 CLI 独自维护一份审批逻辑。先把共享类型和 `yolo` 自动审批策略落到 `agent-core`，可以让评估 CLI、后续桌面端设置页和主 Agent runtime 逐步接入同一套策略。

### Files Modified

- `packages/agent-core/src/tools/permission-mode.ts`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/tools/test/permission-mode.test.ts`
- `packages/agent-cli/src/permission.ts`
- `packages/agent-cli/src/types.ts`
- `docs/design-docs/evaluation/agent-evaluation.md`
- `docs/exec-plans/active/20260708-agent-evaluation/README.md`
- `docs/histories/2026-07/20260709-2325-agent-permission-mode-core-policy.md`
