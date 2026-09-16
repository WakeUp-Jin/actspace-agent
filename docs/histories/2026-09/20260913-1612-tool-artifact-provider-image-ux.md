## [2026-09-13 16:12] | Task: 修复工具进度、文件产物、模型目录与图片链路

### 🤖 Execution Context

- **Agent ID**: `root`
- **Base Model**: `Codex`
- **Runtime**: `ActSpace desktop v2`

### 📥 User Query

> Write/Edit 没有明显执行状态、生成文件没有通过右侧视图打开、聊天代码块渲染难看、Kimi 模型目录过时、确认图片传输链路，并修复发送完成后的图片显示。

### 🛠 Changes Overview

**Scope:** 工具执行进度、Session Artifact、右侧文件 Tab、聊天 Markdown、Kimi provider discovery、DeepSeek 图片 wire protocol 和 Desktop 图片 hydration。

**Key Actions:**

- Write/Edit 工具发布累计 `additions/deletions`，renderer 在尾部显示变化行数，设置页提供关闭开关；完成态以最终统计校正。
- Write/Edit 产物携带 workspace 相对路径；Artifacts 和回复中的安全本地链接统一通过 Main workspace IPC 打开右侧文件 Tab。
- 聊天 Markdown 使用专用 fenced-code renderer，加入语言标识、复制动作、滚动容器和主题 token；不改变外链安全边界。
- Kimi 使用 `${baseUrl}/models` 发现模型和能力，加入缓存、设置入口与静态 fallback，兼容 `.cn`/`.ai` base URL。
- 图片发送保持“本地文件 → Session-owned Artifact → provider wire payload”；UserMessage 通过受控 preview IPC 在当前会话和重载后 hydration，Journal 不保存 data URL。
- DeepSeek 直连 OpenAI 兼容路线使用 Files API `purpose=user_data` 上传并发送 `file_id`；进程内按凭据/会话/artifact 缓存，过期自动重新上传，其他 provider 仍用已校验的内联图片协议。

### 🧠 Design Intent (Why)

执行进度、持久化事实、provider wire payload 和 renderer 预览是四种不同表示。把它们分层后，工具可以低噪声地持续反馈，图片不需要写入 Journal，远端 file id 也不会成为本地恢复的前置条件；同时单一供应商的 Files API 能力不会污染其他 provider 的协议。

### ✅ Verification

- `pnpm run typecheck` 通过。
- `git diff --check` 通过。
- `@actspace/llm-pi-ai` typecheck 通过；DeepSeek Files/Vision/tool-images/legacy 回归共 39 tests 通过。
- Desktop 工具预览、流式、Kimi 目录、provider network、Markdown、图片 hydration、右侧 artifacts 共 89 tests 通过。

### ⚠️ Remaining Gates

- 尚未执行真实 DeepSeek credentialed upload、真实 Kimi refresh，以及 Electron/浅深主题截图和会话 `2ef729eb-9876-4f08-b32b-2fe70b7578cc` 的人工验收。
- `pnpm test` 另受既有 package-boundary 深层源码导入检查阻断；本轮没有修改无关测试。
- 未执行 Git stage/commit/push；工作区其他既有修改保持不动。
