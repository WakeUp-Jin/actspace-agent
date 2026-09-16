# C 方案：工具流与子 Agent 消息布局 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260913-c-tool-stream-layout.md`
- **执行模式**：交互
- **开始时间**：2026-09-13
- **结束时间**：2026-09-13

## 执行时间线

### 步骤 1：只读审计与方向锁定

- **操作**：读取仓库前端规范、主题规范、Explore/Agent 组件、projection、selector、测试和当前工作树。
- **影响文件**：无代码变更。
- **决定**：复用现有 SubagentsPanel；新增 Explored 归组层；Agent 主行改为 C 方案两行状态入口；保留无关脏改动。
- **验证**：确认当前 `AgentRunBlock` 为卡片布局，`ToolActivityGroup` 为统一 `Worked for` 分组，`ExploreRunBlock` 不应继续作为主路径详情入口。

### 步骤 2：执行计划与执行记录

- **操作**：创建本计划和 exec-run 文档，等待各阶段验证结果持续补录。
- **影响文件**：本计划、执行过程、执行摘要。
- **决定**：不修改 Agent 执行协议；`agentKind` 只作为展示元信息。
- **验证**：待实现后补充。

### 步骤 3：类型透传与消息归组

- **操作**：新增可选 `agentKind` 展示元信息；固定 renderer、selector、App streaming projection 和右侧 Subagents header 统一透传 Agent/Explore 类型。新增 `ExploredActivityGroup`，将包含 Read/Search/Grep/Glob/Directory List 的连续过程段与其中的 Thought 归为同一活动组；没有直接探索工具的单独 Thought 保持独立；Agent/Explore 从主流内联 transcript 改为独立紧凑两行入口。
- **影响文件**：`packages/shared/src/session.ts`、`packages/shared/src/session-selectors.ts`、`apps/desktop/src/main/runtime-v2/fixed-renderer-tool-preview.ts`、`apps/desktop/src/renderer/App.tsx`、`apps/desktop/src/renderer/components/ConversationView.tsx`、`apps/desktop/src/renderer/components/messages/ExploredActivityGroup.tsx`、`apps/desktop/src/renderer/components/messages/AgentRunBlock.tsx`、`apps/desktop/src/renderer/components/right-panel/SubagentsPanel.tsx`。
- **决定**：`Explored` 只表达当前消息流中的基础探索活动；真正 child Session 的完整 transcript 只在右侧面板展示。旧 `display: "inline"` 值保留为数据兼容，但 renderer 主路径统一 panel。
- **验证**：shared typecheck、desktop renderer/electron typecheck、focused renderer/main tests 通过；`pnpm typecheck`、`pnpm build`、`pnpm check:docs`、`pnpm run check:frontend-theme`、`git diff --check` 通过。

### 步骤 4：回归与宿主验收

- **操作**：更新工具活动、Agent 行、Read 文件打开和 streaming 断言；尝试通过 `pnpm dev:log` 启动真实 Electron。
- **验证**：聚焦回归 68 项通过，覆盖 Explored、独立 Thinking、AgentRunBlock、SubagentsPanel、工具产物和 preview。此前全仓 renderer/main 回归记录为 472 项通过、5 项失败；本轮修正了其中 3 个旧 `Worked` 文案断言，当前针对相关流的回归仍有 2 项与本任务无关的 dirty-worktree 失败：写入流 fixture 和 workspace picker 异步断言。真实 Electron 启动在受控权限下成功完成 Vite/Electron 编译并打开开发进程，但 CUA 只能读取已安装 ActSpace 窗口，未能抓取开发窗口的实际截图，因此保留人工验收边界。
