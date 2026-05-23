## [2026-05-23 12:42] | Task: align composer message track

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 修复项目中输入框和渲染文本消息流没有对齐的问题；用户截图显示输入框偏右，并要求查看 `localhost:5173`。
> 后续继续按 Cursor 截图参照修复两处瑕疵：sticky 顶部输入框和文本之间露出 Thinking 行、编辑状态工具框和输入框宽度不一致。

### 🛠 Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **[Layout]**: 为消息滚动区域启用 `scrollbar-gutter: stable both-edges`，让滚动条不再改变消息栈的水平居中基准。
- **[Flow Polish]**: 将消息滚动区顶部留白收敛进 sticky prompt 自身遮罩，并移除 turn 内 prompt/body 的额外 gap，避免滚动时底层状态文本从缝隙露出。
- **[Tool Width]**: 将 diff 工具卡扩展到完整消息轨道宽度，让结构化工具块和用户输入框、底部 composer 齐平。
- **[Verification]**: 在浏览器 mock 页面复测消息栈、用户消息卡和 composer 的左右边界，确认三者对齐。

### 🧠 Design Intent (Why)

消息流在可滚动区域内居中，底部 composer 在不可滚动 shell 内居中；当消息区出现纵向滚动条时，滚动条占位会让消息栈的可用宽度偏左。使用双侧稳定 gutter 可以保留现有宽度和视觉层级，同时让消息轨道与输入框轨道使用一致的居中基准。

sticky prompt 的空白应由自身背景覆盖，而不是由滚动容器和 turn gap 分散承担，否则滚动时下方 Thinking/tool 状态会从间隙中露出。diff 属于结构化工具块，和普通正文不同，应占满信息流轨道以保持编辑状态的连续性。

### 📁 Files Modified

- `packages/desktop/src/renderer/styles.css`
- `docs/histories/2026-05/20260523-1242-align-composer-message-track.md`
