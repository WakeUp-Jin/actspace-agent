## [2026-05-21 23:10] | Task: 搭建 actspace Agent 运行层骨架

### 🤖 Execution Context

- **Agent ID**: `local`
- **Base Model**: `gpt-5.5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 继续推进 actspace 项目初始化，开始落地 Agent runtime 的 TypeScript 运行层骨架。

### 🛠 Changes Overview

**Scope:** `packages/shared`, `packages/agent-core`, `pnpm-lock.yaml`

**Key Actions:**

- **[Shared contracts]**: 扩展 session / turn / tool / context 相关共享类型，明确 IPC 和运行层的统一数据结构。
- **[Agent runtime modules]**: 将 `agent-core` 拆成 `agent / context / llm / persistence / tools / types` 五个模块，形成 V1 基础版后端骨架。
- **[Provider and tools]**: 补充 provider registry、mock DeepSeek provider 和首版工具注册表，保证运行层具备最小执行能力。
- **[Persistence]**: 增加会话目录、`jsonl` 追加写入和 `meta.json` 写入能力，为后续真实 turn 落盘做准备。
- **[Validation]**: 修复 TypeScript 类型问题并通过 `pnpm typecheck` 与 `pnpm build` 验证。

### 🧠 Design Intent (Why)

Agent runtime 的第一步不是接真正模型，而是把后端运行层的契约、事件流和工具边界固定下来。这样后面接 DeepSeek、做 Context 管道、以及把 turn 结果输送给桌面 UI 时，所有模块都能按同一套数据模型协作。

### 📁 Files Modified

- `packages/shared/src/ipc.ts`
- `packages/shared/src/session.ts`
- `packages/shared/src/index.ts`
- `packages/agent-core/src/index.ts`
- `packages/agent-core/src/types.ts`
- `packages/agent-core/src/llm.ts`
- `packages/agent-core/src/context.ts`
- `packages/agent-core/src/tools.ts`
- `packages/agent-core/src/persistence.ts`
- `packages/agent-core/src/agent.ts`
- `packages/agent-core/package.json`
- `packages/agent-core/tsconfig.json`
- `packages/desktop/src/main/index.ts`
- `pnpm-lock.yaml`
