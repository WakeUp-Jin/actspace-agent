## [2026-05-29 11:56] | Task: 收口 Conversation 工具行样式所有权

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop app`

### 📥 User Query

> 批准执行样式边界收口：把工具日志自身样式迁回组件，把相邻消息负间距留在 ConversationView，并删除 `legacy-conversation.css`。

### 🛠 Changes Overview

**Scope:** `packages/desktop`, `docs`

**Key Actions:**

- **[ToolLogLine 收口]**: 将工具日志 tooltip open、running shimmer、error 色和 reduced-motion fallback 迁回 `ToolLogLine.tsx` / `toolLogStyles.ts`，不再依赖 legacy 后代选择器。
- **[Diff running 复用]**: `FileDiffBlock.tsx` 的 running 态复用组件侧工具行 class，避免删除 legacy 后 write/edit running 失去 shimmer。
- **[Conversation 关系样式]**: `ConversationView.tsx` 根据前后消息类型追加相邻压缩 class，让工具、思考和 diff 的行间关系由消息列表渲染层负责。
- **[Legacy 删除]**: 删除 `legacy-conversation.css` 并移除 `styles/index.css` import；共享 `rise-in` 与 `tool-log-text-shimmer` keyframes 移到 `base.css`。
- **[文档同步]**: 更新 Tailwind 样式架构规范、团队样式作用域约定和 active execution plans，记录 `legacy-conversation.css` 已下线。
- **[学习沉淀]**: 新增一页 learning，记录组件自身样式与渲染关系样式分开归属的迁移模式。

### 🧠 Design Intent (Why)

工具行运行态、tooltip 和 reduced-motion 是单个消息组件的视觉职责；相邻负间距则表达消息列表中不同 block 之间的关系。拆清这两个层次后，Conversation 不再需要 legacy CSS 兜底，也减少 Tailwind utility 被旧分区样式覆盖的风险。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/messages/ToolLogLine.tsx`
- `packages/desktop/src/renderer/components/messages/toolLogStyles.ts`
- `packages/desktop/src/renderer/components/messages/FileDiffBlock.tsx`
- `packages/desktop/src/renderer/components/messages/ThinkingBlock.tsx`
- `packages/desktop/src/renderer/styles/index.css`
- `packages/desktop/src/renderer/styles/base.css`
- `packages/desktop/src/renderer/styles/diff.css`
- `packages/desktop/src/renderer/styles/legacy-conversation.css`
- `docs/design-docs/front-tailwind-style-architecture.md`
- `docs/coding-standards/team/frontend-style-scope-conventions.md`
- `docs/exec-plans/active/actspace-tailwind-style-architecture.md`
- `docs/exec-plans/active/20260528-tailwind-remaining-ui-migration.md`
- `docs/exec-plans/active/20260528-frontend-style-ownership-cleanup.md`
- `docs/learnings/2026-05/component-style-vs-render-relation-boundary.md`
