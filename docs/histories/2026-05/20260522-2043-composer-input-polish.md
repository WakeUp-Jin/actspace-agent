## [2026-05-22 20:43] | Task: polish composer input

### 🤖 Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 微调聊天输入框：模拟图片和文件附件展示，修复输入框不能输入的问题，并对齐附件、Context、发送、模式和模型按钮的视觉语义。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer

**Key Actions:**

- **[Textarea input]**: 将 composer 的伪 textbox 改为真实受控 `textarea`，让输入框可以实际输入文本。
- **[Attachment preview]**: 临时开启图片和文件附件 mock，验证上传后 composer 顶部附件区带来的自然高度。
- **[Composer controls]**: 将附件按钮、Context 按钮、发送按钮和模式按钮图标调整为更接近定稿图的语义表达。
- **[Scale refinement]**: 将 composer 字号、附件缩略图、输入区高度和底部按钮尺寸压回页面整体密度，避免输入区相对消息流显得过大。
- **[Image attachment shape]**: 将图片附件 mock 调整为正方形缩略图，和文件附件 chip 形成更清晰的对象类型区分。
- **[Lucide icons]**: 引入 `lucide-react`，将侧栏、顶栏、composer、Thinking、diff 和 Context 弹窗里的手写符号/伪图标替换为统一的线性图标。
- **[Attachment removal]**: 为图片和文件附件 mock 增加删除按钮，点击后可从当前 composer 中移除对应附件。
- **[Context ring]**: 将 Context 按钮从静态 Lucide 图标恢复为 CSS 圆环，保留后续做动态 token 用量进度的表达空间。
- **[Tool log typography]**: 将 Thinking 与 Read/Search 工具流文字调整为更轻的灰色日志样式，降低对最终回复和 diff 卡片的视觉抢占。

### 🧠 Design Intent (Why)

Composer 是聊天页最重要的操作中心，高度应由附件预览和多行输入空间自然形成，而不是靠空白硬撑。按钮语义也需要清楚表达上传、上下文占用和发送动作，避免让用户把操作区误读成普通网页表单。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/ContextPopup.tsx`
- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/components/messages/EditDiffBlock.tsx`
- `packages/desktop/src/renderer/components/messages/ThinkingBlock.tsx`
- `packages/desktop/src/renderer/styles.css`
- `packages/desktop/package.json`
- `pnpm-lock.yaml`
- `docs/histories/2026-05/20260522-2043-composer-input-polish.md`
