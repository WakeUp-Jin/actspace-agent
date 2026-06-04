## [2026-06-04 14:04] | Task: Polish SubAgent Transcript Worked List

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户反馈 SubAgent transcript 弹窗的任务输入框、工具流和最终回复阅读层级不好：完成后不应完整展开大量工具流，而应先显示折叠的 `Worked` 列表入口，再正常展示模型最终回复；运行中不应显示最终输出。

### Changes Overview

**Scope:** `packages/desktop` renderer, `docs/design-docs`, `docs/histories`

**Key Actions:**

- **[Transcript modal layout]**: 放大 SubAgent transcript modal 与任务输入区，提升任务输入的字号、行高、边框和可滚动高度。
- **[Sticky task input]**: 将 Task input 收进 transcript 滚动面顶部的 sticky 区域，默认只展示数行预览；点击输入区展开完整任务，再次点击收起，且输入区自身不出现内部滚动条。
- **[Task input fade]**: 移除 Task input 与 `Worked` 行之间的硬分割线；折叠态在输入框底部用主题感知渐变遮罩自然淡出，展开态隐藏遮罩。
- **[Worked list]**: 完成态将过程 transcript 默认折叠成 `Worked for ...` 按钮，点击后才展开完整 Thinking / 工具 / usage 流。
- **[Worked divider alignment]**: 将 `Worked` 下方分割线从整段 section border 改成内缩伪元素，左右边界与 Task input 输入框外沿对齐。
- **[Final output rule]**: `Final output` 只在 SubAgent 不再 running 后展示，并作为 `Worked` 行下方的正常 Markdown 正文渲染，不再固定在底部小抽屉里。
- **[Regression tests]**: 更新 Agent block 测试，覆盖 Task input 展开/收起、完成态默认折叠、点击展开过程流，以及 running 态不显示最终输出。
- **[Docs]**: 更新中间消息区规范和 SubAgent runtime 规范，记录新的 modal 状态规则。

### Design Intent (Why)

SubAgent 工具流对排障有价值，但在最终回复出现后，它不应继续占据主要阅读空间。把过程流折叠为 `Worked for ...`，再把最终回复作为正文渲染，可以保留可观测性，同时让用户第一眼读到真正结果。运行中隐藏 `Final output` 则避免把 transcript 中途 assistant 文本误当成最终报告。

后续细化时，Task input 改为 sticky 顶部预览而不是独立内部滚动框：长任务默认露出几行，点击才展开完整内容。这样滚动条仍属于 transcript 主阅读面，不会出现输入区和正文区各自滚动的割裂感。

再次细化时，Task input 底部不再用分割线硬切到 `Worked` 行，而是在折叠态用 `to-surface` 渐隐层让长文本自然收住。渐隐层位于输入框内部，不改变下方布局；展开后移除遮罩，避免完整文字被覆盖。

`Worked` 下方的保留分割线也不再横跨整个 modal 内容宽度，而是收进与 Task input 输入框一致的左右边界。这样过程入口和最终回复仍然分开，但视觉节奏不会比上方输入区更宽、更硬。

### Verification

- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/agent-run-block.test.tsx`
- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/agent-run-block.test.tsx src/renderer/test/app-streaming-user-message.test.tsx`
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/desktop build`
- 颜色扫描确认 `SubAgentTranscriptModal.tsx` 没有新增主题相关禁用颜色字面量。
- Browser renderer visual check at `http://127.0.0.1:5173/` with a temporary non-committed harness: checked completed collapsed state, expanded work list, and dark theme readability.

### Files Modified

- `packages/desktop/src/renderer/components/messages/SubAgentTranscriptModal.tsx`
- `packages/desktop/src/renderer/test/agent-run-block.test.tsx`
- `docs/design-docs/front-中间消息区规范.md`
- `docs/design-docs/agent-subagent-runtime.md`
- `docs/histories/2026-06/20260604-1404-subagent-transcript-worked-list.md`
