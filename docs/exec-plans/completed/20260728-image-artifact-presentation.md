# 图片生成日志与会话产物栏改造

## 目标

修复开发态生成图片无法渲染的问题，把 `generate_image` 从大型行内预览卡改为与 Read 同级的单行工具日志，并在每轮最终回复下展示可点击的输出产物栏；点击生成图片后通过受控 main/preload IPC 在右侧面板预览。

## 范围

- 包含：
  - `image_generation` 工具过程行的轻量化与参数截断。
  - 每轮输出产物聚合组件，首版收录生成图片以及 `write_file` / `edit_file` 的输出文件。
  - Session Artifact 图片读取 IPC、路径边界校验、MIME/大小校验和右侧 Image Tab 接线。
  - 流式态、持久化恢复、点击预览和失败状态测试。
  - 图片工具、消息区、右侧面板设计文档和 history 同步。
- 不包含：
  - Read/Grep/Glob 等输入文件进入产物栏。
  - 图片在聊天正文中直接展示缩略图。
  - 生成图片删除、导出、复制到 workspace 或资产库管理。
  - 自动启动 Electron 或代替用户进行 UI 验收。

## 背景

- 相关文档：
  - `docs/design-docs/tool-system/agent-image-generation-tool.md`
  - `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`
  - `docs/design-docs/frontend/front-中间消息区规范.md`
  - `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
- 相关代码路径：
  - `packages/desktop/src/renderer/components/messages/ToolLogLine.tsx`
  - `packages/desktop/src/renderer/components/messages/TurnOutputArtifacts.tsx`
  - `packages/desktop/src/renderer/components/ConversationView.tsx`
  - `packages/desktop/src/renderer/components/messages/ToolLogLine.tsx`
  - `packages/desktop/src/renderer/components/right-panel/RightPanelContext.tsx`
  - `packages/desktop/src/renderer/components/RightPanel.tsx`
  - `packages/desktop/src/main/index.ts`
  - `packages/desktop/src/preload/index.ts`
  - `packages/shared/src/ipc.ts`
- 已知约束：
  - 开发态 renderer 来源为 `http://127.0.0.1:5173`，Electron 会拒绝其直接加载本地 `file://` 图片。
  - 已生成文件本身有效；故障点是 renderer 资源访问边界。
  - renderer 不得获得任意本地文件读取能力，Session Artifact 必须在 main 侧按当前 session 目录校验。

## 风险

- 风险：把绝对路径直接交给 IPC 会扩大任意文件读取面。
  - 缓解方式：IPC 同时接收 `sessionId` 与 artifact path，main 只允许解析到该 session 的 `artifacts/` 子树。
- 风险：图片 Base64 data URL 增加 renderer 内存占用。
  - 缓解方式：只在用户点击产物时读取单张图片，并限制文件大小；聊天区不预加载缩略图。
- 风险：工具过程与产物栏重复展示同一信息。
  - 缓解方式：过程行只表达动作、参数和状态；产物栏只表达可打开的最终输出对象。
- 风险：`write_file` / `edit_file` 输出路径可能在 workspace 外。
  - 缓解方式：首版产物栏可列出路径，但只有已支持安全读取的对象才提供右侧预览；生成图片走 Session Artifact IPC，workspace 文件复用现有 workspace read IPC。

## 里程碑

1. 建立 Session Artifact 读取契约和安全服务，并用测试复现 `file://` 失败后的正确替代链路。
2. 将 `image_generation` 纳入工具过程组并改为单行日志。
3. 新增 Turn Output Artifacts 组件，聚合本轮生成/修改文件并打开右侧面板。
4. 补齐恢复、交互、主题、文档和 history 验证后归档计划。

## 验证方式

- 命令：
  - `pnpm run typecheck`
  - Desktop main/renderer 定向 Vitest。
  - Shared session selector 定向 Vitest。
  - `pnpm check:frontend-theme`
  - `pnpm check:docs`
  - `pnpm check:secrets`
  - `git diff --check`
- 手工检查：
  - 由用户确认单行工具状态、最终回复产物栏、点击后右侧图片渲染。
- 观测检查：
  - 自动化测试确认 renderer 不再生成 `file://` 图片地址。
  - main 测试确认 session artifacts 之外的路径被拒绝。

## 进度记录

- [x] 从真实日志定位开发态 `file://` 被 Electron 拒绝。
- [x] 完成 Session Artifact IPC 与边界测试。
- [x] 完成图片工具单行过程日志。
- [x] 完成最终回复下的输出产物栏与右侧预览接线。
- [x] 完成分层验证、文档、history 和计划归档。

### 实际验证结果

- `pnpm run typecheck`：通过。
- Agent Core bridge 定向测试：33 项通过。
- Shared session selector 定向测试：16 项通过。
- Desktop Session Artifact、产物栏、消息流、Workspace 文件树与右侧面板定向测试：44 项通过。
- `pnpm check:frontend-theme`：通过。
- `pnpm check:docs`：通过。
- `pnpm check:secrets`：通过。
- `git diff --check`：通过。
- 按用户要求未启动 Electron；真实图片产物点击与视觉密度由用户手工验收。

## 决策记录

- 2026-07-28：聊天过程区不再直接渲染生成图片；工具状态与可打开产物分层展示。
- 2026-07-28：产物栏只收录本轮输出对象，不收录 Read/Grep 等输入对象。
- 2026-07-28：不关闭 Electron `webSecurity`，不放宽 renderer 的本地文件权限；通过受控 IPC 读取单个 Session Artifact。
- 2026-07-28：生成图片仅在用户点击时读入右侧面板，避免聊天区批量 Base64 预加载。
- 2026-07-28：Write/Edit preview 增加可选输出绝对路径与 workspace 相对路径，供最终产物栏恢复；普通工具行仍只展示短文件名。
- 2026-07-28：产物行悬浮显示完整路径；右键菜单由 main 按 session/workspace realpath 边界重新解析目标后打开，renderer 不获得任意本地文件操作能力。
