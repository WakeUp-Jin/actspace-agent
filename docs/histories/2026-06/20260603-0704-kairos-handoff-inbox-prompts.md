## [2026-06-03 07:04] | Task: Kairos Handoff Inbox Prompts

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 只改主 Agent 和 Lab Agent 的系统提示词，各加一段很窄的 handoff 说明；不新增工具、不新增 writer、不改 Kairos。需要确认 prompt 使用真实可写绝对路径，并检查文件工具写入边界。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`, `packages/desktop`, `docs/design-docs`, `docs/learnings`

**Key Actions:**

- **[Main Agent handoff]**: `loadMainAgentRuntimeContext()` 注入 Main Agent -> Kairos handoff segment，使用真实绝对路径 `<userData>/kairos/inbox/main-agent.md`。
- **[Writable boundary]**: 为 `write_file` / `edit_file` 增加 runtime-only `additionalWritableRoots`，主 Agent 只额外放行 `<userData>/kairos/inbox/`，相对路径仍不能借此逃逸 workspace。
- **[Lab prompt asset]**: 新增 `buildLabAgentSystemPrompt({ labInboxPath })`，版本化未来 Lab Agent 写入 `<userData>/kairos/inbox/lab-agent.md` 的 handoff 规则，但不创建 Lab Runtime。
- **[Scaffolding]**: `ensureDataDirectories()` 和 `ensureKairosScaffolding()` 幂等创建 `kairos/inbox/`。
- **[Tests]**: 覆盖 runtime context 注入、额外可写根、Lab prompt builder、Kairos scaffolding 目录创建和 AgentConfig 透传。
- **[Docs]**: 更新 agent-core 模块地图、存储边界、Lab runtime 架构和 Lab 实现进度。

### 🧠 Design Intent (Why)

Prompt 里不能只告诉 Agent “去写某个路径”，还必须让工具权限真实允许该路径。否则系统提示词会制造一个运行时做不到的承诺，导致模型反复失败。本次把 handoff 路径、prompt segment 和 `write_file/edit_file` 的额外可写根放在同一个 runtime loader 中生成，保证真实 turn 与 Context describe 同源。

Lab 目前只有 renderer mock，没有后端 Runtime / IPC / Persistence，所以本次只新增版本化 prompt asset 和设计文档，不硬造未落地的运行时。

### 📁 Files Modified

- `packages/desktop/src/main/agent-runtime-context.ts`
- `packages/agent-core/src/tools/workspace-guard.ts`
- `packages/agent-core/src/tools/types.ts`
- `packages/agent-core/src/tools/manager.ts`
- `packages/agent-core/src/prompt/lab-agent.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/kairos-bootstrap.ts`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`
- `docs/design-docs/core-storage-and-observability.md`
- `docs/design-docs/lab/lab-runtime-architecture.md`
- `docs/design-docs/lab/lab-implementation-progress.md`
