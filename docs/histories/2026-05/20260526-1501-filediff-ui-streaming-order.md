## [2026-05-26 15:01] | Task: FileDiffBlock UI 重构 + 流式消息顺序修复

### 🤖 Execution Context

- **Agent ID**: `cursor-agent`
- **Base Model**: `claude-opus-4-7-thinking-xhigh`
- **Runtime**: `cursor`

### 📥 User Query

> edit/write 工具的前端显示太丑，改成 Cursor 风格的折叠式单行（"Edit xxxx.ts +175 -12 >"），点击展开 diff；去掉 icon，工具名用现在时 Edit/Write。
> 流式消息顺序 bug：工具调用显示在消息顶部，和后端推送顺序不一致。

### 🛠 Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **FileDiffBlock 重构**: 从全卡片 diff 展示改为折叠式工具行（button toggle + 展开 diff），去掉 icon，标签用 Edit/Write 现在时。
- **CSS 替换**: 移除 `.diff-card` / `.diff-card-header` / `.file-glyph` / `.diff-expand` 等旧样式，新增 `.file-diff-block` / `.file-diff-toggle` / `.file-diff-summary` 等与 tool-log-line 风格一致的轻量样式。
- **流式消息顺序修复**: `StreamingState` 从 `thinkingText + assistantText + activeTools Map` 改为 `segments: StreamingSegment[] + activeTools Map`。`segments` 按事件到达顺序记录 thinking / text / tool 片段，`streamingStateToBlocks` 按序遍历 segments 生成 `MessageBlock[]`，解决 thinking 总在最前、tools 总在中间、text 总在最后的分组错位问题。
- **edit_diff/write 流式预览**: `toolEntryToBlock` 新增对 `edit_diff` 和 `write` preview kind 的映射，流式阶段即可渲染折叠式 diff 行。

### 🧠 Design Intent (Why)

- **UI 一致性**：edit/write 工具行应与 read/grep/glob 等工具保持同一级别的视觉重量，默认折叠单行，需要时展开细节。
- **消息顺序即执行顺序**：前端消息流是用户观察 Agent 执行过程的唯一界面，顺序必须忠实反映后端事件推送时序，否则用户无法理解 Agent 的推理和操作逻辑。
- **segments 设计**：用一个按到达顺序 push 的数组取代按类型分桶的字段，在不改变 `handleStreamEvent` 回调签名的前提下实现了正确排序。连续同类型 delta 会合并进同一个 segment，避免 block 碎片化。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/messages/FileDiffBlock.tsx`
- `packages/desktop/src/renderer/styles.css`
- `packages/desktop/src/renderer/App.tsx`
