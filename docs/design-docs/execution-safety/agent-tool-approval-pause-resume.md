# 工具审核暂停恢复设计

## 当前状态

状态：已实现首版。ApprovalGate、PendingApprovalRegistry、IPC 通道、单测已完成。待 Electron 手动验收。

相关实施计划：`docs/exec-plans/active/Bash工具和工具权限调度开发计划/`

## 问题

当工具权限检查返回 `ask` 时，Agent loop 需要暂停当前工具调用，等待用户审核决策。用户可能在审核期间切换到其他会话，稍后再返回批准或拒绝。

核心挑战：如何暂停 Agent loop 而不阻塞 Node.js 事件循环，同时支持会话切换和超时。

## 设计决策

### Promise-based 暂停

使用 JavaScript Promise 的 resolve 函数分离来实现暂停：

1. `ToolScheduler` 遇到 `ask` 时，调用 `ApprovalGate.waitForDecision(request)`。
2. `waitForDecision` 创建一个 Promise，把 `resolve` 函数存到 `PendingApprovalRegistry` 的内存 Map 中。
3. `ToolScheduler` await 这个 Promise，agent loop 暂停在此处。
4. 用户通过 UI 做出决策 → IPC 到达 main → registry 找到 resolve 并调用 → Promise resolve → scheduler 恢复。

优势：
- 不阻塞 Node.js 事件循环，IPC 和 UI 正常运转。
- 不需要真正的系统进程暂停/恢复。
- 暂停的是工具调度，不是已运行的 shell 进程（executor 只在 approve 后启动）。

### 分层职责

| 层 | 位置 | 职责 |
|---|---|---|
| ApprovalGate | agent-core scheduler | 接口契约。scheduler 只知道"调用它就能等到结果"。 |
| PendingApprovalRegistry | desktop/main | 实现 ApprovalGate。管理 pending Map、超时、幂等、批量过期。 |
| IPC channels | desktop main/preload | `approval:decide` 和 `approval:list-pending`，连接 renderer 和 registry。 |
| RuntimeStreamEvent | shared/session | `tool_approval_required` 和 `tool_approval_resolved`，通知前端。 |

### 会话边界规则

- **会话切换**：pending approval 留在 main 进程内存中，定时器继续。切回时 renderer 调 `approval:list-pending` 恢复审核面板。
- **App 重启**：registry 在内存中丢失。Session 文件中的 pending 恢复为 expired 显示。不从磁盘恢复执行。
- **超时**：默认 5 分钟。超时后自动 resolve 为 `{ decision: "timeout" }`，scheduler 返回 cancelled。
- **幂等**：同一 requestId 只能 decide 一次。重复调用返回 `{ ok: false, reason: "not_found_or_already_resolved" }`。

### 被排除的方案

- 不使用 `while(true)` 轮询等待决策（会阻塞事件循环）。
- 不让 ToolScheduler 直接依赖 Electron IPC（保持 agent-core 无 Electron 依赖）。
- 不在 renderer 中执行工具或持有 resolve 函数（安全边界）。
- 首版不做磁盘持久化恢复执行（安全优先）。

## 相关文件

- `packages/agent-core/src/tools/scheduler.ts` — ApprovalGate 接口和 ToolScheduler 改造
- `packages/desktop/src/main/approval-registry.ts` — PendingApprovalRegistry 实现
- `packages/agent-core/src/engine/types.ts` — AgentEvent 扩展
- `packages/shared/src/session.ts` — RuntimeStreamEvent 扩展
- `packages/shared/src/ipc.ts` — IPC 类型
- `packages/desktop/src/main/index.ts` — IPC handler 和 registry 单例
- `packages/desktop/src/preload/index.ts` — renderer API 暴露
- `packages/agent-core/src/engine/bridge.ts` — 事件映射
- `packages/agent-core/src/engine/create-agent-deps.ts` — 配置链路
- `packages/desktop/src/main/agent-run.ts` — 接通 registry

## 维护规则

- 新增审核相关的工具（如 Write、Edit），复用 ApprovalGate 接口，不另起审核流程。
- 修改超时策略、幂等行为或会话恢复规则时，同步更新本文档。
- 如果未来需要磁盘持久化恢复，应在本文档记录决策和迁移方案。
