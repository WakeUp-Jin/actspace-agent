## [2026-06-04 02:34] | Task: Fix Agent tool output contract

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户确认 Agent 工具结果被普通工具输出压缩是契约 bug，并指出 SubAgent transcript modal 不能简单取最后一条 `assistant_message` 当最终输出；要求 Agent 工具跳过通用输出压缩，modal final output 优先使用 Agent block summary，并补测试与文档。

### Changes Overview

**Scope:** `packages/agent-core`, `packages/desktop`, `docs/design-docs`, `docs/histories`, `docs/learnings`

**Key Actions:**

- **[Scheduler contract]**: 锁定 `previewKind === "agent"` 与 `bash` 一样跳过 `processToolOutput()`，保留完整 `modelOutput` 和 executor 自有 `outputRef`。
- **[Regression test]**: 新增 scheduler 输出单测，验证长 Agent summary 在低阈值下不会出现 `[已压缩摘要]`，而普通 generic 工具仍会走压缩。
- **[Transcript final output]**: `SubAgentTranscriptModal` 的 `Final output` 优先使用 `MessageBlock.kind === "agent"` 上的 `summary`，仅在旧数据缺少 summary 时 fallback 到 transcript assistant 输出。
- **[Renderer tests]**: 更新 Agent block 测试，覆盖 summary 优先、transcript assistant fallback、过程流不混入最终 assistant 文本。
- **[Docs]**: 更新 SubAgent runtime 规范，明确 Agent 工具结果不参与普通工具压缩，modal 最终报告事实源为 Agent block summary。

### Design Intent (Why)

Agent 工具的输出不是普通工具原文，而是 SubAgent runner 产出的结构化报告和 sidecar transcript 引用；再次进入通用输出压缩会破坏主 Agent 消费契约。Transcript modal 也不能从过程事件里猜“最后一个 assistant 文本”，因为多轮 SubAgent 探索可能产生中途 assistant 消息。最终输出应以 Agent block summary 这个持久化 view model 为事实源，transcript assistant 只作为旧数据兜底。

### Verification

- `pnpm --filter @actspace/agent-core exec vitest run src/tools/test/scheduler-output.test.ts src/tools/test/agent-tool.test.ts`
- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/agent-run-block.test.tsx src/renderer/test/app-streaming-user-message.test.tsx`

### Files Modified

- `packages/agent-core/src/tools/scheduler.ts`
- `packages/agent-core/src/tools/test/scheduler-output.test.ts`
- `packages/desktop/src/renderer/components/messages/SubAgentTranscriptModal.tsx`
- `packages/desktop/src/renderer/test/agent-run-block.test.tsx`
- `docs/design-docs/agent-subagent-runtime.md`
- `docs/histories/2026-06/20260604-0234-agent-tool-contract-output.md`
- `docs/learnings/2026-06/tool-output-contract-boundaries.md`
