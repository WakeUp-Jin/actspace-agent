## [2026-05-21 23:56] | Task: 打通 actspace 本地 turn 链路

### 🤖 Execution Context

- **Agent ID**: `local`
- **Base Model**: `gpt-5.5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 继续推进 actspace 初始化，把后端运行层、IPC 和工作台 UI 串起来，并在完成后按执行计划规则归档。

### 🛠 Changes Overview

**Scope:** `packages/desktop`, `packages/shared`, `packages/agent-core`, `docs/exec-plans`, `docs/histories`

**Key Actions:**

- **[IPC wiring]**: 新增 `agent:run-turn` IPC，通过 preload 暴露给 renderer，并补充 `RunTurnInput` 契约。
- **[Runtime integration]**: 在 main 侧组装 mock DeepSeek provider、默认工具注册表和会话持久化，完成本地 turn 执行与 `jsonl` 落盘。
- **[Renderer hydration]**: 中间消息区改为消费真实 `AgentTurnResult` 事件流，而不是静态样板数据。
- **[Plan lifecycle]**: 更新 active plans 的完成状态，并准备将已完成计划从 `active/` 移到 `completed/`。
- **[Verification]**: 通过 `pnpm typecheck` 和 `pnpm build` 验证集成链路。

### 🧠 Design Intent (Why)

前面的 foundation、agent runtime 和 workbench UI 都已经分别成型，这一步的关键不是继续补孤立模块，而是把它们真正串成一条本地可运行链路。只有 main、preload、renderer 和 session persistence 同时协作，`actspace` 才从“多块骨架”变成一个能完成本地回合的桌面应用。

### 📁 Files Modified

- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/llm.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/renderer/App.tsx`
- `docs/exec-plans/active/actspace-v1-agent-runtime.md`
- `docs/exec-plans/active/actspace-v1-workbench-ui.md`
- `docs/histories/2026-05/20260521-2356-runtime-ui-integration.md`
