## [2026-07-17 15:50] | Task: 修复重叠 Turn 流式文字重复

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 修复 Agent 实时输出中每个流式文字片段重复显示的问题。

### 🛠 Changes Overview

**Scope:** `shared`、`agent-core`、`desktop renderer`、测试与设计文档

**Key Actions:**

- **补齐流作用域**：assistant、工具、审批和 SubAgent 的 turn 级流事件统一携带 `sessionId` 与 `turnId`。
- **收敛订阅生命周期**：Renderer 从“每次发送注册监听”改为应用级单一监听。
- **隔离竞态收尾**：只有当前可见 `{ sessionId, turnId }` 可以更新 streaming state；旧 turn 的迟到事件、结果和 finally 不再覆盖新 turn。
- **增加回归验证**：覆盖重叠 turn 不重复、非当前 session 事件被忽略、旧 turn 完成不清空新 turn。

### 🧠 Design Intent (Why)

`agent:stream` 是广播通道。订阅数量和一次业务请求不是同一个生命周期；当旧 turn 因审批暂停而新 turn 已启动时，按请求注册监听会让同一 delta 被多个消费者写进共享状态。修复的核心是让事件具有明确作用域，并让 UI 订阅生命周期独立于单次请求。

### 📁 Files Modified

- `packages/shared/src/session.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `docs/design-docs/agent-runtime/agent-turn-layers.md`
- `docs/exec-plans/completed/20260717-stream-event-turn-routing.md`
- `docs/learnings/2026-07/stream-events-need-explicit-turn-scope.md`
