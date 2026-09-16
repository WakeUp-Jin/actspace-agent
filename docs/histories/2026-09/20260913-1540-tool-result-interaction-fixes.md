## [2026-09-13 15:40] | Task: 修复工具结果交互与后台通知展示

### 🤖 Execution Context

- **Agent ID**: `root`
- **Base Model**: `Codex`
- **Runtime**: `ActSpace desktop v2`

### 📥 User Query

> 分析并修复工具测试中后台 task notification 泄露、list/glob 无法展开、read 无法打开右侧、Explore 展示不统一、图片生成错误 hover-only 等问题。

### 🛠 Changes Overview

**Scope:** `@actspace/core-agent`、`@actspace/core-agent-loop`、`@actspace/shared`、`@actspace/tools-core-tools`、Desktop main/renderer。

**Key Actions:**

- **后台通知来源**：为 Inbox enqueue/claim 和 renderer projection 增加 `task_notification` typed provenance；模型继续收到通知，用户侧 selector 隐藏该消息。
- **结果预览**：补齐历史回放的 `resultPreview`，并为 Read/List/Grep/Glob/Directory List 使用独立的 `tool-result-*` disclosure 样式。
- **右侧文件打开**：Read 仅对当前 workspace 内可确认的相对路径提供 Open file 动作，复用既有 workspace IPC 和文件 Tab 映射。
- **Explore 统一**：Explore 与通用 Agent 均进入 SubAgent 右侧详情视图，不再在主消息区内联展开。
- **图片错误**：图片失败/warning 可点击展开；provider 返回 HTML、空响应或非法 JSON 时归一化为稳定错误摘要，成功产物仍由 Artifacts 打开。

### 🧠 Design Intent (Why)

工具的执行事实、模型上下文和用户展示需要分层。来源信息必须随事件跨越 Inbox、projection 和 selector 边界；结果详情必须是 bounded typed preview，而不是依赖文本长度或 Web 专用样式；独立 child Session 只保留一个右侧详情入口；文件和图片读取继续经过 main/preload 的安全边界。

### 📁 Files Modified

- `packages/core/agent/src/inbox.ts`
- `packages/core/agent-loop/src/loop.ts`
- `packages/shared/src/session-selectors.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-tool-preview.ts`
- `apps/desktop/src/renderer/components/ConversationView.tsx`
- `apps/desktop/src/renderer/components/messages/ToolLogLine.tsx`
- `apps/desktop/src/renderer/styles/tool-result.css`
- `packages/tools/core-tools/src/image/node-image-ports.ts`
- `docs/design-docs/frontend/front-agent-tool-stream-rendering.md`
- `docs/design-docs/collaboration/agent-explore-subagent.md`
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`
