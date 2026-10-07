# 多智能体协作（Space）前端演示 — 执行摘要

## 执行状态

> T0–T11 完成，自动化验收通过，浏览器 mock 截图已核对。Electron 窗口验收、打包版不出现入口、键盘走查留给人工。所有改动未提交。

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261007-multi-agent-collab-frontend-demo.md`
- **执行过程**：`docs/exec-runs/20261007-multi-agent-collab-frontend-demo/execution-process.md`
- **执行模式**：交互模式（T1–T3、T5–T10 由子智能体按目录分工并行；T4 装配、T7a、共享组件由主会话完成）
- **工作树 / 分支**：`actspace-agent-multi-agent` / `feat/multi-agent-collab-fe`

## 核心变更清单

- **Space 演示**（`R/components/space/`，只在开发构建出现）：
  - 内存 store、模拟脚本和选择器（`model/`）。
  - 头像（`avatar/`）。
  - 标签栏（`tabs/`），放在窗口标题栏中间。
  - 协调 Agent 和 Actor 对话（`thread/`）。
  - 审批托盘、状态胶囊和现有 Composer 的接入（`dock/`）。
  - 右栏（`SpaceRightPanel`、`panel/`，复用现有右栏的标签栏和启动页）。
  - 名册与一对一对话（`roster/`）。
  - 新建 Space、演示说明（`dialogs/`）。
  - 常驻的「开发中演示」提示条。
- **左栏**：新增「新建 Space」「Actor 名册」两个主操作、带「演示」标记的 Space 分区；一对一对话放进工作区会话列表。
- **WorkbenchLayout**：
  - `SidebarView` 新增 `"space"`：中栏渲染 `SpaceWorkbench`，标题栏中间换成 Space 标签栏，右栏换成 Space 的右栏。
  - 右栏开关接 Space store；名册页没有右栏。
  - 窄窗口里，右栏改成浮层，进入 Space 时先收起。
- **普通会话右栏（T7a）**：
  - 启动页改成白底列表（`RightPanelLauncherList`）。
  - 标签栏拆成 `RightPanelTabStrip`，工作区操作栏拆成 `WorkspaceOperationBar`；`RightPanel.tsx` 从 600 多行降到 445 行。
- **Composer**：新增可选 prop `placeholder` 和 `statusRow`，不传时行为不变。
- **主题**：`space.css`（星空、光环、留下 Actor 的星尘、行 FLIP 等），`tokens.css` 新增 `--act-space-*` 颜色和时长 token。
- **不进生产包**：所有 Space 分支都挂在编译期常量 `SPACE_DEMO_ENABLED` 上，右栏开关通过 `use-space-panel-binding.ts` 在模块层面二选一，顶层的 store 单例和 `memo()` 加了 `/* @__PURE__ */`。生产主 chunk 从 1913KB 降到 1833KB，产物 JS 里没有演示代码。

## Agent 已完成的验证

- `pnpm --filter @actspace/desktop typecheck` 通过。
- `pnpm --filter @actspace/desktop test`：203 个文件、1668 个用例通过，2 个跳过。其中 Space 相关测试：`space-entry`、`space-workbench`、`space-dock`、`space-roster`、`space-panel`、`space-flip-rows`，以及 store / 选择器测试。
- `check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge` 通过。
- `check:current-docs` 只有一处失败，是 main 原有的断链（`20261005-desktop-frontend-refactor/00-总执行计划.md`），与本任务无关。
- `build:renderer` 生产构建通过；产物 JS 里搜不到演示文字（`支付链路提速`、`开发中演示`）和 Space 头像引用。
- 浏览器 mock（`?mock=streaming`）截图核对了以下状态：
  - 协调 Agent（浅色）
  - Actor 标签（深色）
  - 名册
  - 一对一对话
  - 留下 Actor + 审批托盘
  - 760px 窄窗
  - 普通会话启动页的浅色、深色、480px

## 人工验证指引

1. `pnpm dev:log` 启动 Electron，按 `docs/FRONTEND_VERIFICATION.md`「Space 多 Actor 协作演示」走 7 步，浅色、深色各一遍。
2. 标题栏中间的 Space 标签栏能点、能横向滚动，空白处仍能拖动窗口。
3. 打包版（`pnpm build` 后运行）左栏没有「新建 Space」「Actor 名册」和 Space 分区。
4. 键盘：Tab 能走到标签、右栏行、托盘按钮；Esc 只关最上层并把焦点还给触发器。
5. 普通会话右栏：启动页是新列表样式，标签栏溢出菜单、终端关闭、工作区操作栏（面包屑、源码切换、文件树开关、过期提示）和改动前一致。

## 遗留

- 现有「扩展」主操作按钮的选中背景被 `bg-transparent` 盖掉了（main 原有问题），本次没有改。
- 一对一对话行放在工作区列表最前面，没有插进具体工作区分组里。插进去要改 `WorkspaceSection`；要不要改，等接后端时按真实会话归属再定。
- Vite 仍会把 11 张 Space 头像 PNG（约 200KB）输出到 `dist/assets/`。JS 不引用它们，不会被加载。要彻底不输出，需要改成动态 import，等演示转正或删除时再处理。

## 学习文档

- [20261007-pure-annotation-tree-shaking](../../learnings/2026-10/20261007-pure-annotation-tree-shaking.md)：常量守卫之外，顶层调用也会把模块留在包里。
- [20261007-tailwind-same-property-order](../../learnings/2026-10/20261007-tailwind-same-property-order.md)：Tailwind 同属性两个类，谁生效看样式表顺序。
