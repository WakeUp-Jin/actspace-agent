# 左侧会话栏改版：DSH 的干净 + Cursor 的细节 + 按时间分组

> 2026-10-18 状态校准：侧栏实现已合入 main；后续登记刷新和焦点修复见统一验收与修复记录。 下文保留原始实施决策与过程；最新分项证据见 [近期验收](../../exec-runs/20261018-recent-features-acceptance/acceptance.md)。
## 目标

按用户 2026-10-15 认可的 Demo（`docs/design-docs/frontend/sidebar-redesign-demo.html`）改造 Desktop 左侧会话栏：

- 去掉「搜索本机会话」整行，改成分区标题上的搜索图标，在标题行内展开。
- 分区标题和工作区行可以折叠，用 Cursor 式的文件夹 ↔ 箭头淡入淡出和箭头旋转。
- 新增视图选项：
  - 分组：按工作区、单列表、按时间。
  - 排序：手动排序、最近更新。
  - 归档筛选：隐藏已归档、全部对话、仅显示已归档。
- 手动排序支持拖拽，凡是 DSH 能拖的都能拖。
- 按时间分组时，顶部有「需要处理」。
- 每组先显示 5 条，用「展开其余 N 个会话」展开。
- 状态槽对齐 DSH：运行中转圈、待审批、失败、完成未读。
- 时间显示改为中文相对时间。

## 范围

- 包含：
  - `apps/desktop/src/renderer/components/Sidebar.tsx` 和 `components/sidebar/*` 的改造与拆分。
  - 新增视图偏好 store，存在 localStorage。
  - 「完成未读」状态：本窗口内存，存在 `session-local-store` 的 `unread` 标志。
  - 侧栏里恢复已归档会话的操作（`onRestoreSession`）。
  - mock 场景补齐演示数据。
  - 单测、集成测试同步。
  - 文档：`front-左侧会话栏规范.md` 和 history。
- 不包含：
  - 按工作区树分组（用户决定不做）。
  - 服务端的工作区排序 API：手动顺序只存在本机 localStorage。
  - `listPage` 的全局游标和 archived 参数：不改 IPC、不改 shared 类型。
  - 跨重启的「未读」：没有 `lastViewedAt` 字段。
  - Demo 里 Tweaks 面板的「用户 + 齿轮」底栏：底部保持现有「设置」。
  - 「未分组」分组：沿用默认工作区计划的结论，没有路径的旧会话不显示。

## 背景

- 相关文档：
  - `docs/design-docs/frontend/sidebar-redesign-demo.html`：已认可的视觉与交互规格。
  - `docs/design-docs/frontend/front-左侧会话栏规范.md`
  - `docs/design-docs/frontend/front-progressive-session-loading.md`
  - `docs/design-docs/frontend/front-新功能开发清单.md`
- 相关代码路径：
  - `apps/desktop/src/renderer/components/Sidebar.tsx`
  - `apps/desktop/src/renderer/components/sidebar/`
  - `apps/desktop/src/renderer/App.tsx`（`sessionStatuses`、`agentStream` 回调、`handleSelectSession`、`handleArchivedSessionsChange`）
  - `apps/desktop/src/renderer/session/session-local-store.ts`
  - `apps/desktop/src/renderer/session/session-actions-context.ts`
- 已知约束：
  - 分支 `fix/session-default` 上有默认工作区计划（`completed/20261015-default-workspace-first-run.md`）未提交的改动，涉及 `Sidebar.tsx`、`WorkspaceSection.tsx`、`session-grouping.ts` 和侧栏测试。本计划在它的基础上改，不回退它的行为：去掉了默认工作区，`isOrphanSession` 隐藏无路径的旧会话。
  - 会话列表按「工作区 + 是否置顶」分组分页，首屏每组 10 条，`loadMore` 按组翻页。单列表和按时间只能显示已加载的会话。
  - `listPage` 不返回已归档会话。已归档只能用 `sessions.list({ archived: true })` 一次全量拉取。
  - 前端清单的要求：
    - 只用 token。
    - 原生 `<button>` 数只能减少。
    - 浮层只用 `components/ui` 原语。
    - 文件不超过 500 行。
    - 纯函数放 `.ts` 并配单测，有状态的逻辑放 `use-*.ts`。
    - store 用 useSyncExternalStore。

## 风险

- 风险：单列表和按时间只显示已加载页，某个分组没加载完时，排序看起来连续，实际会漏掉更新的会话。
  - 缓解方式：底部「加载更多会话」一次给所有 `hasMore` 分组翻页；在规范里写明这个限制。
- 风险：`.session-row`、`data-group-key`、`Show more` 等测试钩子改动面大。
  - 缓解方式：保留 `.session-row`、`data-session-id`、`data-group-key`、`.session-row-time` 和 `.session-status-button [data-state]`。按钮文案的变化在测试里同步改。
- 风险：同一分支上还有别的会话没提交的改动。
  - 缓解方式：只用 Edit 增量修改，不整文件覆盖别人改过的文件，不跑 `--update-native-button-baseline`。
- 风险：拖拽和 Radix ContextMenu、Tooltip 互相干扰。
  - 缓解方式：只在行根节点上设 `draggable`；拖拽中收起提示；在浏览器 mock 里手测。

## 里程碑

1. 纯函数与 store：视图偏好、手动顺序、时间分桶、中文相对时间。
2. 状态与操作：未读标志、恢复归档、已归档列表 hook。
3. 组件：分区标题（搜索、视图菜单）、工作区行、会话行、列表展开、三种视图、拖拽。
4. mock、测试、检查、截图、文档。

## 任务

| # | 任务 | 验证 |
|---|---|---|
| T1 | `sidebar/sidebar-view.ts` 纯函数，配 `sidebar-view.test.ts`。内容：视图偏好类型、默认值和容错解析；`orderByManual`（新会话在前、已保存顺序、已归档在后）；`snapshotOrder`；`moveBefore`；`bucketByTime`（需要处理、今天、昨天、近 7 天按星期、本月更早、按月、按年月）；`formatRelativeTimeZh` | 单测通过 |
| T2 | `sidebar/sidebar-view-store.ts`，配 `useSidebarView`：localStorage 键 `actspace.sidebar.view.v1`，存视图选项、分区折叠、工作区折叠、时间桶折叠和手动顺序。规则：切到手动排序时快照当前顺序；切到最近更新时清空顺序；拖拽时自动切到手动 | store 单测通过 |
| T3 | 「完成未读」：`SessionLocalState.unread`；`agent_run_finished` 时如果不是当前会话就置位，选中会话时清除；`SessionUiStatusKind` 加 `unread`；`sessionStatuses` 加上这一档 | `session-status`、App 相关测试通过 |
| T4 | 恢复归档：`SessionActionsValue.onRestoreSession`，由 App 实现，调用 `archive(false)` 后刷新；新增 `sidebar/use-archived-sessions.ts`，筛选不是「隐藏已归档」时才拉取 | 单测通过 |
| T5 | 分区标题 `sidebar/SidebarSectionHeader.tsx`：标题加悬停时出现的 ∨，可折叠；右侧有搜索、视图选项（非默认时着强调色）、添加工作区。搜索在标题行内展开（180ms），结果替换列表，Esc 或 ✕ 关闭。新增 `sidebar/use-session-search.ts` 和 `sidebar/SessionSearchResults.tsx`，替换旧的 `SessionSearch.tsx` | sidebar 测试通过 |
| T6 | 视图菜单 `sidebar/SidebarViewMenu.tsx`：用 ui/Menu 的单选组。分组、排序、筛选三组，再加「恢复默认」。按时间分组时，手动排序置灰并提示原因 | 测试覆盖切换 |
| T7 | 工作区行：文件夹和箭头叠在同一格里淡入淡出，箭头旋转；当前会话所在分组的文件夹用强调色；悬停时出现 ⋯ 菜单（和右键菜单相同）和 +；折叠状态持久化；可以拖拽 | sidebar 测试通过 |
| T8 | 会话行：行高 30px。状态槽：运行中转圈、待审批琥珀点并用「待审批」替换时间、失败红点、未读绿点加粗。中文相对时间。单列表和按时间时，标题后显示工作区名。已归档的行显示「已归档」标签，并提供恢复操作。悬停时显示 ⋯、归档、置顶，改用 IconButton。双击标题可以重命名 | sidebar、semantics 测试通过 |
| T9 | 列表：每组 5 条，「展开其余 N 个会话」每次加 5 条（剩余不超过 6 条时一次全部展开），最后可「收起」。运行中和待审批的会话不计入 5 条。已加载的都显示完、但服务端还有更多时，显示「加载更多」 | 测试覆盖 |
| T10 | 三种视图与拖拽：`sidebar/SidebarSessionViews.tsx`（按工作区、单列表、按时间）；`sidebar/use-sidebar-drag.ts` 用原生 HTML5 拖拽，只能在同一账本内移动（某个工作区、置顶、单列表、工作区顺序），插入位置用圆点加 2px 强调色线标示，拖拽后提示「已切换为手动排序」 | 测试与浏览器手测 |
| T11 | mock 场景：会话分布在今天、昨天、本周、上月、去年，并带有运行中、待审批、失败、未读、已归档的会话。另外同步 `FRONTEND_VERIFICATION.md` | `?mock=` 截图 |
| T12 | 全量检查：`typecheck`、desktop `test`、`check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`、`check:current-docs`；在浏览器 mock 下截图浅色、深色和 480px 窗口 | 命令通过，截图留在 `tmp/` |
| T13 | 文档：更新 `front-左侧会话栏规范.md`，写 history、执行摘要和 memory | `check:current-docs` 通过 |

## 验证方式

- 命令：
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm --filter @actspace/desktop test`
  - `pnpm check:frontend-tokens`
  - `pnpm check:frontend-theme`
  - `pnpm check:renderer-bridge`
  - `pnpm check:current-docs`
- 手工检查：在浏览器 mock 下，浅色、深色和 480px 窗口各截图，与 Demo 对照。逐项检查：
  - 三种分组和两种排序。
  - 三种归档筛选。
  - 拖拽：会话、置顶、工作区、单列表。
  - 搜索。
  - 展开和收起。
  - 状态槽。
- 观测检查：Electron 实机由用户验收：真实运行中、审批、失败、完成未读；拖拽顺序重启后保留。

## 进度记录

- [x] 2026-10-15 Demo 认可，范围确认。
- [x] 2026-10-15 T1–T2 纯函数与 store（21 个单测）。
- [x] 2026-10-15 T3–T4 未读状态、取消归档、已归档拉取。
- [x] 2026-10-15 T5–T10 组件、三种视图、拖拽。
- [x] 2026-10-15 T11–T13 `?mock=sidebar`、全量测试（1917 通过）、浏览器截图、文档。
- [x] 2026-10-15 原生按钮基线：用户手动审批，`SidebarSectionHeader.tsx` 记 1（分区和时间段标题共用），`Sidebar.tsx` 5→4、`SessionRow.tsx` 3→1；`check:frontend-tokens` 通过。
- [ ] Electron 手测（拖拽、未读、取消归档）。

## 决策记录

- 2026-10-15：视图偏好和手动顺序存在 localStorage（`actspace.sidebar.view.v1`），不进 settings v4。原因是它们只是本机的 UI 偏好，进 settings v4 要改 golden fixtures 和迁移，不值得。
- 2026-10-15：工作区的手动顺序也只存本机，不新增 IPC。原因是 registry 的 `order` 现在没有被侧栏使用，加 reorder 通道要同时改 contract、guards 和 check:ipc-channels。
- 2026-10-15：「完成未读」只在本窗口内存里记录，重启后清空。原因是会话没有 `lastViewedAt`，要持久化得改后端两条列表路径。
- 2026-10-15：已归档会话用 `sessions.list({ archived: true })` 全量拉取，只在筛选不是「隐藏已归档」时拉。归档出现在原来的分组里，不进置顶区。
- 2026-10-15：单列表和按时间只显示已加载的会话，底部的「加载更多」给所有还有下一页的分组一起翻页。
- 2026-10-15：置顶区在三种视图下都放在最上面，可以在置顶区内部拖拽。远端 Host 分组按工作区分组对待。
- 2026-10-15：Demo 里的「未分组」不实现，因为默认工作区计划已经隐藏无路径的旧会话。
- 2026-10-15（实施中调整）：T10 拆成 `SidebarSessions.tsx`（编排、搜索、置顶、按工作区、单列表）、`SidebarTimeView.tsx`（按时间）和 `use-remote-paging.ts`（三处共用的服务端翻页），没有 `SidebarSessionViews.tsx`；搜索结果直接复用 `SessionList`，没有单独的 `SessionSearchResults.tsx`。旧的 `SessionSearch.tsx` 保留给快捷键设置页，和侧栏共用 `use-session-search.ts`。
- 2026-10-15（实施中调整）：单列表和置顶区不限 5 条（与 Demo 一致），只有按工作区分组的每组限 5 条。
- 2026-10-15（实施中调整）：仓库没有 toast 基础组件，「已切换为手动排序」是标题下约 3 秒的 `role="status"` 文字，不新建浮层。

## 执行模式

- **交互模式**：用户在线，改动涉及大量组件和测试钩子，并且同一分支上还有别人未提交的改动。

## 执行文档

- `docs/exec-runs/20261015-sidebar-redesign/execution-process.md`
- `docs/exec-runs/20261015-sidebar-redesign/execution-summary.md`
