# ActSpace 会话内轨迹视图切换 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260901-actspace-trajectory-session-view/README.md`
- **执行模式**：交互
- **开始时间**：2026-09-01
- **结束时间**：2026-09-03

## 执行时间线

### 步骤 1：范围审计与实现边界

- **操作**：读取仓库协作、架构、前端主题、历史、质量与 execution plan 规范；检查脏工作区并定位现有轨迹投影、ConversationView、WindowChromeBar 与右侧面板入口。
- **影响文件**：无代码变更。
- **决定**：保留 Session Projection 与 `TrajectoryRenderView` 的数据/列表能力，将入口和容器迁移到中心会话视图；右侧 Files/Review/Context/Terminal/Reply 保持不变。
- **验证**：确认现有轨迹仅由 renderer right-panel launcher/menu/body 消费，未发现需要新增 IPC 的缺口。

### 步骤 2：实现中心视图与标题行入口

- **操作**：新增 `SessionViewToggle` 与中心 `TrajectoryView`；在 `WindowChromeBar` 标题前注入 icon-only 切换按钮；`WorkbenchLayout` 按 Session id 记忆主视图；`ConversationView` 保持 Chat viewport 与 Composer 挂载，仅隐藏 Chat 内容并显示 Trajectory。
- **影响文件**：`apps/desktop/src/renderer/components/SessionViewToggle.tsx`、`TrajectoryView.tsx`、`WindowChromeBar.tsx`、`WorkbenchLayout.tsx`、`ConversationView.tsx`、`styles/electron.css`。
- **决定**：使用 Activity / MessageSquare 图标表达「查看轨迹 / 返回 Chat」，不使用持久化 tabs 或文件夹图标；轨迹列表继续读取 `RuntimeV2TrajectorySnapshot`，不新增 IPC。
- **验证**：针对性 Vitest 通过；renderer `tsc --noEmit -p tsconfig.json` 与根 `pnpm typecheck` 通过；Vite renderer build 通过。

### 步骤 3：移除右侧入口并同步文档

- **操作**：移除右侧 launcher、`RightPanelObjectMenu`、`RightPanelTab` union 和 body 分支中的 Trajectory；更新工作台交互规范、history、learning、execution plan 与执行摘要。
- **影响文件**：`apps/desktop/src/renderer/components/RightPanel.tsx`、`components/right-panel/RightPanelContext.tsx`、`components/right-panel/RightPanelObjectMenu.tsx`、测试与 `docs/` 下对应记录。
- **决定**：保留 Projection selector 与轨迹组件，右侧 Files / Review / Context / Terminal / Reply 继续作为对象面板。
- **验证**：`rg` 确认 renderer 不再有右侧 Trajectory launcher/menu/tab；`git diff --check`、`pnpm run check:frontend-theme`、`pnpm run check:current-docs` 通过。

### 步骤 4：浏览器 renderer 验收

- **操作**：启动本地 Vite renderer，检查默认 Chat、点击按钮切换 Trajectory、返回 Chat，并在 480px 窄屏检查标题隐藏与按钮可达。
- **影响文件**：无额外代码变更。
- **决定**：浏览器验证只证明 renderer 结构与交互，不替代 Electron preload/IPC 验收。
- **验证**：桌面宽度下按钮紧贴标题左侧；Trajectory 空态显示在中心；480px 下按钮仍可达，右侧面板入口保持独立。

### 步骤 5：Phase B 中心轨迹密度与交互增强

- **操作**：参考 DeepSeek Harness 的 Trajectory 结构，将中心视图升级为轻量工具条、事件概览时间带、按 Turn 分组的事件账本、搜索过滤、Turn 收起/展开、事件选中态和只读 payload 详情；所有内容继续消费 `RuntimeV2TrajectorySnapshot`，未新增后端协议。
- **影响文件**：`apps/desktop/src/renderer/components/TrajectoryView.tsx`、`apps/desktop/src/renderer/test/trajectory-render-view.test.tsx`。
- **决定**：采用参考页面的三层信息层级，但保留 ActSpace 的语义主题 token 和现有中心 Shell；不复制完整虚拟化 ledger、真实时间轴缩放或跨 pane 详情布局，避免把 Phase B 变成新的运行时协议。
- **验证**：Phase B 目标测试 55 项通过；`pnpm --filter @actspace/desktop build:renderer`、根 `pnpm build`、`pnpm run check:frontend-theme`、`git diff --check` 通过；浏览器 renderer 与真实 Electron 窗口均完成 Chat / Trajectory、收起、搜索入口、详情入口和右侧面板边界检查。

## 遇到的问题

1. 仓库全量桌面测试仍有既有 Context/Settings 失败（Context snapshot 的 `costUsd` null 格式化、ContextPopup 文案断言、Settings heading/tool label 断言），与本次轨迹改动无直接关系；本轮未扩大范围修复。
2. 本轮单独执行 renderer TypeScript 检查时仍被工作区已有的 `ProviderSettings` 未完成改动阻断（`isDefault`、`Route`、`ProviderMeta.icon` 等类型/符号错误）；Vite renderer build 和 Phase B 目标测试均通过，轨迹文件未报告新增类型错误。

## 跳过或推迟的事项

- 完整虚拟化 ledger、真实持续时间切换、拖拽缩放时间带和复杂请求详情 pane：保留为后续 Phase C，当前 Phase B 先完成可读密度与局部交互闭环。
- 打包制品、签名/公证和真实 Provider/Browser 外部能力：不属于本轮 UI 范围。
