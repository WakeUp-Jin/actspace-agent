## [2026-09-30 14:00] | Task: Composer 消息队列与运行中插入

### 🤖 Execution Context

- Agent ID: claude-code
- Base Model: Claude Opus 5.5
- Runtime: Claude Code CLI

### 📥 User Query

> 做 Codex 式的消息队列：运行中可以继续发送，消息在输入框上方排队，运行结束后依次发出；每条可以「插入」到正在运行的回合。先出计划和 demo，发送按钮只要两种样子。

### 🛠 Changes Overview

Scope: packages/core/agent、packages/core/agent-loop、packages/shared、packages/desktop-app、apps/desktop main + preload + renderer、docs

Key Actions:

- Inbox 增加 `steer` 来源与 `status(messageId)`；loop 在每步 claim 后发 `inbox-claimed` live 事件，模型写最终回复时有待读插入就多跑一步，回合开始丢弃遗留插入。
- 新增 IPC `agent:steer`（复用引用校验与附件准备）和 `agent:cancel-steer`（返回 cancelled / claimed / discarded / missing）；stream adapter 把用户插入映射为 `user_message_steered`。
- App 把 `handleSend` 拆出 `startSessionRun`，返回运行结果；新增按会话的内存队列、`continueQueue`（正常结束发出队首，停止 / 失败 / 被拒暂停）、插入 / 撤回 / 编辑 / 上移 / 继续发送。
- Composer 运行中可输入，发送按钮只有 ↑ / ■ 两种样子；新增 `MessageQueueTray`。

### 🧠 Design Intent (Why)

以前运行中输入框被锁住，想补一句只能等回合结束或停止重来。现在补充的话先排队，不打断当前回合；真正需要模型马上看到的，用「插入」送进下一步。队列放在渲染进程内存（可编辑、可删除，不在 journal 留噪音），插入走 durable inbox（模型可见、投影已支持）。交接竞态以服务端 inbox 状态为准，没被读到的一律回到队首，不丢也不重复。

### 📁 Files Modified

- packages/core/agent/src/inbox.ts
- packages/core/agent-loop/src/{loop,testing}.ts、test/steer.test.ts
- packages/shared/src/{ipc,session}.ts、runtime-v2/fixed-renderer.ts
- packages/desktop-app/src/service.ts
- apps/desktop/src/main/runtime-v2/{runtime-registry,fixed-renderer-ipc,fixed-renderer-stream-adapter}.ts、test/{runtime-v2-steer-ipc,runtime-v2-tool-stream}.test.ts
- apps/desktop/src/{preload/index.ts,global.d.ts}
- apps/desktop/src/renderer/{App.tsx,session/message-queue.ts,session/session-run-state.ts}
- apps/desktop/src/renderer/components/{Composer,ConversationView,WorkbenchLayout}.tsx、composer/MessageQueueTray.tsx
- apps/desktop/src/renderer/test/{app-message-queue,message-queue-tray}.test.tsx
- docs/design-docs/frontend/{front-中间消息区规范.md,message-queue-demo.html}
- docs/exec-plans/{README.md,active/20260930-composer-message-queue.md}、docs/exec-runs/20260930-composer-message-queue/
- docs/learnings/2026-09/client-queue-server-inbox-handoff.md
