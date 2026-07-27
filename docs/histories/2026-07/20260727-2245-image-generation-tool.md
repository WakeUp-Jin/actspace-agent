## [2026-07-27 22:45] | Task: 实现主 Agent 图片生成工具

### 🤖 Execution Context

- **Agent ID**: `Codex /root`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop workspace-write`

### 📥 User Query

> 增加一个 OpenAI-compatible 图片生成工具，用户可填写 API Key、Base URL 和模型名称；默认模型为 `gpt-image-2`，`n` 默认 1、由模型按意图选择、最大 10。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、设计与安全文档。

**Key Actions:**

- **独立连接配置**：新增图片生成 Key、Base URL、模型名设置；Key 经 safeStorage 加密，默认 Base URL 为 DuckCoding。
- **工具执行链**：实现 `generate_image(prompt, size, n)`、URL/Base64 响应适配、超时/取消、SSRF 基础防护和 session artifact 原子写盘。
- **持久化与展示**：新增 `image_generation` preview、artifact 恢复、多图消息块和设置页配置表单。
- **验证**：覆盖 n 边界、部分成功、密钥持久化、工具曝光、流式 preview 与 session 恢复；未调用真实付费服务，UI 由用户手工验收。

### 🧠 Design Intent (Why)

图片生成与聊天模型、联网搜索的模型目录和计费边界不同，因此保持单例 OpenAI-compatible 连接，不并入 LLM Provider Registry。大体积图片只保存为会话产物，模型上下文、session 与日志只携带轻量本地引用，避免 Base64 膨胀和短期签名 URL 泄露。

### 📁 Files Modified

- `packages/agent-core/src/tools/tools/generate-image/`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/renderer/components/messages/GeneratedImageBlock.tsx`
- `packages/shared/src/settings.ts`
- `packages/shared/src/session.ts`
- `docs/design-docs/tool-system/agent-image-generation-tool.md`
