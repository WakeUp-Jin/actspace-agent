## [2026-06-04 01:45] | Task: Simplify SubAgent Transcript UI

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户反馈 SubAgent 执行块不需要机器人 logo 和 `COMPLETED` 状态噪音；点击后的 transcript 弹窗也不应使用边框 JSON 卡片，而应和主 Agent 的 `Thinking` / 工具行消息语法保持一致。

### Changes Overview

**Scope:** `packages/desktop` renderer, `docs/design-docs`, `docs/histories`, `docs/learnings`

**Key Actions:**

- **[Agent block]**: 移除 SubAgent 执行块中的机器人图标和全大写状态行，只保留标题、最近事件、摘要、stats 和 transcript 入口箭头。
- **[Transcript modal]**: 将 SubAgent transcript 弹窗从逐事件边框卡片改为三段式结构：顶部任务输入、中间过程流、底部最终输出。
- **[Event mapping]**: 在 renderer 内为 SubAgent sidecar transcript 增加轻量转换层，把 `user_message` 放入任务输入区，把 `tool_call` + `tool_result` 配对为 `Read` / `Grep` / `Glob` / `Listed` 等简约工具行，并把最终 `assistant_message` 从过程流中分离到底部输出区。
- **[Tests]**: 更新 SubAgent streaming 和 Agent block 单测，锁定无状态噪音、无 raw tool name、弹窗按主消息语法展示。
- **[Docs]**: 更新中间消息区规范，明确 Agent/SubAgent run 的主入口和 modal transcript 视觉语法。

### Design Intent (Why)

SubAgent transcript 是 sidecar 可观测事件流，但用户看到的详情仍属于同一个消息产品语言。若弹窗直接按 raw event 渲染 JSON/参数卡片，会让它看起来像调试器而不是 Agent 工作流，也会和主消息区的 Thinking、工具行、回复文本分裂。这里用一个 transcript-only 适配层把 sidecar events 转成任务输入、过程事件和最终输出三段，既保留 sidecar 数据边界，又避免维护第二套视觉语法。

### Verification

- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/agent-run-block.test.tsx src/renderer/test/app-streaming-user-message.test.tsx`
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/desktop build`
- `pnpm --filter @actspace/desktop test`
- `pnpm --filter @actspace/desktop test -- agent-run-block`
- `pnpm typecheck`
- Browser mock smoke at `http://127.0.0.1:5173/`
- 颜色扫描确认 touched message 组件没有新增主题相关禁用颜色字面量。

### Files Modified

- `packages/desktop/src/renderer/components/messages/AgentRunBlock.tsx`
- `packages/desktop/src/renderer/components/messages/SubAgentTranscriptModal.tsx`
- `packages/desktop/src/renderer/test/agent-run-block.test.tsx`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `docs/design-docs/frontend/front-中间消息区规范.md`
- `docs/histories/2026-06/20260604-0145-subagent-transcript-ui.md`
- `docs/learnings/2026-06/sidecar-transcript-ui-adapter.md`
