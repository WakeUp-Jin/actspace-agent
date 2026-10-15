# 左侧会话栏改版 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261015-sidebar-redesign.md`
- **执行过程**：`docs/exec-runs/20261015-sidebar-redesign/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（Electron 手测待做）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 标题行搜索 | `SidebarSectionHeader.tsx`、`use-session-search.ts`、`SidebarSessions.tsx` | 去掉「搜索本机会话」行，搜索改为标题行图标，展开成搜索框，Esc 关闭 |
| 可折叠分区标题 | `SidebarSectionHeader.tsx`、`sidebar-view-store.ts` | 点文字折叠，悬停露箭头（Cursor）；折叠状态持久化 |
| 视图选项 | `SidebarViewMenu.tsx`、`sidebar-view.ts`、`sidebar-view-store.ts` | 按工作区 / 单列表 / 按时间；手动排序 / 最近更新；隐藏 / 全部 / 仅已归档；恢复默认 |
| 拖拽排序 | `use-sidebar-drag.ts`、`DropIndicator.tsx` | 会话和工作区都能拖（DSH）；在「最近更新」下拖会切到手动排序并提示 |
| 按时间分组 | `SidebarTimeView.tsx`、`sidebar-view.ts` | 需要处理 / 今天 / 昨天 / 近 7 天按天 / 本月更早 / 往月 / 往年 |
| 每组 5 条 | `SessionList.tsx`、`use-remote-paging.ts` | 「展开其余 N 个会话」→「加载更多会话」→「收起」 |
| 会话行 | `SessionRow.tsx`、`session-status.ts`、`WorkspaceSection.tsx` | 状态点含「跑完未看」；中文相对时间；悬停操作；文件夹↔箭头交叉淡入；每个工作区的 ⋯ 和 + |
| 已归档 | `use-archived-sessions.ts`、`SessionContextMenu.tsx`、`mock/handlers.ts` | 按筛选显示已归档会话，可取消归档 |
| Mock | `mock/scenarios/sidebar.ts` | `?mock=sidebar` |

## 人工验证指引

### 必须验证

1. **拖拽排序（Electron）**
   - 验证方式：`pnpm --filter @actspace/desktop dev`，在按工作区视图里拖一个会话到同组另一位置，再拖一个工作区标题。
   - 预期结果：出现插入线；放下后顺序保持；首次拖动时标题下出现「已切换为手动排序」，视图选项按钮带改动点；重启后顺序还在。
2. **跑完未看**
   - 验证方式：在会话 A 发一条消息，立刻切到会话 B，等 A 跑完。
   - 预期结果：A 行上出现未读点；切到「按时间」时 A 在「需要处理」里；打开 A 后点消失。
3. **取消归档**
   - 验证方式：归档一个会话；视图选项 → 全部对话；在该行点「取消归档」。
   - 预期结果：行回到正常状态，切回「隐藏已归档」后仍在。

### 建议验证

1. **浏览器 mock**
   - 验证方式：`pnpm --filter @actspace/desktop dev:renderer`，打开 `http://127.0.0.1:5173/?mock=sidebar`，切换三种视图、亮暗主题、搜索。
   - 预期结果：与 `docs/design-docs/frontend/sidebar-redesign-demo.html` 一致。

## Agent 已完成的验证

- 类型检查：`pnpm --filter @actspace/desktop typecheck` 通过。
- 单测：desktop 全量 235 个文件、1917 个用例通过；新增 `sidebar-view.test.ts`（21）和 `sidebar-views.test.tsx`（9）。
- 检查脚本：`check:frontend-theme`、`check:renderer-bridge`、`check:current-docs` 通过、`check:frontend-tokens` 通过（原生按钮基线经用户审批：`SidebarSectionHeader.tsx` 记 1，`Sidebar.tsx` 5→4，`SessionRow.tsx` 3→1）。
- 浏览器截图：`?mock=sidebar` 亮色、暗色、悬停、搜索、菜单、按时间、单列表、归档、拖拽后、恢复默认共 14 张，对照 Demo 无偏差。

## 已知风险和遗留事项

- `?mock=sidebar` 没有运行中、待审批、失败、跑完未看的状态，「需要处理」只能在 Electron 或单测里看到。
- 本次改动未提交，和默认工作区计划未提交的改动在同一分支 `fix/session-default`，共用 `Sidebar.tsx`、`WorkspaceSection.tsx`、`session-grouping.ts` 等文件。

## 后续建议

- Electron 手测通过后把计划移到 `completed/`。
