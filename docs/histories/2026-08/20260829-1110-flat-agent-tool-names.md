## [2026-08-29 11:10] | Task: 切换扁平 Agent Tool name 契约

### 🤖 Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 修复 CLI run 中 `read_file` 等工具名进入 Provider wire 时的 namespaced 400，并检查其他工具是否有同样问题；先按已审核设计执行。

### 🛠 Changes Overview

**Scope:** `packages/tools`、`packages/core/agent-loop`、`packages/llm`、`packages/session`、`packages/runtime`、`packages/shared`、`packages/subagent`、`apps/cli`、`apps/desktop` 及对应设计/执行文档。

**Key Actions:**

- **公共身份切换**：`ToolDefinition` ABI 升至 2，Agent Tool 使用合法扁平 `name`，Registry 直接按 name capture；`pluginId` 保留为 ownership/provenance。
- **Provider wire**：OpenAI Chat/Responses、Anthropic、pi-ai 的 schema 和 tool-call replay 直接传递 `name`，不再拼接或拆解 namespace。
- **事件与 Host**：Session `tool/call` / `tool/result`、Cordis tool payload、approval、artifact owner、live progress、diagnostics 和 projection 统一使用 name；旧 `toolId` fallback 被拒绝。
- **工具实现冻结**：read/list/edit/write/bash、Browser Bridge、Todo 和 Subagent 的 executor body、参数 schema 与行为逻辑保持原样。

### 🧠 Design Intent (Why)

Provider 的函数名是外部 wire 合同，不能复用内部 plugin namespace。将模型可见 identity 与 plugin provenance 分离后，`read_file` 能直接贯穿 DSH 风格 Agent Loop；重复 name 在注册阶段 fail-fast，避免通过编码映射掩盖 scope 冲突。

### 📁 Files Modified

- `packages/tools/runtime/src/definition.ts`
- `packages/tools/runtime/src/registry.ts`
- `packages/tools/runtime/src/prepared-execution.ts`
- `packages/core/agent-loop/src/loop.ts`
- `packages/llm/service/src/message.ts`
- `packages/llm/service/src/stream.ts`
- `packages/llm/pi-ai/src/legacy-proxy-wire-engine.ts`
- `packages/llm/pi-ai/src/pi-ai-wire-engine.ts`
- `packages/session/journal/src/core-codecs.ts`
- `packages/runtime/src/projection/{tool-dto,durable-session,live-progress,diagnostics}.ts`
- `apps/cli/src/runtime-v2/{run,approval,artifact-store,terminal-renderer}.ts`
- `apps/desktop/src/main/runtime-v2/{approval-broker,artifact-store,fixed-renderer-ipc,fixed-renderer-projection,runtime-registry}.ts`
- `docs/design-docs/agent-plugin-runtime/agent-spec-tool-name-contract.md`
- `docs/exec-runs/20260829-actspace-tool-name-contract/{execution-process,execution-summary}.md`
