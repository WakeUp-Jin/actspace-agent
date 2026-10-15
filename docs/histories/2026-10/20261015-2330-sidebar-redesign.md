## [2026-10-15 23:30] | Task: 左侧会话栏改版

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI（macOS）`

### 📥 User Query

> 我们一起来优化一下左侧边栏的会话的功能吧，这个搜索本机会话不需要……我想要结合一下这两个的优点，dsh我觉得干净，但是不够个性，cursor我觉得个性，但是交互有点点的复杂。
>
> 非常漂亮，开始实现。先做个计划，然后开始实现。

### 🛠 Changes Overview

**Scope:** `apps/desktop`（renderer、mock、测试）、`docs`

**Key Actions:**

- **搜索**：去掉「搜索本机会话」行，改为标题行图标，点开在标题行展开搜索框，Esc 关闭。
- **分区标题**：已置顶、工作区 / 会话、时间段共用一种标题；点文字折叠，悬停露箭头；折叠状态持久化。
- **视图选项**：按工作区 / 单列表 / 按时间；手动排序 / 最近更新；隐藏已归档 / 全部对话 / 仅显示已归档；恢复默认只重置选项。
- **拖拽**：会话和工作区都能拖；在「最近更新」下拖一次切到手动排序，并提示「已切换为手动排序」。
- **按时间分组**：需要处理（待审批、失败、跑完未看）置顶，其后今天、昨天、近 7 天按天、本月更早、往月、往年。
- **会话行**：每组先显示 5 条；状态点增加「跑完未看」；中文相对时间；悬停操作与时间共用尾部位置；已归档会话可取消归档。
- **Mock**：新增 `?mock=sidebar`。

### 🧠 Design Intent (Why)

DSH 的侧栏干净但缺少个性，Cursor 的个性来自微交互但操作层级多。这次保留 DSH 的信息结构和拖拽能力，把 Cursor 的折叠箭头、图标交叉淡入等微交互加进来，再借 Codex 的按时间分组，并在顶部集中「需要处理」的会话，让用户先看到要动手的会话。按工作区树形分组由用户决定不做。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/Sidebar.tsx`
- `apps/desktop/src/renderer/components/sidebar/{SidebarSessions,SidebarTimeView,SidebarSectionHeader,SidebarViewMenu,DropIndicator}.tsx`（新增）
- `apps/desktop/src/renderer/components/sidebar/{sidebar-view,sidebar-view-store,use-sidebar-drag,use-session-search,use-archived-sessions,use-remote-paging}.ts`（新增）
- `apps/desktop/src/renderer/components/sidebar/{SessionList,SessionRow,SessionContextMenu,SessionSearch,WorkspaceSection}.tsx`
- `apps/desktop/src/renderer/components/sidebar/{session-grouping,session-status}.ts`
- `apps/desktop/src/renderer/mock/handlers.ts`、`mock/scenarios/{sidebar,index}.ts`
- `apps/desktop/src/renderer/test/{sidebar-view,sidebar-views}.test.ts(x)`（新增）、`sidebar.test.tsx`、`setup.ts`、`session-status.test.ts`、`session-ipc-budget.test.tsx`、`mock-bridge.test.ts`、`app-streaming-user-message.test.tsx`
- `docs/design-docs/frontend/sidebar-redesign-demo.html`（新增）、`front-左侧会话栏规范.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/exec-plans/active/20261015-sidebar-redesign.md`、`docs/exec-plans/README.md`
- `docs/exec-runs/20261015-sidebar-redesign/`
