## [2026-05-23 22:45] | Task: 前后端流式对接

### 🤖 Execution Context

- **Agent ID**: `claude-opus-4-6`
- **Base Model**: `claude-opus-4-6`
- **Runtime**: `Cursor Agent`

### 📥 User Query

> 执行前后端对接计划：将 desktop/main 从旧的 createAgentRuntime().runTurn() 迁移到新的 Agent.run() + 实时 IPC 事件推送，让前端能够流式收到 thinking/text/tool_start/tool_end 等状态。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`, `packages/desktop`, `packages/shared`（未修改，仅消费）

**Key Actions:**

- **bridge.ts 桥接层**: 新增 `engine/bridge.ts`，将 AgentEvent 实时映射为 RuntimeStreamEvent（turn_started/thinking_delta/text_delta/tool_started/tool_finished/turn_finished），并聚合为 AgentTurnResult。
- **main IPC 迁移**: 将 `desktop/main/index.ts` 从旧的 `createAgentRuntime()` 迁移到新的 `createLLMService + createToolManager + ContextManager + runTurnWithAgent`，通过 `win.webContents.send("agent:stream", event)` 推送流式事件。
- **preload stream 订阅**: 在 preload 中暴露 `onAgentStream` 方法，让 renderer 可以订阅 `agent:stream` 事件通道。
- **renderer 流式 UI**: App.tsx 新增 `StreamingState` 管理（thinkingText/assistantText/activeTools），在执行过程中将 RuntimeStreamEvent 转为临时 MessageBlock 实时渲染，turn 完成后用最终结果替换。
- **Composer 发送逻辑**: Composer 组件接入真实 `onSend` 回调和 `isStreaming` 禁用状态，支持 Enter 快捷键发送。
- **文档同步**: 更新 ARCHITECTURE.md 中 IPC 契约（新增 `agent:stream` 推送通道）和数据流描述。

### 🧠 Design Intent (Why)

旧架构是纯请求-响应模式（one-shot），用户必须等 turn 完全执行完才能看到任何结果。新架构采用双通道模式：`invoke` 返回完整 `AgentTurnResult`（用于持久化），`send` 实时推送中间 `RuntimeStreamEvent`（用于 UI 更新）——两者互不干扰。

renderer 状态分为 `streamingBlocks`（正在流式中的 delta 数据）和 `sessionRecord`（完整的已持久化数据），`turn_finished` 时用后者替换前者，保证最终一致性。

### 📁 Files Modified

- `packages/agent-core/src/engine/bridge.ts`（新建）
- `packages/agent-core/src/engine/index.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `docs/ARCHITECTURE.md`
