## [2026-06-04 00:01] | Task: Stabilize Running Tool Text Shimmer

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户确认保留工具 running 态文字高光扫过效果，但需要修稳 Electron 中偶发露出渐变矩形的问题，并把写死颜色改为主题 token。

### Changes Overview

**Scope:** `packages/desktop` renderer, `docs/design-docs`, `docs/learnings`

**Key Actions:**

- **[Theme tokens]**: 普通工具行 running 态从写死 `#hex` 改为 `text-text-muted` / `--act-color-text-muted` 和 `--act-color-brand`。
- **[Stable shimmer]**: 新增 `.tool-log-text-running`，真实文本保持可读主题色，`::after` 通过 `data-shimmer-text` 复制文字并只负责品牌色扫光层。
- **[Shared usage]**: `ToolLogLine`、`FileDiffBlock` 和 `AgentRunBlock` 复用同一个 running shimmer class，避免多份 `background-clip:text` 实现漂移。
- **[Tests]**: 补充 running 文本必须带 `tool-log-text-running` 与 `data-shimmer-text` 的断言。
- **[Docs]**: 更新中间消息区规范，明确 shimmer 基础色/高光色必须使用主题 token。

### Design Intent (Why)

旧实现直接把文本本体设为 transparent，再把整段渐变背景裁到文字上。Electron 某一帧如果没有稳定裁剪，就可能露出矩形背景。新实现把真实文本和动画高光分层：底层永远是主题色可读文本，上层伪元素只做扫光，即使高光层异常也不会让整条工具行变成大色块。

### Verification

- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/file-diff-block.test.tsx src/renderer/test/agent-run-block.test.tsx src/renderer/test/app-streaming-user-message.test.tsx`
- 颜色扫描确认本轮 touched message 组件里没有新增主题相关 `#hex`，剩余 `ToolLogLine` tooltip 反色样式属于既有合法例外。

### Files Modified

- `packages/desktop/src/renderer/components/messages/toolLogStyles.ts`
- `packages/desktop/src/renderer/components/messages/ToolLogLine.tsx`
- `packages/desktop/src/renderer/components/messages/FileDiffBlock.tsx`
- `packages/desktop/src/renderer/components/messages/AgentRunBlock.tsx`
- `packages/desktop/src/renderer/styles/base.css`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `packages/desktop/src/renderer/test/file-diff-block.test.tsx`
- `packages/desktop/src/renderer/test/agent-run-block.test.tsx`
- `docs/design-docs/front-中间消息区规范.md`
- `docs/learnings/2026-06/css-text-shimmer-overlay.md`
