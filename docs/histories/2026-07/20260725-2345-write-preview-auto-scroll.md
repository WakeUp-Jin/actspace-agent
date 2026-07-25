## [2026-07-25 23:45] | Task: 修复写文件流式预览内部滚动跟随

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### User Query

> 用户反馈写文件工具持续生成内容时，代码预览出现内部滚动条后不会自动显示最新内容，容易误以为工具卡住。

### Changes Overview

**Scope:** `packages/desktop` renderer

**Key Actions:**

- **[Internal scroll follow]**: `FileDiffBlock` 在 `write_file` 流式内容增长时自动滚动内部代码预览到底部。
- **[User intent]**: 用户主动上滚查看早期内容后暂停跟随，滚回底部附近后恢复。
- **[Tests]**: 增加流式预览自动贴底、用户上滚暂停和回到底部后恢复的组件回归测试。
- **[Docs]**: 补充工具预览设计约束和嵌套滚动容器的学习说明。

### Design Intent

外层会话滚动和流式代码预览滚动属于两个独立容器。外层贴底只能保证工具卡可见，不能保证卡片内部最新内容可见。因此由流式预览维护自己的贴底状态，同时尊重用户主动阅读早期内容的滚动位置。

### Files Modified

- `packages/desktop/src/renderer/components/messages/FileDiffBlock.tsx`
- `packages/desktop/src/renderer/test/file-diff-block.test.tsx`
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`
- `docs/learnings/2026-07/streaming-content-resize-needs-scroll-follow.md`
