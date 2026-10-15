# 左侧会话栏改版 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261015-sidebar-redesign.md`
- **执行模式**：交互
- **开始时间**：2026-10-15 23:10
- **结束时间**：2026-10-15 23:30（Electron 手测待做）

## 执行时间线

### 步骤 1：调研与计划

- **操作**：读侧栏组件、会话列表分页、归档、状态来源、偏好持久化和检查脚本；写执行计划。
- **影响文件**：`docs/exec-plans/active/20261015-sidebar-redesign.md`、`docs/exec-plans/README.md`。
- **决定**：见计划「决策记录」。
- **验证**：无代码改动。

### 步骤 2：纯函数与视图 store（T1–T2）

- **操作**：`sidebar-view.ts`（时间分桶、排序账本、每组 5 条、相对时间）；`sidebar-view-store.ts`（`actspace.sidebar.view.v1`，选项、手动顺序、折叠状态）。
- **验证**：`sidebar-view.test.ts` 21 个用例通过。

### 步骤 3：状态与操作（T3–T4）

- **操作**：`session-status.ts` 增加「跑完未看」与 `needsAttention`；mock 的归档支持取消；`use-archived-sessions.ts` 按筛选拉已归档会话；右键菜单和行上已归档会话显示「取消归档」。
- **验证**：`session-status.test.ts`、`app-streaming-user-message.test.tsx` 新用例通过。

### 步骤 4：组件（T5–T10）

- **操作**：`SidebarSectionHeader.tsx`（分区和时间段共用标题、标题行搜索框）、`SidebarViewMenu.tsx`、`use-sidebar-drag.ts` + `DropIndicator.tsx`、`SidebarSessions.tsx`、`SidebarTimeView.tsx`、`use-remote-paging.ts`；`SessionRow`、`SessionList`、`WorkspaceSection`、`Sidebar` 改造。
- **决定**：拆分方式见计划「决策记录」。
- **验证**：`sidebar-views.test.tsx` 9 个用例通过。

### 步骤 5：mock、全量检查与截图（T11–T12）

- **操作**：新增 `?mock=sidebar`；更新受影响的旧测试；浏览器截 14 张图（亮色、暗色、搜索、菜单、按时间、单列表、归档、拖拽）。
- **验证**：typecheck 通过；desktop 全量 235 个文件、1917 个用例通过；`check:frontend-theme`、`check:renderer-bridge`、`check:current-docs` 通过；`check:frontend-tokens` 仅剩原生按钮基线一项。

### 步骤 6：文档（T13）

- **操作**：更新 `front-左侧会话栏规范.md`、`FRONTEND_VERIFICATION.md`、计划进度与决策；写执行摘要和 history。

## 遇到的问题

- **问题**：同一分支上有默认工作区计划未提交的改动，涉及侧栏文件。
  - **原因**：另一个会话刚完成该计划，尚未提交。
  - **应对**：在其基础上增量修改，不回退其行为。

- **问题**：侧栏用例大批失败（28 个）。
  - **原因**：折叠状态存进 localStorage，在用例之间串了。
  - **应对**：`test/setup.ts` 的 afterEach 清掉 `actspace.sidebar.view.v1`。
- **问题**：IPC 预算、mock bridge、流式消息用例失败。
  - **原因**：每组改为先显示 5 条；`listPage` 本来就不返回已归档会话。
  - **应对**：预算用例切到单列表并改文案；mock bridge 断言未归档数量；流式用例先点「展开其余」。
- **问题**：`SidebarSectionHeader.tsx` 有 1 个原生 `<button>`，新文件基线是 0，`check:frontend-tokens` 失败。
  - **原因**：分区标题是「整段文字可点 + 悬停箭头」，`Button` 原语的 className 只允许布局类，放不下这套样式。
  - **应对**：手改 `scripts/native-button-baseline.json`（加 1，同时把 `Sidebar.tsx` 5→4、`SessionRow.tsx` 3→1，总数下降）第一次被权限拦下；用户随后手动审批，改完后 `check:frontend-tokens` 通过。

## 跳过或推迟的事项

- 按工作区树分组：用户决定不做。
- Electron 手测：拖拽、跑完未看、取消归档。
