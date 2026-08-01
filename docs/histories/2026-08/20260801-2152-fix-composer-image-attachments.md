## [2026-08-01 21:52] | Task: Fix Composer image attachments

### Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-5
- **Runtime**: Codex Desktop workspace

### User Query

> 修复图片粘贴后缩略图空白、无法预览和无法发送的问题；缩小删除按钮，并选择与现有工作台一致的图片查看交互。

### Changes Overview

**Scope:** `@actspace/shared`, Desktop main / preload / renderer, Composer and right-panel integration.

**Key Actions:**

- 文件选择图片由 Electron main 生成有界 data URL 缩略图，不再让 Vite renderer 加载本地 `file://`。
- 新增剪贴板图片导入 IPC；main 校验 PNG / JPEG / WebP 文件签名与 20 MiB 上限后写入应用临时附件目录。
- Composer 图片缩略图改为可聚焦按钮，点击后使用现有右侧 Image Tab 预览；移除按钮收紧到 18px，并与预览点击区分离。
- 已发送用户消息中的图片缩略图也改为可聚焦按钮，复用同一个右侧 Image Tab，不再只显示静态缩略图。
- 移除“主模型不原生支持图片就禁用发送”的 UI 硬阻断；原生视觉输入与文本模型 `inspect_image` 委托继续由 runtime 决定。
- 预览 data/blob URL 只留在 renderer 内存，构造 `RunAgentInput` 时剥离，避免 Base64 进入 session 持久化。
- 补充图片落盘、粘贴、预览、移除、DeepSeek 文本模型发送和持久化边界测试。

### Design Intent (Why)

右侧面板已经是 ActSpace 的对象浏览区域，因此图片查看复用 Image Tab，不再增加模态交互。图片附件同时包含三个不同职责：renderer 预览、runtime 本地路径和模型输入；把它们混成一个 `file://` 或 Base64 字段会分别触发 Electron 加载限制、工具无法读取或会话膨胀，因此在 IPC 与发送边界显式分层。

### Files Modified

- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/composer-attachment-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/App.tsx`
- `docs/design-docs/frontend/front-聊天输入框规范.md`

### Verification

- Composer 与 main 定向测试通过，共 42 项。
- App 图片附件端到端定向测试通过，覆盖文本模型发送、右侧图片 Tab 和 preview URL 剥离。
- 已发送消息图片按钮的组件测试 5/5 通过，App 定向回归确认按钮可用并复用右侧 Image Tab。
- Desktop renderer / Electron 类型检查通过。
- Desktop 全量构建、主题检查、文档检查和 `git diff --check` 通过。
- 真实 Electron UI 与功能验收由用户手动完成；验收前 execution plan 保留在 `active/`，不宣称已完成视觉验收。
