## [2026-05-26 15:25] | Task: FileDiffBlock 样式回归对齐 + 工具进行中状态

### 🤖 Execution Context

- **Agent ID**: `cursor-agent`
- **Base Model**: `claude-opus-4-7-thinking-xhigh`
- **Runtime**: `cursor`

### 📥 User Query

> Write 工具行视觉"突出来"了，箭头跑到最右端，和 Thinking 不一致。工具调用还缺少进行中态——应该 `tool_started` 时显示 `Write filename`（闪光），`tool_finished` 才显示带统计的折叠卡片。问我为什么没注意到 `docs/design-docs/` 的设计原则。

### 🛠 Changes Overview

**Scope:** `packages/desktop` `packages/agent-core` `packages/shared` `docs/design-docs/frontend-ui` `docs/design-docs/agent-core`

**Key Actions:**

- **shared 类型扩展**: `edit_diff` / `write_diff` MessageBlock 新增可选 `status: "running" | "completed"`，使流式阶段可以表达工具进行中态，持久化默认按 completed 渲染。
- **FileDiffBlock 双态渲染**: running 态用 `tool-log-line is-running` 单行 + shimmer 闪光，不显示 chevron 与统计；completed 态用折叠式 `Edit/Write filename +N -M ›`，点击展开 diff 详情。
- **CSS 回归对齐**: `.file-diff-block` 改用 `max-width: 800px + padding: 0 var(--conversation-text-inset)` 与 ThinkingBlock / ToolLogLine 对齐，左边缘统一；`.file-diff-toggle` 改为 `inline-flex`，chevron 紧贴文本而不是被 flex-end 推到最右；diff 内容容器 `.file-diff-content` 使用单层浅色背景，符合"轻量文本流"原则。
- **App.tsx 流式 status 传递**: `toolEntryToBlock` 给 edit_diff / write_diff 加上 `status: tool.finished ? "completed" : "running"`。
- **bridge.ts 后端 summary 时态统一**: `getToolSummary` 把 `Edited / Wrote` 改为现在时 `Edit / Write`，与前端 UI 文案对齐；`fixtures.ts` 和 `tools.ts` 中遗留同义文本一并更新。
- **设计文档校核**: 重写 `中间消息区规范.md` Edit File 章节为 "Edit File / Write File 组件"，明确放弃"唯一卡片化"约束，改为与 Read/Grep 等同级别的轻量行 + 展开 diff；`tool-preview-design-guidelines.md` 补全 running/completed 状态语义和闪光交互说明。

### 🧠 Design Intent (Why)

- **设计原则先于实现细节**：上一轮我直接照搬 Thinking 视觉但跳过了"统一左边缘""保持文本流感""不靠装饰"等核心约束，导致 `width:100%` + flex-end 把箭头推到最右、缺少 `conversation-text-inset` 让 Write 行视觉突出。这次先读 `docs/design-docs/frontend-ui/中间消息区规范.md` 再写代码，把这些 token 一次性对齐。
- **工具进行中态的语法位**：消息流"严格按执行顺序展示"+"保持文本流感"意味着 `tool_started` 阶段就需要一个可见但克制的占位，不能是 additions=0 的空统计卡片；用 `tool-log-line is-running` 直接复用已有的 shimmer 系统，做到 read / grep / write 在 running 态视觉一致。
- **status 字段而不是新 MessageBlock kind**：在 `edit_diff` / `write_diff` 上挂可选 `status`，可以让同一个 MessageBlock 类型在流式和持久化两条路径上复用；持久化默认 completed 视为正常折叠卡片，不影响历史会话回放。
- **后端摘要时态统一**：UI 折叠态显示 `Edit filename +3 -1`，但后端持久化的 `summary` 还是 `Edited filename`，会让 history/recovery 时摘要与活态消息脱节。统一为现在时让"摘要 = 用户可见动作"形成单一事实。

### 📁 Files Modified

- `packages/shared/src/session.ts`
- `packages/desktop/src/renderer/components/messages/FileDiffBlock.tsx`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/styles.css`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/tools.ts`
- `packages/agent-core/src/fixtures.ts`
- `docs/design-docs/frontend-ui/中间消息区规范.md`
- `docs/design-docs/agent-core/tool-preview-design-guidelines.md`
