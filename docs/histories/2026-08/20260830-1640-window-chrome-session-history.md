## [2026-08-30 16:40] | Task: 收口桌面端窗口 chrome 与会话导航

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 顶部 chrome 对齐参考界面：左侧保留窗口与侧栏控制，中间显示会话信息，右侧保留面板操作；移除重复搜索入口。UI 由用户手动验收，Agent 只做源码与自动化验证。

### 🛠 Changes Overview

**Scope:** `apps/desktop` renderer 与前端设计文档

**Key Actions:**

- **窗口 chrome 收口**：左列使用空间分布承载 Sidebar 折叠与 Back / Forward，会话标题保留在中间列，右列保留对象面板控制。
- **搜索入口去重**：移除 Sidebar 对已不再渲染的顶部搜索回调，搜索继续由 Sidebar 内入口承担。
- **会话历史健壮性**：Back / Forward 切换改为异步调用后再捕获同步抛错，失败时恢复历史索引和 pending 状态。
- **契约同步**：更新左侧会话栏与工作台布局规范，明确顶部 chrome、搜索和会话历史行为。

### 2026-08-30 17:16 追加收口

- **顶部外部应用入口移除**：删除 `WorkspaceChromeControls` 中的 workspace 应用图标与下拉选择器，不再在顶部展示 Open in Cursor / Open in IDE 类按钮；底层 IPC 和侧栏 Workspace 菜单能力保持不变。
- **边线分区**：移除 chrome 根容器的全宽底边线，仅在 `.chrome-right` 保留右侧对象面板列的底边线。
- **规范与测试同步**：更新右侧文件打开规范、工作台 chrome 规范与相关 renderer 测试，锁定顶部入口不存在且环境面板仍可用。

### 🧠 Design Intent (Why)

窗口级操作应按真实 pane 归属布局：左列负责导航，中心列负责当前会话上下文，右列负责对象面板。会话 Back / Forward 是 Workbench 的临时访问历史，不应写入 Session Journal；切换失败时必须恢复状态，避免按钮永久 disabled 或索引漂移。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/Sidebar.tsx`
- `apps/desktop/src/renderer/components/WindowChromeBar.tsx`
- `apps/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `apps/desktop/src/renderer/components/workspace/WorkspaceChromeControls.tsx`
- `apps/desktop/src/renderer/components/workspace/workspaceOpenTool.tsx`
- `apps/desktop/src/renderer/styles/electron.css`
- `apps/desktop/src/renderer/test/workbench-responsive.test.tsx`
- `apps/desktop/src/renderer/test/workspace-chrome-controls.test.tsx`
- `docs/design-docs/frontend/front-左侧会话栏规范.md`
- `docs/design-docs/frontend/front-工作台布局与面板交互规范.md`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
