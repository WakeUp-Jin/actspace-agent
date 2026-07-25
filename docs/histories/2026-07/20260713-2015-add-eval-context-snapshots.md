## [2026-07-13 20:15] | Task: 增加 eval-only 上下文快照

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 为独立评估平台提供足够的过程证据，严格验证 tool result 是否进入下一次模型调用，同时保持普通 ActSpace 运行不产生评估文件。

### 🛠 Changes Overview

**Scope:** `packages/agent-cli`

**Key Actions:**

- 新增只在显式 `--out` 时启用的 `ContextSnapshotCollector`。
- 通过现有 cache-audit sidecar hook 在每次真实 LLM 调用前复制 context，不改变模型输入。
- 在 context compaction 事件后记录 post-compaction snapshot，并保留 final snapshot。
- snapshot 记录 turn/call、messages、token estimate、compaction 和 tool call IDs。
- 更新 CLI artifact 测试与 Agent 评估设计文档。

### 🧠 Design Intent (Why)

最终上下文不能证明模型在中间轮次真实看到了 tool result。复用既有 sidecar observer 可以提供确定性证据，同时避免给核心 loop 增加第二条执行引擎或污染普通产品运行。

### ✅ Verification

- `pnpm --filter @actspace/agent-cli typecheck`
- `pnpm --filter @actspace/agent-cli test`：4 个测试文件、8 个测试。

### 📁 Files Modified

- `packages/agent-cli/src/context-snapshot-collector.ts`
- `packages/agent-cli/src/run.ts`
- `packages/agent-cli/src/types.ts`
- `packages/agent-cli/src/test/run.test.ts`
- `packages/agent-cli/src/test/artifacts.test.ts`
- `docs/design-docs/evaluation/agent-evaluation.md`
- `docs/design-docs/agent-runtime/agent-testing.md`
