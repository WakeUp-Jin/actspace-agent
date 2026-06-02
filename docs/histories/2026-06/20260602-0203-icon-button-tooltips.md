## [2026-06-02 02:03] | Task: icon button tooltips

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 图标按钮只有图标，鼠标悬浮时不知道按钮用途；希望像 shadcn / Radix Tooltip 一样显示文字提示。

### 🛠 Changes Overview

**Scope:** `packages/desktop`, `docs`

**Key Actions:**

- **[Tooltip primitive]**: 引入 `@radix-ui/react-tooltip`，封装 renderer 侧 `TooltipProvider` / `Tooltip` / `TooltipTrigger` / `TooltipContent`。
- **[Global provider]**: 在 renderer 根部挂载 `TooltipProvider`，统一 tooltip 打开延迟。
- **[Turn actions]**: 为回复下方的可视化按钮和更多操作按钮补充主题感知 tooltip，同时保留 `aria-label`。
- **[Tests]**: 新增 `ConversationView` tooltip 测试，覆盖两个 icon-only 操作的 hover 文案。

### 🧠 Design Intent (Why)

图标按钮能节省空间，但如果没有 hover/focus 提示，会让用户只能猜按钮含义。Radix Tooltip 提供了键盘与鼠标一致的浮层行为，适合作为桌面端通用 UI primitive。样式使用现有语义 token，避免 tooltip 在浅色/深色主题下出现不可读的硬编码颜色。

### 📁 Files Modified

- `packages/desktop/package.json`
- `pnpm-lock.yaml`
- `packages/desktop/src/renderer/components/ui/Tooltip.tsx`
- `packages/desktop/src/renderer/main.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/test/conversation-view-tooltip.test.tsx`
- `docs/learnings/2026-06/icon-button-tooltip-accessibility.md`
