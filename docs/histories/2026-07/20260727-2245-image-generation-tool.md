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
- **持久化与展示**：新增 `image_generation` preview、artifact 恢复、图片工具状态与设置页配置表单；后续改为单行过程日志和 turn 级产物栏。
- **验证**：覆盖 n 边界、部分成功、密钥持久化、工具曝光、流式 preview 与 session 恢复；未调用真实付费服务，UI 由用户手工验收。

### 🧠 Design Intent (Why)

图片生成与聊天模型、联网搜索的模型目录和计费边界不同，因此保持单例 OpenAI-compatible 连接，不并入 LLM Provider Registry。大体积图片只保存为会话产物，模型上下文、session 与日志只携带轻量本地引用，避免 Base64 膨胀和短期签名 URL 泄露。

### 📁 Files Modified

- `packages/agent-core/src/tools/tools/generate-image/`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/renderer/components/messages/ToolLogLine.tsx`
- `packages/desktop/src/renderer/components/messages/TurnOutputArtifacts.tsx`
- `packages/shared/src/settings.ts`
- `packages/shared/src/session.ts`
- `docs/design-docs/tool-system/agent-image-generation-tool.md`

## [2026-07-28] Follow-up: 修复图片预览并收敛产物展示

- **真实原因**：开发态 renderer 来自 HTTP origin，Electron 拒绝直接加载生成图片的 `file://` 地址；生成文件本身有效。
- **安全读取**：新增 Session Artifact IPC，main 校验 session artifacts realpath 边界、文件大小和图片魔数，再按点击返回单张 data URL。
- **消息收敛**：图片生成过程改为 Read 风格单行日志，长参数单行省略并进入 `Worked for`。
- **产物浏览**：最终回复下新增 `Artifacts` 组件，聚合生成图片与完成的 Write/Edit 输出；点击后在右侧面板预览。
- **路径与桌面操作**：产物行悬浮显示完整路径，右键打开 Electron 原生菜单，支持 Cursor/默认应用打开、复制路径、复制图片或文件内容、Finder 定位。Main 侧重新校验 session/workspace realpath 边界后才执行。
- **验证边界**：自动化覆盖 IPC 逃逸、会话恢复、单行状态、产物栏顺序和右侧打开；Electron UI 继续由用户手工验收。
- **Follow-up 自动验证**：Desktop 64 个测试文件、513 项测试全部通过；根类型检查、生产构建、主题颜色契约、文档骨架、密钥扫描和 diff 格式检查通过。按用户要求未启动 Electron UI。
