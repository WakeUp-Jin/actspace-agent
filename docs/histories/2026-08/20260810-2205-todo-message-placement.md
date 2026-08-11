## [2026-08-10] | Task: 调整 Todo 消息位置与视觉密度

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

将 Todo 放在已发送用户消息下方，并简化当前 Todo UI。

### 🛠 Changes Overview

**Scope:** `packages/desktop`、Todo 设计文档

**Key Actions:**

- 将每轮 Todo 最新快照移动到用户消息之后、工具执行过程之前。
- 同一轮只渲染最新 Todo，避免多个更新状态在消息流中重复出现。
- 缩短标题行和列表间距，保留运行中展开、已完成折叠与键盘可访问交互。
- 添加流式渲染顺序回归测试。

### 🧠 Design Intent (Why)

Todo 是当前 AgentRun 的执行状态，不是普通工具日志。把它放在用户请求之后，用户能在看到请求后立即理解执行计划；只呈现最新快照则避免状态更新制造额外视觉噪音。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/messages/TodoListBlock.tsx`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `docs/design-docs/tool-system/agent-todo-tools.md`
