## [2026-07-29 23:55] | Task: 增加长会话轮次导航

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop worktree`

### 📥 User Query

> 参考 Codex，在长会话左侧增加轮次短横线；悬浮显示用户输入与简短回复，点击跳转。离开底部时显示回到底部按钮，到达底部后隐藏。

### 🛠 Changes Overview

**Scope:** `packages/desktop`、前端设计文档

**Key Actions:**

- **轮次导航**: 每个用户 turn 生成一个可点击刻度，跟随阅读位置高亮，并通过 Tooltip 展示输入与最终回复摘要。
- **回到底部**: 复用会话现有 80px 贴底阈值，用户离开底部时显示按钮，点击后恢复流式自动跟随。
- **滚动统一**: 导航、回底按钮和流式跟随共享消息滚动容器状态；历史阅读期间内容 resize 不会强制拉回底部。
- **响应式与主题**: 小于 640px 的消息视口隐藏轮次导航；全部颜色使用现有主题语义 token。
- **回归测试**: 覆盖导航显示、当前 turn、摘要预览、点击跳转、回底按钮显示/隐藏与恢复跟随。

### 🧠 Design Intent (Why)

长会话需要快速定位，但导航不能引入新的 session 状态或破坏用户上滚阅读。实现将 DOM turn 锚点与现有滚动容器结合，让视觉导航和真实布局一致，同时保持 ActSpace 已有的贴底行为边界。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/ConversationTurnRail.tsx`
- `packages/desktop/src/renderer/components/ScrollToBottomButton.tsx`
- `packages/desktop/src/renderer/test/conversation-view-tooltip.test.tsx`
- `docs/design-docs/frontend/front-中间消息区规范.md`
- `docs/learnings/2026-07/scroll-navigation-needs-one-scroll-source-of-truth.md`
