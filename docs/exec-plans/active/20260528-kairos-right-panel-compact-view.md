# 2026-05-28 Kairos 右侧紧凑视图计划

## 目标

在聊天态右侧对象浏览面板中新增 `Kairos` tab，让用户不离开主聊天区也能看到 Kairos 当前状态、最近最终回复和最近轨迹。该视图是完整 Kairos 页面之外的紧凑投影，必须复用同一条 Kairos 数据流，不新增 compact 专属后端 IPC。

## Required Reading

新会话执行本计划前必须先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANS_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- `docs/design-docs/frontend-ui/工作台布局与面板交互规范.md`
- `docs/design-docs/frontend-ui/右侧面板与文件渲染规范.md`
- `docs/design-docs/frontend-ui/Kairos监控页规范.md`
- `docs/design-docs/frontend-ui/Kairos右侧紧凑视图规范.md`
- `docs/design-docs/agent-core/kairos-autonomous-mode.md`

## 范围

包含：

- 在右侧对象浏览面板中增加 `Kairos` tab / 视图入口。
- 新增 `KairosRightPanelView` 紧凑组件，展示 Header、最终回复、轨迹列表三段。
- 抽取 Kairos 共享 selectors / formatting helper，供完整页和右侧紧凑视图复用。
- 调整 `RightPanel` 的 tab state，使 `README.md`、`Session diff`、`Kairos` 可切换。
- 补充 renderer 单测，覆盖 compact view 的布局、空态、状态、轨迹列表不可点击。
- 做浏览器 mock / Electron 真实验证，确认 320px 最小宽度下不重叠。

不包含：

- 不新增 Kairos 后端 IPC、controller、scheduler、storage 或事件类型。
- 不改 `aggregateKairosEvents` 语义，除非实现时发现 compact 视图无法从现有 row 得到必要信息。
- 不在右侧紧凑视图展示工具结果详情、原始 JSON、配置、Briefs、Notes 或统计卡片。
- 不重写完整 `KairosPage` 的两列监控台布局。
- 不实现右侧 panel 的通用多 tab 关闭 / 拖拽 / 持久化 tab tree；本计划只做当前静态 tab 集的切换。

## 背景

### 相关设计文档

- `docs/design-docs/frontend-ui/Kairos右侧紧凑视图规范.md`：本计划的视觉与交互事实来源。
- `docs/design-docs/frontend-ui/Kairos监控页规范.md`：完整页面规范，避免 compact 需求反向削弱完整页。
- `docs/design-docs/agent-core/kairos-autonomous-mode.md`：Kairos 事件、工具和 IPC 契约事实来源。

### 相关代码路径

- `packages/desktop/src/renderer/components/RightPanel.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/pages/KairosPage.tsx`
- `packages/desktop/src/renderer/state/useKairos.ts`
- `packages/desktop/src/renderer/styles/index.css`
- `packages/desktop/src/renderer/styles/electron.css`
- `packages/desktop/src/renderer/styles/markdown.css`
- `packages/desktop/src/renderer/styles/diff.css`
- `packages/desktop/src/renderer/test/kairos-page.test.tsx`
- 计划新增：`packages/desktop/src/renderer/state/kairosSelectors.ts`
- 计划新增：`packages/desktop/src/renderer/components/right-panel/KairosRightPanelView.tsx`
- 可选新增：`packages/desktop/src/renderer/test/kairos-right-panel-view.test.tsx`

### 已知约束

- Renderer 不能直接读文件系统。
- 右侧面板最小宽度约 320px，内容不能假设完整 Kairos 页面宽度。
- `view === "kairos"` 仍表示主工作区完整 Kairos 页面；右侧 compact tab 不应该切走主聊天区。
- 当前 `RightPanel` 是静态 mock；本计划第一版可在静态 tab 基础上推进，不要求同时完成完整对象 tab 系统。

## 设计方案

### 数据流

采用一条数据流服务两个页面：

```txt
window.kairos onEvent/onState
  -> useKairos()
  -> aggregateKairosEvents(events)
  -> kairosSelectors
  -> KairosPage / KairosRightPanelView
```

第一版不引入 `KairosProvider`。原因：当前 Workbench 不会同时展示完整 Kairos 主页面和右侧 Kairos compact；分别调用 `useKairos()` 的复杂度最低。若后续出现重复订阅或性能问题，再把订阅提升到 provider。

### 组件复用

复用层级：

- 复用：`useKairos()`、`aggregateKairosEvents()`、selectors、格式化 helper、状态文案、类型文案。
- 不复用：完整页的两列布局、执行表格、工具结果详情、统计区。

### 右侧紧凑视图布局

只保留三段：

1. Header：`Kairos` + 状态胶囊 + `暂停/开启`、`立即唤醒`、`重置今日`。
2. 最终回复：展示最近一次 assistant 回复正文。
3. 轨迹列表：展示最近若干 `KairosEventRow`，不可点击、无 selected row、无详情切换。

## 风险

- 风险：完整页和 compact 视图复制 helper，后续文案和时间格式漂移。
  - 缓解方式：先抽 `kairosSelectors.ts`，两个视图都从这里取派生数据。
- 风险：右侧 320px 宽度下 Header 按钮挤压状态文字。
  - 缓解方式：按钮允许短文案或图标化；Playwright / Electron 验证最小宽度截图。
- 风险：让 compact tab 调用 `useKairos()` 产生第二份 IPC 订阅。
  - 缓解方式：第一版接受；如发现同时展示或性能问题，再升级为 `KairosProvider`。
- 风险：右侧 compact 需求反向污染完整 Kairos 页面。
  - 缓解方式：完整页面与 compact view 分组件，不把 compact 布局塞进 `KairosPage` 条件分支。

## 实施任务

### Task 1: 抽取 Kairos selectors

修改目标：

- 新增 `state/kairosSelectors.ts`。
- 抽出最近回复、展示 rows、状态文案、时间/耗时格式化、kind label 等纯函数。
- `KairosPage.tsx` 改为优先调用 selector，减少页面内部重复 helper。

验收：

- `KairosPage` 行为不变。
- selector 有单测或通过现有 `kairos-page.test.tsx` 间接覆盖。

### Task 2: 建立 RightPanel tab state

修改目标：

- 将 `RightPanel` 从静态按钮改成内部可切换 tab。
- tab 包含 `README.md`、`Session diff`、`Kairos`。
- 保持现有 mock Markdown / diff 内容可显示。

验收：

- 点击 `Kairos` tab 后右侧面板内容切换为 compact view。
- 切换回 `README.md` / `Session diff` 不丢布局。

### Task 3: 实现 `KairosRightPanelView`

修改目标：

- 新增右侧紧凑组件。
- 使用 `useKairos()` + selectors。
- 显示 Header、最终回复、轨迹列表。
- 控制按钮调用 `k.control({ type })`，错误显示为紧凑错误行。

验收：

- 无 `window.kairos` 时显示紧凑不可用空态。
- Kairos stopped / sleeping / ticking 三类状态能展示合理文案。
- 轨迹列表只读，不响应行点击，不维护 selected row。

### Task 4: CSS 与窄宽适配

修改目标：

- 增加 right-panel compact Kairos 样式。
- 320px 宽度下 Header、状态胶囊、按钮、列表摘要不重叠。
- 最终回复区设置合理最大高度，轨迹列表保留滚动空间。

验收：

- 右侧宽度 320px、390px、640px 三档视觉稳定。
- 按钮不会把 `Kairos` 标题和状态挤出容器。

### Task 5: 测试与验证

修改目标：

- 增加 renderer 单测，覆盖 tab 切换和 compact Kairos 展示。
- 复用 fake `window.kairos` 安装工具，必要时从 `kairos-page.test.tsx` 抽测试 helper。
- 用浏览器 mock / Electron 实机验证右侧 compact 布局。

验收：

- `pnpm --filter @actspace/desktop test`
- `pnpm typecheck`
- `pnpm build`
- Electron 验证：聊天页打开右侧 panel → 切到 Kairos tab → 主聊天仍可见，右侧 compact 不重叠。

### Task 6: 文档与 history 收尾

修改目标：

- 根据实际实现更新 `Kairos右侧紧凑视图规范.md`。
- 如右侧通用 tab 行为有变化，同步 `右侧面板与文件渲染规范.md`。
- 新增 history。

验收：

- 文档和代码实际行为一致。
- active plan 进度记录已更新。

## 验证方式

- `pnpm --filter @actspace/desktop test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm dev:log` 后做 Electron 真实验证：
  - 打开聊天页。
  - 打开右侧面板。
  - 切换到 Kairos tab。
  - 调整右侧宽度到最小附近。
  - 确认 Header / 最终回复 / 轨迹列表三段可读且不遮挡。

## 进度记录

- [x] 确认设计文档和计划入口。
- [x] 完成 selectors 抽取。
- [x] 完成 RightPanel tab state。
- [x] 完成 KairosRightPanelView。
- [x] 完成 CSS 窄宽适配。
- [x] 完成测试和 Electron 验证。
- [x] 完成文档与 history 收尾。

## 决策记录

- 2026-05-28：右侧 Kairos compact 与完整 Kairos 页面共享同一条 `useKairos + aggregateKairosEvents` 数据流，不新增后端 IPC。原因是 compact 只是展示密度不同，不是新的运行语义。
- 2026-05-28：第一版不引入 `KairosProvider`。原因是当前不会同时展示完整 Kairos 主页面和右侧 compact，分别订阅复杂度最低；未来出现重复订阅问题再升级。
- 2026-05-28：右侧 compact 不展示工具结果详情。原因是 320-390px 宽度下工具输入/输出会挤压主信息，完整工具调试留给完整 Kairos 页面。
- 2026-05-28：右侧 tab 行提升到 chrome 浮层之上，`right-tabs` 自身 `pointer-events: none`，仅 tab 按钮恢复 `pointer-events: auto`。原因是 hidden titlebar 的 `.chrome-center` 拖拽区会覆盖右侧 tab 首行，导致浏览器/Electron 中可见但不可切换；右侧已预留 PanelRight 按钮 padding，所以按钮命中区仍不和关闭右侧面板入口重叠。

## 完成记录

- 新增 `packages/desktop/src/renderer/state/kairosSelectors.ts`，供完整 Kairos 页面和右侧 compact 共享状态文案、时间/耗时格式化、最近回复、工具结果等派生逻辑。
- 新增 `packages/desktop/src/renderer/components/right-panel/KairosRightPanelView.tsx`，右侧 compact 只展示 Header、最终回复、只读轨迹列表三段。
- `RightPanel` 支持 `README.md` / `Session diff` / `Kairos` 三个静态 tab 切换；右侧 Kairos tab 不改变主工作区 `view`。
- 补充 `packages/desktop/src/renderer/test/right-panel-kairos.test.tsx`，覆盖 tab 切换、无桥空态、compact 展示、轨迹列表不可点击和控制按钮。
- 验证已完成：`pnpm --filter @actspace/desktop test`、`pnpm typecheck`、`pnpm build`、浏览器 mock 交互、Electron 真实窗口交互与右侧 320px 最小宽度附近观察。
