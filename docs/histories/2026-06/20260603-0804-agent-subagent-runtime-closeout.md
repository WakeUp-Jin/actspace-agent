## [2026-06-03 08:04] | Task: 收口 Agent 工具与 SubAgent runtime

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 继续完成 Agent 工具与 SubAgent run 的文档收口：同步长期事实来源、执行计划、history 和 learning。

### 🛠 Changes Overview

**Scope:** `packages/shared`, `packages/agent-core`, `packages/desktop`, `docs`

**Key Actions:**

- **[Shared Contract]**: 新增 `SubAgentTranscriptRef`、`AgentToolPreview`、`AgentToolStats`、`AgentToolRecentEvent`，并让 `RuntimeStreamEvent.subagent_event` 以 typed preview 推送 SubAgent run 增量状态。
- **[Agent Tool Runtime]**: 落地内部工具名 `agent`、用户可见名 `Agent` 的 V0 Explore SubAgent；runner 复用父 turn LLMService，但创建隔离 ContextManager，只暴露 `read_file`、`grep`、`glob`、`list_directory`。
- **[Transcript Sidecar]**: 主 session 只保存 Agent 工具调用/结果和最终 summary/ref；完整 SubAgent transcript 写入 `subagents/<parentTurnId>/<runId>.jsonl`，并通过 typed `subagent:get-transcript` IPC 读取。
- **[Renderer UI]**: 新增 Agent block 与 SubAgent transcript modal；running 阶段由 `subagent_event.preview` 覆盖同一个执行块，completed 阶段从 `tool_result.uiPreview.kind === "agent"` 恢复。
- **[Docs Closeout]**: 更新 Agent 模块地图、工具预览规范、中间消息区规范、SubAgent runtime 设计文档，并将 execution plan 归档到 `completed/`。

### 🧠 Design Intent (Why)

SubAgent run 会产生大量只对局部探索有价值的 user/tool/assistant/usage 事件。如果直接写入主 session，主 Agent 后续上下文会被探索过程污染，历史恢复也会把子智能体内部行为误认为主 Agent 行为。把最终摘要和 transcript 引用留在主 session、把完整 transcript 放到 sidecar JSONL，可以同时保留主上下文干净、UI 可观测和排障可追溯。

### ✅ Verification

- `pnpm --filter @actspace/shared test`
- `pnpm --filter @actspace/shared typecheck`
- `pnpm --filter @actspace/agent-core test -- src/tools/test/agent-tool.test.ts`
- `pnpm --filter @actspace/agent-core test -- src/engine/test/bridge.test.ts`
- `pnpm --filter @actspace/agent-core test -- src/persistence/test/session-store.test.ts`
- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm --dir packages/desktop exec vitest run src/renderer/test/app-streaming-user-message.test.tsx`
- `pnpm --dir packages/desktop exec vitest run src/renderer/test/agent-run-block.test.tsx`
- `pnpm --filter @actspace/desktop typecheck`
- 主题颜色扫描无 `text-black` / `bg-white` / hex token 违规命中。

已知剩余问题：整包 `pnpm --filter @actspace/desktop test -- ...` 仍会触发现有 `src/renderer/test/sheet.test.tsx` focus trap 失败，和本任务无关。

### 📁 Files Modified

- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/tools/tools/agent/`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/persistence/session-store.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/components/messages/AgentRunBlock.tsx`
- `packages/desktop/src/renderer/components/messages/SubAgentTranscriptModal.tsx`
- `docs/design-docs/agent-subagent-runtime.md`
- `docs/design-docs/agent-current-module-map.md`
- `docs/design-docs/agent-tool-preview-design-guidelines.md`
- `docs/design-docs/front-中间消息区规范.md`
- `docs/exec-plans/completed/20260602-agent-tool-subagent-runtime.md`
- `docs/learnings/2026-06/sidecar-transcript-for-subagents.md`
