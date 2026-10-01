## [2026-09-29 22:30] | Task: 对话流里的上下文压缩

### 🤖 Execution Context

- Agent ID: claude-code
- Base Model: Claude Opus 5.5
- Runtime: Claude Code CLI

### 📥 User Query

> 设计并实现触发压缩时的前端显示：只做「进行中」与「完成后」，统一放在对话流，摘要可展开，手动与自动不区分，中文文案；消息队列单独做，压缩中不可停止。

### 🛠 Changes Overview

Scope: packages/shared、packages/compaction、packages/core/agent-loop、packages/client、apps/desktop main + renderer、docs

Key Actions:

- 压缩插件增加 `onStarted` 观察者；Agent loop 发出自动压缩 started / finished / failed live 事件，失败不再让回合失败。
- Stream adapter 映射为 `context_compaction_started / finished / failed`；契约去掉 trigger / stage / progress。
- Chat 投影保留被压缩的旧消息与工具，摘要挂到分隔线，耗时取 journal 的 start/end 差值。
- `CompactCommandBlock` 重写：计时 + 不确定进度条、可展开摘要 + 复制、失败 + 重试。
- Composer 压缩中停止按钮置灰，新增一次性状态提示；App 处理 skipped 提示、失败保留与重试。

### 🧠 Design Intent (Why)

以前 v2 从不发出压缩事件，手动压缩只剩一行淡色 `/compact`，自动压缩时回复已结束但会话仍忙碌，没有任何说明；压缩后旧消息消失、摘要显示成一张用户卡片，读起来像用户说了那段话。现在压缩成为对话流里一个清楚的边界：上面的消息照常可读，边界处能看到模型之后只凭哪段摘要了解它们。

### 📁 Files Modified

- packages/shared/src/{session,session-selectors}.ts、test/session-selectors.test.ts
- packages/compaction/src/plugin.ts、test/{compaction,lifecycle}.test.ts
- packages/core/agent-loop/src/{loop,testing}.ts、test/auto-compaction.test.ts
- packages/client/src/sessions/chat.ts
- apps/desktop/src/main/runtime-v2/fixed-renderer-stream-adapter.ts、test/{runtime-v2-tool-stream,runtime-v2-fixed-renderer-projection}.test.ts
- apps/desktop/src/renderer/{App.tsx,components/Composer.tsx,components/ConversationView.tsx,components/WorkbenchLayout.tsx,components/messages/CompactCommandBlock.tsx,styles/markdown.css}
- apps/desktop/src/renderer/test/{app-streaming-user-message,compact-command-block,conversation-view-tooltip}.test.tsx、fixtures/workbenchFixture.ts
- docs/design-docs/frontend/{front-中间消息区规范.md,context-compaction-demo.html}
- docs/exec-plans/{README.md,completed/20260929-context-compaction-timeline.md}、docs/exec-runs/20260929-context-compaction-timeline/
