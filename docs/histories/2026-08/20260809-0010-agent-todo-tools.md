## [2026-08-09 00:10] | Task: 实现 Agent Todo 工具 V1

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 执行已审核的 Agent Todo 工具 V1 设计与 execution plan，完成 `todo_read` / `todo_write`、AgentRun 级恢复、实时展示、测试和文档收尾。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、`docs`

**Key Actions:**

- **状态核心**：新增 AgentRun 级 TodoStore，支持完整替换、按 ID 合并、后端 ID、revision 和全量校验后原子提交。
- **工具链路**：注册 `todo_read` / `todo_write`，保持 Todo 与 TeamTask 分离，并把结构化结果贯通到 bridge、session JSONL 恢复和主 Agent prompt。
- **消息展示**：新增只读 TodoListBlock；实时与历史均按 Run 折叠为最新快照，不重复显示普通工具行。
- **回归保障**：覆盖状态不变量、失败不提交、工具注册、流式 partial args、精确 Run 恢复、selector 与 Desktop 实时替换。

### 🧠 Design Intent (Why)

Todo 是当前主 Agent 的局部执行状态，不是多 Agent 共享调度对象。实现以 `sessionId + agentRunId` 限定权威范围，复用既有 append-only 工具事件持久化事实，再用 `TodoUiPreview` 统一实时与恢复投影，避免额外数据库、IPC 或前端状态成为第二事实源。

本次变更包含可迁移的 append-only 事件状态投影模式，已沉淀到 `docs/learnings/2026-08/append-only-events-need-explicit-state-projections.md`。

### 📁 Files Modified

- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/agent-core/src/tools/tools/todo/`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/persistence/recovery.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/messages/TodoListBlock.tsx`
- `docs/design-docs/tool-system/agent-todo-tools.md`

### ✅ Validation

- Shared session transcript/selector：23 项通过。
- Agent Core Todo、manager、prompt、bridge、streaming 与 recovery 聚焦测试通过。
- Desktop TodoListBlock/ConversationView：11 项通过；App Todo 实时替换用例通过。
- 两条已知 App 侧栏状态测试单独运行通过，整文件运行仍有既有状态隔离失败。
- `pnpm typecheck`
- `pnpm build`（通过；保留既有 Vite 大 chunk 警告）
- `pnpm check:frontend-theme`
- `pnpm check:docs`
- `git diff --check`
- Browser 控制器无可用实例；Electron 39.8.10 两次在创建窗口前触发相同原生 SIGSEGV，因此真实视觉、点击和进程重启恢复仍需人工验收。
