## [2026-09-27 11:00] | Task: 优化会话归档响应

### 🤖 Execution Context

- Agent ID: codex
- Base Model: GPT-6
- Runtime: Codex Desktop

### 📥 User Query

> 点击归档时删除响应较慢，需要优化。

### 🛠 Changes Overview

Scope: apps/desktop renderer

Key Actions:

- 乐观更新侧栏：单会话归档请求发出前立即移除目标行。
- 失败恢复：IPC 返回失败或抛错时重新读取会话列表，恢复真实状态。
- 回归覆盖：增加慢请求成功和失败恢复测试。

### 🧠 Design Intent (Why)

归档的 Journal 持久化仍然等待完成，保证数据可靠性；侧栏展示与持久化等待解耦，让用户先看到明确的操作结果，并在失败时回滚到持久化事实。

### 📁 Files Modified

- apps/desktop/src/renderer/App.tsx
- apps/desktop/src/renderer/test/app-streaming-user-message.test.tsx
