## [2026-05-24 18:10] | Task: assistant Markdown rendering

### Execution Context

- **Agent ID**: `Codex`
- **Runtime**: `Codex desktop`

### User Query

> 模型最终回复是 Markdown 格式，需要按 Markdown 语法渲染；工具组件暂时不要修改。

### Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- 新增 `MarkdownProse` 组件，用于 assistant final reply 的轻量 Markdown 渲染。
- `AssistantReply` 从纯文本 `<p>` 改为渲染 `MarkdownProse`。
- 增加 actspace 风格的 Markdown prose 样式，覆盖标题、段落、列表、引用、inline code、代码块、链接、分隔线和 GFM 风格表格。
- 保持 Thinking、Read/Search、Tool、Bash、Edit diff 等工具组件不变，避免工具输出被 Markdown 渲染误伤。

### Design Intent

模型的最终回复天然是 Markdown 文本，如果直接用纯文本渲染，会让标题、表格、粗体和代码语法全部泄露为原始符号。首版采用本地轻量 renderer，避免新增网络依赖和供应链变量，同时不渲染原始 HTML，降低桌面端安全风险。后续若需要完整 CommonMark/GFM 兼容，可平滑替换为 `react-markdown + remark-gfm`。

### Verification

- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/desktop build`
- `git diff --check`

当前 `localhost:5173` 未响应，因此本轮未做浏览器视觉验收；代码和构建链路已验证。

### Files Modified

- `packages/desktop/src/renderer/components/messages/AssistantReply.tsx`
- `packages/desktop/src/renderer/components/messages/MarkdownProse.tsx`
- `packages/desktop/src/renderer/styles.css`
