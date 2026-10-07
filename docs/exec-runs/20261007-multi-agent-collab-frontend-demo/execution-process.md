# 多智能体协作（Space）前端演示 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261007-multi-agent-collab-frontend-demo.md`
- **执行模式**：交互
- **开始时间**：2026-10-07 13:00
- **结束时间**：2026-10-07 16:10（Electron 验收待做）

## 执行时间线

### 步骤 1：T0 确认接入决策，demo 改版

- **操作**：用户逐项确认 Q1–Q8，并评审了改版后的 demo（左栏新顺序、现有 Composer、现有右栏加 Space 标签、启动页列表样式）。结论写成设计文档 D18–D31，§4 按结论改写，§10 清空。计划里 T4、T6、T7 改写，新增 T7a。
- **影响文件**：`docs/design-docs/多智能体协作/{front-space-工作台设计.md,space-demo.html,README.md}`、本计划。
- **决定**：右栏只复用展示组件，不复用 `RightPanelContext`。原因是它全局只有一份，并且依赖真实会话和 IPC；Space 的右栏要按上下文分别记状态。
- **验证**：demo 用无头 Chrome 截图核对，覆盖协调 Agent、Actor、文件、Review、终端（深色）、一对一、收起、窄窗、名册、启动页（浅色和深色）。

### 步骤 2：T7a 普通会话右栏启动页改成列表

- **操作**：新增 `right-panel/RightPanelLauncherList.tsx`，样式是白底，每行「图标 + 名字 + 一句说明」，高 36px。`RightPanel.tsx` 的启动页改用这个组件；按钮项、禁用条件、开发构建开关、终端预加载都不变。按钮的可读名称只取名字（`aria-label`），说明放在 `aria-describedby`，所以现有测试里按名字找按钮的写法不用改。
- **影响文件**：`R/components/right-panel/RightPanelLauncherList.tsx`（新）、`R/components/RightPanel.tsx`、`R/test/right-panel-launcher-list.test.tsx`（新）、`scripts/native-button-baseline.json`（原生按钮从 `RightPanel.tsx` 7→6 移到新文件 1，总数不变）。
- **验证**：`pnpm --filter @actspace/desktop typecheck` 通过；desktop `pnpm test` 193 个文件、1548 个用例通过；`check:frontend-tokens`、`check:frontend-theme` 通过。浏览器 mock（`?mock=streaming`）截图核对了浅色、深色、480px 窄窗。

### 步骤 3：T1–T3、T10 数据层与全局样式（子智能体）

- **操作**：
  - 素材：头像缩成 128px，放进 `R/assets/space/`。
  - 数据层：`model/` 写类型、fixtures、选择器，以及带可注入时钟的 store（`createSpaceDemoStore`）。组件通过 `useSyncExternalStore` 读取 store。
  - 主题：`tokens.css` 加 `--act-space-*` token（浅色、深色、跟随系统三处），`space.css` 用 `@import … layer(components)` 引入。
- **验证**：store 和选择器 63 个用例通过；token、主题检查通过。

### 步骤 4：共享组件

- **操作**：
  - 右栏标签栏拆成 `right-panel/RightPanelTabStrip.tsx`，普通会话和 Space 共用。
  - `WindowChromeBar` 加 `center` 插槽，放 Space 标签栏。
  - 头像组件 `space/avatar/ActorAvatar.tsx`，尺寸档位为 16 / 18 / 22 / 40 / 56。
- **验证**：右栏相关的 7 个测试文件 49 个用例通过。

### 步骤 5：T5–T9 界面（三个子智能体并行，各改各的目录）

- **操作**：
  - A：`tabs/`、`thread/`、`dialogs/`、提示条、轻提示。
  - B：`dock/`（托盘、胶囊、Composer 接入）、`roster/`。
  - C：`SpaceRightPanel`、`panel/`、`panel/mock-views/`。
  - 组件都直接读单例 store、不接 props，装配由主会话做。
- **决定**：B 原来用改 DOM 的办法换占位文字，用 CSS 藏掉状态行。主会话改成给 `Composer` 加 `placeholder`、`statusRow` 两个可选 prop。
- **验证**：各自的测试通过（space-workbench 18、space-dock + space-roster 12、space-panel + space-flip-rows 22）。

### 步骤 6：T4 接入左栏和 WorkbenchLayout

- **操作**：
  - `SpaceSidebarSection.tsx` 提供四块：新建 Space、Actor 名册、Space 分区、一对一对话行。
  - `Sidebar` 在开发构建下插入这些入口；进入 Space 后，普通会话不再显示选中态。
  - `WorkbenchLayout` 新增 `"space"` 视图，右栏开关按视图接到普通会话或 Space store。
  - `SpaceWorkbench` 负责装配中栏。
  - `WorkspaceOperationBar` 拆出去后，`RightPanel.tsx` 是 445 行。
- **验证**：`space-entry.test.tsx` 5 个用例通过；desktop 全量 203 个文件、1668 个用例通过；typecheck、tokens、theme、renderer-bridge 检查通过。浏览器截图核对了协调 Agent、Actor 标签（深色）、名册、一对一对话、「留下」之后的状态加托盘、760px 窄窗。

### 步骤 7：T11 收尾，演示代码移出生产包

- **操作**：
  - 生产构建（`build:renderer`）后，在产物里搜演示文字，发现 Space 的代码整个被打进了主 chunk。界面入口确实是隐藏的，但代码和 fixtures 都在包里。
  - 按 [20261006 学习文档](../../learnings/2026-10/20261006-dev-only-code-out-of-bundle.md) 的思路，分三层清理：
    - `WorkbenchLayout` 改用 `space/use-space-panel-binding.ts`：在模块层面用 `SPACE_DEMO_ENABLED` 二选一，生产构建里只剩一个空实现。`isSpace` 也加上了这个常量。
    - 在 store 单例的 `createSpaceDemoStore()` 调用前加 `/* @__PURE__ */`。
    - 在 `ActorGroups.tsx` 顶层的 `memo(...)` 调用前加 `/* @__PURE__ */`。
- **影响文件**：`R/components/space/use-space-panel-binding.ts`（新）、`R/components/WorkbenchLayout.tsx`、`R/components/space/model/space-demo-store.ts`、`R/components/space/panel/ActorGroups.tsx`。
- **验证**：
  - 主 chunk 从 1913KB 降到 1833KB。
  - 产物 JS 里搜不到 `支付链路提速`、`开发中演示`、`data-actor-avatar`、`space-row-lit`，也没有引用 Space 头像图片。
  - typecheck 通过；desktop 全量 203 个文件、1668 个用例通过；tokens、theme、renderer-bridge 检查通过。
- **遗留**：Vite 仍会把被 import 过的 11 张头像 PNG（约 200KB）输出到 `dist/assets/`。JS 不引用它们，所以不会被加载。

## 遇到的问题

- **问题**：左栏选中背景不显示。
  - **原因**：行样式里的 `bg-transparent` 在样式表里排在 `bg-sidebar-selected` / `bg-selected` 之后，后者被盖掉。
  - **应对**：改用 `aria-[current=page]:` 变体。现有「扩展」按钮也有同样的问题，没有改。
- **问题**：Space 对话的滚动区没有撑满中栏。
  - **原因**：外层容器不是 flex，子元素的 `flex-1` 不生效。
  - **应对**：外层改成 `flex flex-col`。
- **问题**：窄窗口进入 Space，右栏浮层直接盖住中栏。
  - **原因**：Space store 默认右栏是打开的。
  - **应对**：在紧凑布局下进入 Space 时，先收起右栏。
- **问题**：`space-entry` 测试打开右栏后，找不到左栏里的按钮。
  - **原因**：jsdom 默认宽 1024px，放不下三栏，左栏被自动收起。
  - **应对**：测试里把视口设为 1600px。

- **问题**：新工作树里 typecheck 报找不到 `@actspace/shared`。
  - **原因**：workspace 包还没构建。
  - **应对**：先跑 `pnpm run typecheck:contracts`。
- **问题**：启动页按钮加了说明文字后，`getByRole("button", { name: "上下文" })` 找不到按钮。
  - **原因**：说明文字被算进了按钮的可读名称。
  - **应对**：可读名称用 `aria-label` 只取名字，说明改用 `aria-describedby` 关联。
- **问题**：5173 端口被主仓库的 dev server 占用。
  - **应对**：改用 `VITE_DEV_PORT=5183`。

- **问题**：常量守卫已经加好，Space 演示代码仍然在生产包里。
  - **原因**：`WorkbenchLayout` 无条件调用了 store 的 hook；另外，store 单例和 `memo()` 都是顶层调用，打包器默认它们有副作用，不敢删。
  - **应对**：在模块层面二选一，选出 hook 的实现；对没有副作用的顶层调用加 `/* @__PURE__ */`。写成了学习文档 [20261007-pure-annotation-tree-shaking](../../learnings/2026-10/20261007-pure-annotation-tree-shaking.md)。

## 跳过或推迟的事项

- `check:current-docs` 有一处失败：`20261005-desktop-frontend-refactor/00-总执行计划.md` 里的断链。这是 main 原有的问题，和本任务无关，没有动。
