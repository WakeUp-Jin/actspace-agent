# 编辑提问重发 + 空闲发送不闪队列 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261107-edit-resend-rewind.md`
- **执行过程**：`docs/exec-runs/20261107-edit-resend-rewind/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成。自动化验证全部通过；Electron 实机（规范 §7 最后一条）待验收。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 提交带 `rewind`、`agentRunId` | `shared/src/runtime-v2/tasks.ts`、`agent-host/src/rpc.ts`、`fixed-renderer-ipc.ts`、`runtime-registry.ts` | 不新增 IPC 通道 |
| 回退并接纳新提问 | `agent-service/src/application.ts`、`rewind-cut.ts` | 拒绝忙碌会话；校验 `expectedThroughSeq`；停后台任务和子 Agent |
| 日志归档与前缀重写 | `session-persistence-jsonl/src/rewind.ts`、`storage.ts`、`session-storage` | 旧日志进 `recovery/` |
| `session/rewound` 事件 | `session-journal/src/core-codecs.ts` | 契约矩阵 +1 行 |
| 客户端 run id | `runtime/src/harness/managed-runs.ts` | Host 用它开始任务 |
| store 整体替换 | `client/src/sessions/session.ts`、`desktop-session-bridge.ts`、`web/src/sessions/session-observer.ts` | 回退后整页重载 |
| 空闲发送乐观显示 | `App.tsx`、`task-queue.ts`、`message-queue.ts`、`session-gateway.ts`、`web/src/sessions/composer-state.ts` | 不进托盘 |
| 原地编辑器 | `conversation/TurnPromptEditor.tsx`、`use-turn-editing.ts`、`turn-prompt-draft.ts`、`TurnView.tsx`、`ConversationView.tsx` | demo A1 |
| 提问条 | `conversation/PinnedTurnPrompt.tsx` | 去掉展开面板，点击回到提问并编辑 |

## 验证

- 根目录 `pnpm typecheck`、`pnpm test`（含各检查脚本和全部包测试）。
- 新增测试：
  - `turn-prompt-edit.test.tsx`（13 条）；
  - `app-message-queue.test.tsx` 新增 5 条：空闲发送、停止未开始的发送、编辑重发、回退被拒、另一窗口回退；
  - `live-run-store`、`pinned-turn-prompt`；
  - Web `composer-state`、`use-session-observation`；
  - 后端 `rewind-cut`、`session-rewrite`、`edit-resend-rewind`（五轮回退）以及存储和 RPC 测试。

## 待办

- Electron 实机：编辑态外观、变淡淡出、提问条点击、空闲发送不闪托盘、回退后重载、`recovery/` 里的归档。
