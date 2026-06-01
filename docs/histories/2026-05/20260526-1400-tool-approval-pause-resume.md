## [2026-05-26 14:00] | Task: 实现工具审核暂停恢复流程

### Execution Context

- **Runtime**: Cursor Agent

### User Query

> 继续 Bash 工具任务，重点在工具执行的权限调度。工具执行需要审核时，将用户审核信息传递过来使工具继续执行。希望持久化 pending 状态，支持会话切换期间保持 pending，切回后点击审核继续执行。

### Changes Overview

**Scope:** `@actspace/agent-core`, `@actspace/shared`, `@actspace/desktop`

**Key Actions:**

- **ApprovalGate 接口**：在 ToolScheduler 中定义 ApprovalGate 接口，将 `ask` 从立即返回 cancelled 改为通过 Promise 异步等待用户决策。
- **PendingApprovalRegistry**：在 desktop/main 中实现基于内存 Map 的 pending 注册表，支持超时、幂等决策和批量过期。
- **AgentEvent/RuntimeStreamEvent 扩展**：新增 `tool_approval_required` 和 `tool_approval_resolved` 事件，bridge.ts 完成映射。
- **IPC 通道**：新增 `approval:decide` 和 `approval:list-pending`，preload 暴露 `submitApproval` 和 `listPendingApprovals`。
- **完整接通**：agent-turn.ts → buildAgentConfig → ToolManagerConfig → ToolScheduler → ApprovalGate 链路接通。
- **Bash executor 重构**：消除重复的 spawn 逻辑，改用共享的 `runProcess` 函数。
- **审核流程单测**：9 个新测试覆盖 approve/deny/timeout/allow_similar/幂等/无 gate 退回等场景。

### Design Intent (Why)

工具审核暂停的核心问题是：如何在不阻塞 Node.js 事件循环的前提下，让 Agent loop 等待一个不确定时间后才到达的用户决策。

采用 Promise resolve 分离模式：`waitForDecision` 创建 Promise 并把 resolve 存到 Map，scheduler await 这个 Promise 暂停。用户通过 IPC 触发 registry.decide() 调用 resolve，scheduler 恢复执行。

这个模式让 scheduler（agent-core）不依赖 Electron，registry（desktop）负责 IPC 和超时管理，两者通过 ApprovalGate 接口解耦。

### Files Modified

- `packages/agent-core/src/tools/scheduler.ts`
- `packages/agent-core/src/tools/manager.ts`
- `packages/agent-core/src/tools/types.ts`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/engine/types.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/tools/tools/bash/executor.ts`
- `packages/agent-core/src/tools/test/scheduler-approval.test.ts`（新增）
- `packages/shared/src/session.ts`
- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/approval-registry.ts`（新增）
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/agent-turn.ts`
- `packages/desktop/src/preload/index.ts`
- `docs/design-docs/agent-tool-approval-pause-resume.md`（新增）
- `docs/design-docs/index.md`
- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/README.md`
- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-tool-permission-scheduler-plan.md`
- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-tool-pause-session-boundary-plan.md`
- `docs/TODOLIST.md`
- `docs/learnings/2026-05/promise-resolve-separation-for-async-pause.md`（新增）

---

## [2026-05-26 17:10] | Follow-up: 修复前端审核面板不弹出

### User Query

> 这里怎么没有弹出审核框，前端这边，怎么回事看看吧。

### 问题诊断

执行 `mkdir --help` 时 bash 进入 ask 但前端没显示审核面板，原因是首版接通后端时漏了三处前端串联：

1. **toolCallId 串不起来**：`ToolScheduler` 创建 `ApprovalRequest` 时没拿到 LLM 的 `tool_call_id`，前端就算监听新事件也找不到对应已显示的工具行。
2. **前端没监听新事件**：`App.tsx` 的 `handleStreamEvent` 完全没处理 `tool_approval_required`/`tool_approval_resolved`。
3. **审核按钮没绑 IPC**：`BashRunBlock` 的 Skip/Allow/Run 按钮没有 onClick handler。

### Key Actions

- **传递 toolCallId**：`ToolManager.execute(toolName, args, toolCallId?)` → `ToolScheduler.execute(..., toolCallId?)` → `createApprovalRequest(..., toolCallId?)`，`loop.ts` 调用时传 `tc.id`。
- **前端事件处理**：`tool_approval_required` 在已存在的 tool entry 上打 pending 标记并存 requestId/reason；`tool_approval_resolved` 清掉 pending。
- **BashPreview 增加 `approvalRequestId`**：streaming 状态下的 bash block 携带 requestId 给审核面板。
- **BashApprovalBlock 接 IPC**：Skip → `deny`，Allow → `allow_similar`，Run → `approve_once`，调 `window.actspace.submitApproval`。
- **修复历史小 bug**：删掉 `tool_finished` case 中访问不存在 `event.preview` 字段的两行死代码。
- **测试 mock 补全**：6 处 `window.actspace` mock 补上 `submitApproval` / `listPendingApprovals`。

### Files Modified

- `packages/agent-core/src/tools/manager.ts`
- `packages/agent-core/src/tools/scheduler.ts`
- `packages/agent-core/src/engine/loop.ts`
- `packages/shared/src/session.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/messages/BashRunBlock.tsx`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`

---

## [2026-05-26 17:30] | Follow-up: 增加 bash always-ask 测试开关

### User Query

> bash 工具哪些命令会弹出窗口？如果想让 bash 工具只要执行就弹出窗口（测试阶段用），修改方便吗？

### Key Actions

- **新增 env**：`ACTSPACE_BASH_ALWAYS_ASK`（bool，默认 false），注册到 `env.ts` schema。
- **接入 `classifyCommand`**：开启时所有命令直接走 ask 分支，仍保留所有 hard reject（控制字符、危险删除等）。
- **`.env.example`**：补充开关说明，标注"测试完务必删除或改回 0"。
- **单测**：覆盖 always-ask 强制走 ask、always-ask 仍然 deny `rm -rf /` 两个场景。

### Design Intent

测试阶段需要每条命令都弹审核面板验证 UI/IPC 流程，但又要避免污染生产逻辑。env 开关是最小入侵：默认关闭，影响范围只在 `classifyCommand` 的一个 if，硬拒绝路径完全不动。

### Files Modified

- `packages/agent-core/src/env.ts`
- `packages/agent-core/src/tools/tools/bash/permissions.ts`
- `packages/agent-core/src/tools/test/bash.test.ts`
- `.env.example`
