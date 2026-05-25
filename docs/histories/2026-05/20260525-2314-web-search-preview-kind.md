## [2026-05-25 23:14] | Task: WebSearch preview kind

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 将网络搜索工具从 generic 工具预览中独立出来，前端组件命名为 WebSearch，只显示搜索关键词或 URL，并修复工具执行中没有闪动反馈的问题。

### 🛠 Changes Overview

**Scope:** `packages/shared`, `packages/agent-core`, `packages/desktop`, `docs`

**Key Actions:**

- **新增 preview kind**: 为 `web_search` 增加正式的 `ToolUiPreview` / `MessageBlock` 类型，区分 query 搜索和 URL 页面读取。
- **更新 WebSearch UI**: 前端使用 `WebSearch` 展示网络搜索动作，只显示参数和运行状态，不显示搜索结果正文。
- **同步流式与恢复展示**: bridge、streaming state 和 session selector 统一使用 `web_search` preview，避免运行中和刷新后表现不一致。
- **补充验证与文档**: 增加 bridge / renderer 测试，并更新工具预览设计规范。

### 🧠 Design Intent (Why)

网络搜索结果是模型继续推理的工具上下文，不是用户可见的工具日志正文。将 `web_search` 从 `generic` 中独立出来，可以让 UI 以稳定的一行动作记录呈现，同时保留完整结果给模型和排障链路使用。

### 📁 Files Modified

- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/agent-core/src/tools/tools/web-search/definition.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/messages/ToolLogLine.tsx`
- `packages/desktop/src/renderer/styles.css`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `docs/design-docs/agent-core/tool-preview-design-guidelines.md`
