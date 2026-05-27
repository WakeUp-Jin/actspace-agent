## [2026-05-28 02:02] | Task: split frontend polish plan

### Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 将 `20260527-frontend-interaction-polish.md` 这个较大的前端交互与样式计划拆成 active 下的文件夹：原计划作为 index，并按 6 个实施步骤继续细分。

### Changes Overview

**Scope:** `docs`

**Key Actions:**

- **[Plan split]**: 将原 `docs/exec-plans/active/20260527-frontend-interaction-polish.md` 拆为 `docs/exec-plans/active/20260527-frontend-interaction-polish/README.md` 计划簇入口。
- **[Subplans]**: 新增 6 个子计划，分别覆盖 Composer 视觉与模型菜单、附件 IPC 与 turn 契约、Context 只读弹窗、Workspaces 与会话状态、Settings Typography、整体验证与收尾。
- **[Navigation sync]**: 更新 `docs/TODOLIST.md`、`docs/exec-plans/README.md`、`docs/exec-plans/tech-debt-tracker.md` 和相关 active plan 的旧链接。

### Design Intent (Why)

前端交互与样式补齐同时覆盖 Composer、附件、Context、Sidebar、Settings、Electron IPC 和收尾验证，单文件计划会让执行边界过宽。拆成目录计划簇后，每个子计划都能独立说明 owns 文件、依赖、验收和不做范围，后续可按阶段推进，也能减少多个 Agent 并行修改时的冲突。

### Files Modified

- `docs/exec-plans/active/20260527-frontend-interaction-polish/README.md`
- `docs/exec-plans/active/20260527-frontend-interaction-polish/01-composer-visual-and-model-menu.md`
- `docs/exec-plans/active/20260527-frontend-interaction-polish/02-attachments-ipc-and-turn-contract.md`
- `docs/exec-plans/active/20260527-frontend-interaction-polish/03-context-readonly-popover.md`
- `docs/exec-plans/active/20260527-frontend-interaction-polish/04-sidebar-workspaces-and-session-status.md`
- `docs/exec-plans/active/20260527-frontend-interaction-polish/05-settings-typography.md`
- `docs/exec-plans/active/20260527-frontend-interaction-polish/06-validation-docs-and-history.md`
- `docs/TODOLIST.md`
- `docs/exec-plans/README.md`
- `docs/exec-plans/tech-debt-tracker.md`
- `docs/exec-plans/active/20260527-agent-tool-capabilities.md`
- `docs/exec-plans/active/开发者手动验收-20260529-bugfix-foundation-manual-acceptance.md`
