## [2026-08-10] | Task: 合并用户请求与 Todo 执行卡片

### 📥 User Query

将 Todo 与已发送的用户输入合并为同一个执行卡片，避免 Todo 作为消息流中的独立滚动块。

### 🛠 Changes Overview

- 用户请求和最新 Todo 快照共用一层外框、背景和圆角。
- Todo 从 assistant body 中移除，固定在对应用户请求卡片的下方。
- 为 `UserMessage` 和 `TodoListBlock` 增加嵌入执行卡片的展示变体。
- 增加 DOM 回归断言，验证 Todo 位于同一执行卡片且在用户请求之后。

### 🧠 Design Intent (Why)

Todo 是本轮执行状态的附属信息，应与触发执行的用户请求形成一个视觉单元；执行过程和最终回复仍作为卡片下方的独立内容呈现。
