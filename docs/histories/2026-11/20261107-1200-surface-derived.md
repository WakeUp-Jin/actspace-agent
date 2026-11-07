## [2026-11-07 12:00] | Task: 对话内容只存一份：surface 只做标记，节点从 data 推出

### 🤖 Execution Context

- **Agent ID**: `main`
- **Base Model**: `Claude Opus 5.5`
- **Runtime**: `Claude Code`（主仓库目录，分支 `fix/bug-batch-1104`）

### 📥 User Query

> 我觉得第一个问题可以啊，我们已经讨论过了，就按照你的建议来做……第一点可以做了，等你第一点做完之后，我们再来讨论第二、第三点。

### 🛠 Changes Overview

**Scope:** `packages/util/shared`、`packages/session/*`、`packages/core/*`、`packages/client/client`、`packages/approval/auto-review`、`apps/desktop`、`apps/cli`（测试）、`docs/design-docs`、`docs/exec-plans`

**Key Actions:**

- **格式**：envelope 的 `surface` 只剩 `{ kind: "append" }` 或 `{ kind: "replace", start, end, sourceEventSeqs }`。对话节点由 `@actspace/shared/runtime-v2` 的 `surfaceNode(event)` 从 `data` 推出，按事件对象缓存。
  - `user/message`、`assistant/message`、Inbox claim 取 `data.content`；
  - `tool/result` 取 `modelOutput`，`isError = status !== "completed"`；
  - `tool/recovery-outcome` 取 `data.content`；
  - `surface/replaced` 取 `data.node`。
- **校验**：带 `node` 的 surface 按「旧格式」拒绝；带 surface 但推不出节点的事件被拒绝；`surface/replaced` 的 `data.node` 和 `tool/recovery-outcome` 的 `data.content` 由 codec 校验。旧会话不兼容。
- **写入方**：agent-loop、task-ledger、inbox claim、崩溃恢复、压缩事务改成新格式。
- **读取方**：估算、引用校验、会话控制器、client 对话投影、自动审批上下文、转写、用量目录、artifact 引用查找、轨迹 builder、渲染进程 mock 改为调用 `surfaceNode`。
- **测试**：约 50 个测试和 mock 文件转成新格式（一次性 AST 脚本加手工修补）。新增两个测试：
  - `surface-node.test.ts`；
  - desktop `surface-derived-equivalence.test.ts`：用 run7 父会话加上改前代码写出的恢复与压缩事务做 fixture，比较五种读取结果，与改前代码的 golden 深度相等。
- **顺带**：CLI 测试里关于 `assistant/chunk` 的过期断言（c6538dd7 之后正文流不写日志）一并更新。

### 🧠 Design Intent (Why)

run5 的日志里，每条工具结果、用户消息和回复都在 `data` 和 `surface.node` 里各存一份：写盘、整份读取、校验、IPC 推送都按两份算，单条工具结果的可用上限也因此减半。DSH 的做法是 surface 只做标记、节点按事件类型推导，这里照搬。推导函数只依赖 `{ type, data, surface }`，所以主进程、client 和渲染进程用的是同一份规则。

### 📁 Files Modified

- `packages/util/shared/src/runtime-v2/session-events.ts`、`context-estimate.ts`、`composer-reference-validation.ts`、`src/test/surface-node.test.ts`（新增）
- `packages/session/session-journal/src/`：`event-envelope.ts`、`invariant-validator.ts`、`core-codecs.ts`、`surface.ts`、`compaction.ts` 及测试
- `packages/core/agent-loop/src/loop.ts`、`agent-service/src/task-ledger.ts`、`agent/src/inbox.ts`、`runtime/src/session/session-controller.ts`
- `packages/session/session-persistence/src/recovery.ts`、`session-transcript/src/render.ts`
- `packages/client/client/src/sessions/chat.ts`、`session.ts`、`packages/approval/auto-review/src/context.ts`
- `apps/desktop/src/main/runtime-v2/runtime-registry.ts`、`usage-catalog-projection.ts`、`renderer/trajectory/builder.ts`、`renderer/mock/mock-db.ts`
- `apps/desktop/src/main/test/surface-derived-equivalence.test.ts` 和 `fixtures/surface-derived/`（新增）
- `docs/design-docs/agent-plugin-runtime/agent-spec-surface-derived.md`、`agent-spec-dsh-event-model.md`、`agent-spec-session-format-v1.md`
- `docs/exec-plans/active/20261107-surface-derived.md`（新增）、`docs/exec-plans/README.md`
