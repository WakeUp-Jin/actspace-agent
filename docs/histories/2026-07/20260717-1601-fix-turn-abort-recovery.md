## [2026-07-17 16:01] | Task: 修复 Agent turn 中断后卡住与历史丢失

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 点击中断后等待很久且不能继续输入；重新进入任务后，中断轮次的聊天记录消失，只保留完整执行的轮次。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、设计与学习文档

**Key Actions:**

- **显式中断终态**：为 Agent loop 增加独立的 `completed / failed / aborted` 状态，避免从最后一条 assistant message 误判工具阶段的 abort。
- **统一取消作用域**：turn abort 会立即取消 pending approval，并向仍在前台运行的 Bash 传播 `AbortSignal`；已后台化任务继续由 task 生命周期管理。
- **两阶段持久化**：turn 开始先 append 用户消息，结束再 append 其余事件；中止时追加 `turn_aborted`，确保重进任务仍能恢复。
- **恢复 UI 可输入**：renderer 收到终态后统一重新读取 Session，清掉临时 streaming state，从持久化事件展示 `Stopped` 并恢复 Composer。
- **回归覆盖**：补充 loop、bridge、scheduler、approval registry、Bash、adapter、session store、selector 和 renderer 测试。
- **真实验收**：Electron 开发版审批等待中点击 Stop，约 2.3 秒回到 Idle；输入框恢复，切换任务后中断轮次仍可恢复。

### 🧠 Design Intent (Why)

中断不是某一条 assistant message 的属性，而是贯穿 renderer、IPC、审批等待、工具进程、Agent loop 和会话存储的 turn 生命周期协议。只有让每层都观察同一个取消作用域，并把终态写入 append-only 会话事实，才能同时解决“停止慢”“输入框卡住”和“历史消失”。

### 📁 Files Modified

- `packages/agent-core/src/engine/loop.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/tools/scheduler.ts`
- `packages/agent-core/src/tools/tools/bash/executor.ts`
- `packages/desktop/src/main/agent-turn.ts`
- `packages/desktop/src/main/approval-registry.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `docs/design-docs/agent-runtime/agent-turn-layers.md`
- `docs/design-docs/core-storage-and-observability.md`
- `docs/learnings/2026-07/agent-turn-cancellation-is-a-lifecycle-protocol.html`
