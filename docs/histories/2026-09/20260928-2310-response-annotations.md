## [2026-09-28 23:10] | Task: 回复批注（PA）

### 🤖 Execution Context

- Agent ID: claude-code
- Base Model: Claude Opus 5.5
- Runtime: Claude Code

### 📥 User Query

> 继续执行 `docs/exec-plans/active/20260928-composer-mentions-annotations/` 的 PA 子计划：在助手回复里选中文字添加为批注，随消息发送。

### 🛠 Changes Overview

Scope: apps/desktop renderer

Key Actions:

- 选区工具条：在已持久化的回复（`v2-<seq>`）里选中文字后出现「添加到对话」；跨回复、代码块、流式中的回复、超长选区都不出现。
- Composer 托盘：显示草稿批注，可删除、清除、编辑评论；只有批注没有正文也能发送；发送被拒或出错时恢复。
- 草稿状态：新增 `useResponseAnnotationState`；草稿和文字草稿一样由 `WorkbenchLayout` 按会话存在内存里。
- 已发送批注：回复内显示编号 marker，悬停卡片里用纯文本显示原文和评论，点击后用 CSS Custom Highlight API 高亮；用户消息下显示可定位的摘要。
- 测试与预览：新增选区、托盘、状态、marker、用户消息摘要和 App 级收发用例；预览夹具和 12 张截图存到执行记录目录。

### 🧠 Design Intent (Why)

批注按回复可见文本的 UTF-16 偏移加前后文保存，回复重新渲染后仍能定位；定位不到时标记为不可用，不画错位置。marker 放在选区最后一行的行尾，同一行的横向排开，不遮挡正文。选中文本和评论都是用户输入，一律作为 React 文本渲染。日志只记条数和校验结果，不记内容。

### 📁 Files Modified

- apps/desktop/src/renderer/App.tsx
- apps/desktop/src/renderer/components/Composer.tsx
- apps/desktop/src/renderer/components/ConversationView.tsx
- apps/desktop/src/renderer/components/WorkbenchLayout.tsx
- apps/desktop/src/renderer/components/messages/AssistantReply.tsx
- apps/desktop/src/renderer/components/messages/UserMessage.tsx
- apps/desktop/src/renderer/components/messages/ResponseAnnotationMarkers.tsx
- apps/desktop/src/renderer/components/messages/ResponseAnnotationPopover.tsx
- apps/desktop/src/renderer/components/messages/ResponseSelectionToolbar.tsx
- apps/desktop/src/renderer/components/messages/response-annotation-context.ts
- apps/desktop/src/renderer/components/messages/response-annotation-text.ts
- apps/desktop/src/renderer/components/messages/useResponseAnnotationState.ts
- apps/desktop/src/renderer/components/composer/
- apps/desktop/src/renderer/styles/base.css
- apps/desktop/src/renderer/styles/tokens.css
- apps/desktop/src/renderer/test/（新增与扩展的批注相关测试、fixtures）
- docs/exec-plans/active/20260928-composer-mentions-annotations/
- docs/exec-runs/20260928-composer-mentions-annotations/
