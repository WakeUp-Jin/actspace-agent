# 工具结果交互与后台通知修复 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260913-tool-result-interaction-fixes.md`
- **执行模式**：交互
- **开始时间**：2026-09-13
- **结束时间**：2026-09-13

## 执行时间线

### 计划创建

- **操作**：根据截图、源码审计和用户确认的 Explore 交互决策，创建本执行计划与执行记录目录。
- **影响文件**：计划最初创建于 `docs/exec-plans/active/20260913-tool-result-interaction-fixes.md`，完成后归档到 `completed/`；同时创建本文件和 `execution-summary.md`。
- **决定**：Explore 统一为右侧 SubAgent 详情视图；不再保留主消息内联 transcript。
- **验证**：计划自审完成，未修改业务代码。

### 阶段 A：task notification provenance

- **操作**：为 Inbox item、enqueue/claim 事件和 fixed renderer user projection 增加可选 `task_notification` source；Bash 后台通知从 AgentLoop 注入时显式携带该 source。
- **影响文件**：`packages/core/agent/src/inbox.ts`、`packages/core/agent-loop/src/loop.ts`、`apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts`、相关 selector/projection tests。
- **结果**：模型仍能收到后台通知；用户侧 selector 能依据 source 隐藏通知，不依赖 XML 文本正则。
- **验证**：shared selector 75 tests、core agent-loop 13 tests、desktop projection 16 tests 通过；普通用户消息与通知来源区分保持有效。

### 阶段 B：结果预览与历史回放

- **操作**：历史 selector 补齐 read/search/grep/glob/directory_list 的 `resultPreview`；新增独立 `tool-result-*` 样式和通用 disclosure，限制预览为 bounded 行列表。
- **影响文件**：`packages/shared/src/session-selectors.ts`、`apps/desktop/src/renderer/components/messages/ToolLogLine.tsx`、`apps/desktop/src/renderer/styles/tool-result.css`、renderer/shared tests。
- **结果**：list/glob/grep/read 终态显示 Chevron，展开内容不再复用 Web URL 样式；空/运行中结果仍保持单行。
- **验证**：shared selector focused 21 tests、desktop artifact/tool presentation tests 通过；`check:frontend-theme` 通过。

### 阶段 C：Read 右侧文件打开

- **操作**：ConversationView 将 read 工具接入既有 `readWorkspaceFile → tabFromFile → openTab` 链路；只对当前 workspace 内的安全相对路径显示 Open file 动作。
- **结果**：Chevron 只展开读取摘要，Open file 单独打开右侧文件 Tab；越界、绝对路径、缺少 workspace 或 IPC 失败不会猜测读取目标。
- **验证**：renderer tool presentation、conversation tooltip focused tests 27 tests 通过；desktop typecheck 通过。

### 阶段 D：Explore 统一右侧视图

- **操作**：Explore preview 固定为 `display: "panel"`，ConversationView 移除主消息内联 Explore 路由，统一复用 AgentRunBlock/SubagentsPanel。
- **结果**：Explore 与通用 Agent 的 child Session 详情入口统一为右侧 SubAgent panel。
- **验证**：fixed renderer tool preview 26 tests 通过；相关 renderer 回归通过。

### 阶段 E：图片错误交互与响应归一化

- **操作**：图片工具行改为通用 disclosure；成功图片仍由 TurnOutputArtifacts 打开右侧 image Tab；main 侧在 JSON parse 前分类 HTML/空响应/非法 JSON。
- **影响文件**：`packages/tools/core-tools/src/image/node-image-ports.ts`、`apps/desktop/src/renderer/components/messages/ToolLogLine.tsx`、图片测试。
- **结果**：截图中的 HTML 200 不再暴露 `Unexpected token '<'`，而是 bounded 的 “returned HTML instead of JSON”；错误可点击展开，不依赖 hover。
- **验证**：core-tools 16 tests、desktop focused 44 tests 通过，包含 HTML provider fixture。

## 遇到的问题

- 首次并行运行 desktop typecheck 时，shared 包刚被 clean，导致 desktop 读取到暂时为空的 `packages/shared/dist`，出现大量级联缺少导出错误；按 shared → core-agent → core-agent-loop → desktop 的依赖顺序重新 build 后恢复，最终 typecheck 通过。
- desktop package 的完整 test 脚本仍有两个与本计划无关的既有失败：`sidebar.test.tsx` 的 pin id 期望与实际不一致；`app-streaming-user-message.test.tsx` 的 `createSession` title 期望与实际调用不一致。相关目标测试均通过，未改动这些基线行为。

## 跳过或推迟的事项

- 未执行真实 Electron、真实图片 Provider、真实 Chrome/Browser 或手工双主题截图验收；这些属于 `docs/FRONTEND_VERIFICATION.md` 的外部门禁。
