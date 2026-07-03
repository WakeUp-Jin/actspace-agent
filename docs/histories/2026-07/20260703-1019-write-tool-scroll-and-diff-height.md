## [2026-07-03 10:19] | Task: 修复写入工具滚动跟随与 diff 高度

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### User Query

> 用户反馈 `write_file` 执行中消息窗口出现滚动条后不会自动聚焦到最新尾部；完成后展开 diff 如果内容很多会把消息流撑得过高，希望完成态 diff 也使用固定高度并在内部滚动。

### Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **[Scroll follow]**: `ConversationView` 增加对消息栈尺寸变化的 `ResizeObserver` 监听，在用户仍贴近底部时继续把会话视口滚到最新尾部。
- **[Bounded diff]**: `.file-diff-content` 增加完成态最大高度和纵向滚动，避免长 diff 全量撑开会话。
- **[Tests]**: 补充 renderer 测试覆盖流式内容 resize 后贴底跟随，以及展开 diff 内容区域的 CSS 高度约束。

### Design Intent

写入工具执行中的内容增长可能发生在同一条消息内部，未必触发 `messages` 数组变化。只依赖消息数量或流式状态 effect，会漏掉 diff preview 自身变高的场景。把滚动跟随放在会话容器层，用 `ResizeObserver` 观察消息栈实际高度，能集中处理所有流式工具内容，同时保留用户手动上滚时暂停跟随的行为。

完成态 diff 是局部可检查内容，不应该无限撑高整条会话。给 diff 内容区设置最大高度后，大文件写入仍能展开查看，但滚动压力留在 diff 区域内部。

### Files Modified

- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/styles/diff.css`
- `packages/desktop/src/renderer/test/conversation-view-tooltip.test.tsx`
- `packages/desktop/src/renderer/test/file-diff-block.test.tsx`
