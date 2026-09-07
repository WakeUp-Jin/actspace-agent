# 2026-09-01 | Task: 将 Trajectory 收敛为会话内主视图切换

### 📥 User Query

> 取消侧边栏 / 右侧的轨迹入口，在会话中心区域通过一个干净的按钮切换 Chat 与 Trajectory；参考 Codex 标题栏的紧凑交互，但不要做顶栏 tabs，也不要把主入口藏进三点菜单。

### 🛠 Changes Overview

**Scope:** `apps/desktop` renderer 与前端布局文档。

**Key Actions:**

- **标题行切换**：在会话标题左侧加入 icon-only Chat / Trajectory 按钮，动态提供 tooltip、title、aria-label 与 aria-pressed。
- **稳定中心 Shell**：ConversationView 保持挂载，仅替换消息 viewport 的内容；复用现有 RuntimeV2 Session Projection 渲染中心轨迹列表。
- **右侧入口收口**：移除右侧 Trajectory launcher、对象菜单项、Tab union 与 body 分支，保留 Files / Review / Context / Terminal / Reply。
- **会话级恢复**：在 WorkbenchLayout 中按 session id 记忆当前主视图，切换会话后恢复各自的 Chat / Trajectory 状态。

### 🧠 Design Intent (Why)

Trajectory 是会话运行事实的观察投影，不是与文件、Review、Context 并列的对象。把它放回中心工作区可以保持信息归属清晰；用单按钮取代持久化 tabs 可减少标题栏噪声，同时不破坏会话 Composer 与右侧对象工作流。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/SessionViewToggle.tsx`
- `apps/desktop/src/renderer/components/TrajectoryView.tsx`
- `apps/desktop/src/renderer/components/WindowChromeBar.tsx`
- `apps/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `apps/desktop/src/renderer/components/ConversationView.tsx`
- `apps/desktop/src/renderer/components/RightPanel.tsx`
- `apps/desktop/src/renderer/components/right-panel/RightPanelContext.tsx`
- `apps/desktop/src/renderer/components/right-panel/RightPanelObjectMenu.tsx`
- `apps/desktop/src/renderer/styles/electron.css`
- `apps/desktop/src/renderer/test/sidebar.test.tsx`
- `apps/desktop/src/renderer/test/workbench-responsive.test.tsx`
- `apps/desktop/src/renderer/test/trajectory-render-view.test.tsx`
- `docs/design-docs/frontend/front-工作台布局与面板交互规范.md`

### Phase B 追加（2026-09-03）

- 参考 DeepSeek Harness 的 Trajectory 三层结构，在中心视图加入轻量工具条、事件概览时间带、按 Turn 分组的高密度事件账本。
- 增加事件搜索、Turn 收起/展开、事件选中态和只读 JSON payload 详情；不新增 IPC，不把轨迹重新放回右侧对象面板。
- 新增交互测试后，Phase B 目标测试共 55 项通过；renderer build、主题契约、diff 检查通过。
- 通过真实 Electron 窗口复验标题旁按钮、Trajectory 工具条/空态、返回 Chat 以及 Files / Review / Context / Terminal / Reply 右侧对象边界。
