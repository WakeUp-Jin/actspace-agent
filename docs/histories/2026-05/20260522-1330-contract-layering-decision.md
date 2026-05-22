## [2026-05-22 13:30] | Task: refine frontend/backend contract plan

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 先执行第一个计划，前后端契约，这个计划我们在详细分析一下，其实就是定义前后端数据交互的格式。未来的后端多半就是按照这个 skill 写的项目，所以它的 Agent 的数据类型约束就可能传递给前端使用，所以这里需要仔细分析一下看看。

### Changes Overview

**Scope:** `docs/exec-plans`, `docs/histories`

**Key Actions:**

- **[Contract layering]**: 在前后端契约计划中补充三层边界：Runtime Internal Types、Persisted Session Events、UI View Models。
- **[Agent loop boundary]**: 明确 `.agents/skills/llm-agent-dev/examples/agent-loop.ts` 中的 `AgentEvent` 是后端内部生命周期事件，不直接写入 jsonl，也不直接暴露给 renderer。
- **[Stream boundary]**: 增加 `RuntimeStreamEvent` 草案，用于未来流式 UI 的临时传输，但不作为长期持久化格式。
- **[UI model boundary]**: 补充 `MessageBlock`、`ToolUiPreview`、`SessionDiffSummary`、`SessionError` 等前端视图模型约束。

### Design Intent

`llm-agent-dev` 的 Agent loop 类型非常适合作为后端内部运行时，但如果前端直接依赖这些生命周期事件，未来后端支持 steering、follow-up、sub-agent 或更换调度器时会直接破坏 UI。契约层改为“内部事件 -> adapter -> SessionEvent -> UI ViewModel”的方向，既保留后端演进空间，也让前端可以稳定还原设计稿。

### Files Modified

- `docs/exec-plans/active/actspace-parallel-contracts-and-fixtures.md`
- `docs/histories/2026-05/20260522-1330-contract-layering-decision.md`
