# Lab V0 前端 Mock 实现计划

## 目标

把 Lab 从 `packages/desktop` 里的占位页推进成可用的前端页面：在真实 React renderer 中展示实验矩阵，使用本地 mock 数据完成创建实验、查看阶段卡片详情、推进阶段、暂停 / 取消实验、查看已完成实验等基础交互。今天只完成前端显示和交互流程，不设计或实现后端 Agent、Lab Runtime、IPC 或持久化。

## 范围

- 包含：
  - 将 `WorkbenchLayout` 中的 Lab placeholder 替换为真实 `LabPage`。
  - 新增 Lab 前端组件、mock 数据和局部状态管理。
  - 复刻 `docs/design-docs/public/lab/prototype.html` 的四栏矩阵、顶部按钮、卡片详情弹窗、新实验弹窗、已完成实验弹窗和 `⋯` 菜单。
  - 用 mock 数据支持前端交互闭环：创建草稿实验、编辑 / 推进阶段的可见状态变化、暂停 / 取消进入完成类集合、已完成实验弹窗查看。
  - 为关键交互补 renderer 测试。
  - 按前端验证规范完成 typecheck、测试和浏览器 mock 验收记录。
- 不包含：
  - 不实现 `packages/agent-core` 的 Lab Runtime。
  - 不新增 Electron IPC、preload bridge 或 main process 本地存储。
  - 不写入真实文件、数据库或用户目录。
  - 不让 Main Agent 或 Kairos 自动创建 / 推进 Lab 实验。
  - 不实现真实证据采集、工具执行、沙箱验证或能力晋升。
  - 不接真实 `LabExperiment` shared 契约；本计划内可先在 renderer 内定义前端 mock view model。

## 背景

- 相关文档：
  - `AGENTS.md`
  - `docs/REPO_COLLAB_GUIDE.md`
  - `docs/ARCHITECTURE.md`
  - `docs/design-docs/core-beliefs.md`
  - `docs/FRONTEND_VERIFICATION.md`
  - `docs/design-docs/lab-index.md`
  - `docs/design-docs/lab-frontend-page-design.md`
  - `docs/design-docs/public/lab/prototype.html`
  - `docs/design-docs/lab-versions-index.md`
- 相关代码路径：
  - `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
  - `packages/desktop/src/renderer/components/Sidebar.tsx`
  - `packages/desktop/src/renderer/components/PlaceholderView.tsx`
  - `packages/desktop/src/renderer/components/LabPage.tsx`（新建）
  - `packages/desktop/src/renderer/fixtures/labFixture.ts`（新建）
  - `packages/desktop/src/renderer/styles/index.css`（只在需要确认全局入口时查看，不新增 Lab 全局样式）
  - `packages/desktop/src/renderer/test/lab-page.test.tsx`（新建）
- 已知约束：
  - Lab 页面应保持桌面工作台气质，不做营销式说明页。
  - 页面主体是四栏实验矩阵；顶部只保留 `已完成实验` 和 `新实验`。
  - 卡片只展示三行：标签、标题、元信息；完整内容进入弹窗。
  - 新实验弹窗 V0 只收集 `标题` 和 `问题 / 想法`。
  - 完成、拒绝、废弃、归档实验不留在主矩阵，进入 `已完成实验` 弹窗。
  - 所有数据在本计划内都是浏览器 / renderer 内存 mock，刷新后可重置。

## 风险

- 风险：把 mock 前端做得像真实持久化，用户误以为数据已经落盘。
  - 缓解方式：代码、测试和最终说明都明确这是 renderer mock；不新增 IPC 或持久化入口。
- 风险：一次性把 Lab 数据模型、后端 Runtime 和 UI 混在一起，导致范围失控。
  - 缓解方式：本计划只允许修改 renderer 页面、fixture、样式、测试和必要文档；`agent-core`、`shared`、main process 不在范围内。
- 风险：从 HTML 原型照搬导致 React 状态和组件边界混乱。
  - 缓解方式：先定义前端 view model，再拆 `LabPage` 内部小组件；避免过早抽成跨页面通用组件。
- 风险：页面只静态展示，缺少基本执行流程。
  - 缓解方式：验收必须覆盖创建、详情、推进、暂停 / 取消、已完成弹窗。
- 风险：样式影响 Chat / Usage / Kairos 等既有页面。
  - 缓解方式：Lab 样式写在 `LabPage.tsx` 的 Tailwind utility / 局部 class 常量中，不新增全局 `.lab-*` 组件样式，避免改动全局按钮或布局语义。

## 里程碑

1. 调研与前端边界确认。
2. 建立 LabPage 与 mock view model。
3. 落地四栏矩阵和基础样式。
4. 落地新实验弹窗、卡片详情弹窗、更多菜单和已完成实验弹窗。
5. 落地前端交互流程和 renderer 测试。
6. 浏览器 mock / Electron 视觉验收、文档和 history 收尾。

## 实施任务

### 1. 接入 LabPage 外壳

- 修改 `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`：
  - 删除 `view === "lab"` 分支中的 `PlaceholderView`。
  - 引入并渲染 `LabPage`。
  - 保持 `chromeTitle` 仍为 `Lab`。
- 新建 `packages/desktop/src/renderer/components/LabPage.tsx`：
  - 暴露 `LabPage()`。
  - 页面根节点使用 Tailwind utility class 和 `aria-label="Lab 实验台"`。
- 验证：
  - 点击 sidebar 的 `Lab` 后能看到真实 Lab 页面根节点。
  - `Usage`、`Kairos`、`chat` 分支不受影响。

### 2. 定义 renderer mock view model

- 新建 `packages/desktop/src/renderer/fixtures/labFixture.ts`：
  - 定义前端 mock 类型：
    - `LabStageId = "hypothesis" | "verification" | "forge" | "promotion"`
    - `LabCardView`
    - `LabCompletedExperimentView`
  - 导出 `labStages`、`initialLabCards`、`initialCompletedExperiments`。
  - mock 内容对齐 `docs/design-docs/public/lab/prototype.html`，覆盖四个阶段和完成实验。
- 在 `LabPage.tsx` 中使用 `useState` 持有：
  - `cards`
  - `completedExperiments`
  - `selectedCardId`
  - `activeDialog`
  - `moreMenuOpen`
- 验证：
  - 四列数量来自 `cards` 当前状态。
  - mock 数据不依赖 `window.actspace`。

### 3. 四栏实验矩阵

- 在 `LabPage.tsx` 内实现：
  - 顶部栏：`Lab`、`已完成实验`、`新实验`。
  - 四列矩阵：阶段名、数量、`+` 图标按钮、卡片列表、空槽占位。
  - 卡片：标签、标题、元信息；点击选中并打开详情弹窗。
- 在 `LabPage.tsx` 中使用 Tailwind utility / 局部 class 常量表达样式：
  - 页面布局、顶部栏、四列、卡片、列头、空槽。
  - 保持与原型一致的紧凑密度和浅色列底。
  - 不新增 Lab 专属全局样式；Lab 样式保留在 `LabPage.tsx` 的 Tailwind utility / 局部 class 常量中。
- 验证：
  - 浏览器 mock 下四列全部可见。
  - 卡片高度稳定，长标题不撑开布局。
  - 窄宽度下可横向滚动，不挤压到不可读。

### 4. 新实验弹窗

- 在 `LabPage.tsx` 中实现新实验弹窗：
  - 字段：`标题`、`问题 / 想法`。
  - `取消`、关闭按钮、遮罩、Escape 均关闭并重置表单。
  - `创建` 后向 `hypothesis` 列顶部插入草稿卡：
    - 标签 `草稿`
    - 元信息 `User · 刚刚`
    - 详情包含 `问题 / 想法` 和下一步补齐项。
  - 创建后选中新卡并关闭弹窗。
- 验证：
  - 创建前后 `hypothesis` 列数量 +1。
  - 新卡出现在假说列顶部。
  - 新卡详情能看到输入内容。

### 5. 卡片详情弹窗和更多菜单

- 在 `LabPage.tsx` 中实现卡片详情弹窗：
  - 标题、状态胶囊、主内容、检查项、右侧属性。
  - 底部动作：`编辑`、动态主按钮、`⋯` 图标菜单。
  - `⋯` 菜单包含 `暂停`、`取消`。
  - 菜单打开时 Escape 只关闭菜单；菜单关闭时 Escape 关闭弹窗。
- 交互：
  - `编辑` V0 可以进入轻量编辑态或打开只读占位编辑区；如果实现编辑态，应至少能修改标题和第一段内容。
  - 动态主按钮推进阶段：
    - `hypothesis` -> 新增 / 移动到 `verification`
    - `verification` -> 新增 / 移动到 `forge`
    - `forge` -> 新增 / 移动到 `promotion`
    - `promotion` -> 标记为已晋升并进入完成集合
  - `暂停`：将卡片从主矩阵移除，加入完成集合，结果显示 `已暂停` 或 `已废弃` 中选择一个固定 V0 文案。
  - `取消`：将卡片从主矩阵移除，加入完成集合，结果显示 `已废弃`。
- 验证：
  - 每个阶段卡片点击后弹窗内容正确。
  - `⋯` 菜单显示 `暂停 / 取消`。
  - 主按钮推进后对应列数量变化。
  - 暂停 / 取消后主矩阵移除卡片，已完成弹窗可见记录。

### 6. 已完成实验弹窗

- 在 `LabPage.tsx` 中实现已完成实验弹窗：
  - Tabs：`全部`、`已晋升`、`已拒绝`、`已废弃`。
  - 表格列：实验标题、结果、产物、完成时间、查看。
  - V0 中 `查看` 可以打开只读详情弹窗或保留为无导航按钮，但必须有明确可见状态；推荐打开同一个详情弹窗的只读完成态。
- 验证：
  - 点击顶部 `已完成实验` 打开弹窗。
  - Tabs 能过滤 mock 完成记录。
  - 从暂停 / 取消 / 晋升产生的新完成记录出现在列表里。

### 7. Renderer 测试

- 新建 `packages/desktop/src/renderer/test/lab-page.test.tsx`：
  - 渲染四列和初始卡片。
  - 点击 `新实验`，提交后新增草稿卡。
  - 点击卡片打开详情弹窗。
  - 点击 `⋯` 显示 `暂停 / 取消`。
  - 点击主按钮推进阶段后列数量变化。
  - 点击 `已完成实验` 后能看到完成列表。
- 如测试环境已有全局 setup，沿用 `packages/desktop/src/renderer/test/setup.ts`。
- 验证：
  - `pnpm --filter @actspace/desktop test -- lab-page.test.tsx` 通过。

### 8. 验收和收尾

- 工程验证：
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm --filter @actspace/desktop test -- lab-page.test.tsx`
  - 必要时运行 `pnpm typecheck`。
- 浏览器 mock 验证：
  - 启动 renderer：`pnpm --filter @actspace/desktop dev:renderer`
  - 打开 `http://127.0.0.1:5173/`
  - 点击 sidebar `Lab`，验证新实验、详情、推进、更多菜单、已完成弹窗。
- Electron 真实验证：
  - 因本计划只做 renderer mock，不涉及 IPC / preload / 持久化；完成阶段建议用 Electron 窗口确认 Lab 页面可从 sidebar 打开且无空白。
  - 若当前环境无法稳定运行 Electron，则在收尾说明中记录限制，并至少完成浏览器 mock 交互截图 / 状态检查。
- 文档收尾：
  - 更新 `docs/histories/YYYY-MM/<timestamp>-lab-v0-frontend-mock.md`。
  - 如实现与 `docs/design-docs/lab-frontend-page-design.md` 不一致，同步设计文档。
  - 完成后将本 plan 进度全部勾选；若仍有后续后端 / IPC 工作，保留本 plan 为完成前端后续任务或新建后端 plan。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm --filter @actspace/desktop test -- lab-page.test.tsx`
  - `pnpm typecheck`（最终收口或跨包类型受影响时）
- 手工检查：
  - Sidebar 点击 `Lab` 后显示真实页面。
  - `新实验` 创建草稿卡。
  - 点击卡片打开详情。
  - 主按钮能推进阶段。
  - `⋯` 菜单能暂停 / 取消。
  - `已完成实验` 弹窗可查看完成记录。
- 观测检查：
  - 浏览器 mock 页面无 console error。
  - 桌面窗口中 Lab 页面不白屏，不影响 Chat / Usage / Kairos 导航。

## 进度记录

- [x] 确认本计划只覆盖 renderer 前端 mock，不做后端 Agent、IPC 或持久化。
- [x] 对齐 `docs/design-docs/public/lab/prototype.html` 和 `docs/design-docs/lab-frontend-page-design.md` 的页面范围。
- [x] 完成 LabPage 外壳接入。
- [x] 完成 renderer mock view model 和 fixture。
- [x] 完成四栏矩阵和卡片样式。
- [x] 完成新实验弹窗与创建草稿卡流程。
- [x] 完成卡片详情弹窗、推进流程和更多菜单。
- [x] 完成已完成实验弹窗和过滤。
- [x] 完成 renderer 测试。
- [x] 完成 typecheck / 测试 / 浏览器 mock 验收。
- [x] 完成 history 和计划状态收尾。

## 决策记录

- 2026-05-28：今天先做前端真实页面和 mock 交互流程；后端 Agent、Lab Runtime、IPC 和持久化继续等待后续设计。这样可以先验证用户工作流和界面密度，避免在数据模型尚未稳定时过早绑定后端协议。
- 2026-05-28：新实验弹窗 V0 只收集 `标题` 和 `问题 / 想法`，把能力缺口、初始假说、成功标准等放到详情弹窗后续补齐。这样入口足够轻，符合“快速捕获实验想法”的产品语义。
- 2026-05-28：Lab 页面样式采用 Tailwind utility + `LabPage.tsx` 局部 class 常量，不再追加 `.lab-*` 全局 CSS。原因是仓库已有 Tailwind v4 样式架构计划，新增前端页面应优先沿用 Usage 样板的写法，减少旧 `styles.css` 的继续膨胀。
