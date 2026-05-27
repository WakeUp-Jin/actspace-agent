# 2026-05-27 右侧工作区视图计划

## 目标

把右侧区域从静态设计推进为可用的对象浏览工作区。第一版优先支持文件预览、HTML 渲染、完整 Context 只读视图和 Kairos 状态视图，让用户可以一边聊天一边查看当前对象和运行状态。

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
- `docs/design-docs/frontend-ui/index.md`
- `docs/design-docs/frontend-ui/工作台布局与面板交互规范.md`
- `docs/design-docs/frontend-ui/右侧面板与文件渲染规范.md`
- `docs/design-docs/frontend-ui/Kairos监控页规范.md`
- `docs/design-docs/frontend-ui/Kairos右侧紧凑视图规范.md`
- `docs/design-docs/agent-core/kairos-autonomous-mode.md`

补充素材：

- `2026-05-27的使用bug小记.md`

## 范围

包含：

- `#21` 打开终端：本计划明确暂不做，仅保留入口状态或禁用说明。
- `#22` 打开浏览器：先评估并实现简单 HTML 文件渲染，不做完整外部浏览器。
- `#23` 打开文件并显示预览。
- `#24` 打开文件改变：明确后置，不在第一版实现。
- `#25` 打开 Context 完整信息：先做只读展示，后续再支持删除和增加。
- `#26` 打开 Kairos 视图：只做部分组件，让用户边聊天边查看 Kairos 状态。

不包含：

- 不实现终端嵌入。
- 不实现真实 Chrome / 外部浏览器控制。
- 不实现文件编辑保存。
- 不实现 Context 增删改。
- 不重做 Kairos 全页面；只做右侧轻量状态视图。
- 不处理 Composer、附件或设置页样式。

> Kairos 右侧轻量状态视图已拆出独立计划 `docs/exec-plans/active/20260528-kairos-right-panel-compact-view.md`，该计划负责具体组件拆分、同源数据流和窄宽适配。本计划保留右侧面板总框架与文件/Context/HTML 等对象浏览主线。

## 相关代码路径

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/**`
- `packages/desktop/src/renderer/fixtures/**`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/session.ts`
- `docs/design-docs/frontend-ui/右侧面板与文件渲染规范.md`
- `docs/design-docs/frontend-ui/Kairos监控页规范.md`
- `docs/design-docs/frontend-ui/Kairos右侧紧凑视图规范.md`
- `docs/design-docs/agent-core/kairos-autonomous-mode.md`

## 并行边界

- 本计划 owns right panel shell、tabs、file preview、HTML preview、Context full read-only panel and Kairos side view。
- 不修改 Composer 的 Context popup；如需共享 Context 数据，消费同一份 context state。
- 不修改 Usage 页面。
- 如果需要新增 IPC 读取文件，必须保持 renderer 不直接访问文件系统。

## 实施任务

### Task 1: 右侧面板 Tab 底座

修改目标：

- 建立右侧面板打开/关闭状态、Tab 列表、当前 Tab、关闭 Tab。
- 点击消息中的文件、链接、图片或 diff 时可打开对应 Tab。
- 面板关闭后把空间还给聊天区。

验收：

- 点击文件类消息后右侧面板打开。
- 多个 Tab 可切换和关闭。
- 空态和关闭态都稳定。

### Task 2: 文件预览

修改目标：

- 支持 `md`、文本/代码、图片优先预览。
- renderer 通过 preload / IPC 请求文件内容，不直接读文件系统。
- 文件路径显示相对 workspace 路径，完整路径放到详情或 tooltip。

验收：

- 打开 Markdown 文件显示渲染文档，可切源码。
- 打开图片直接预览。
- 打开普通文本或代码显示可滚动内容。

### Task 3: HTML 渲染视图

修改目标：

- 支持打开本地 HTML 文件并在右侧渲染。
- 第一版优先使用安全 iframe / sandbox 策略。
- 不承诺完整浏览器能力，不运行危险本地权限。

验收：

- 简单 HTML 文件可以在右侧显示。
- HTML 预览不会获得 Node / Electron 特权。
- 资源加载失败时显示可读错误。

### Task 4: Context 完整只读视图

修改目标：

- 在右侧打开完整 Context 信息。
- 展示 system、tools、rules、skills、MCP、subagents、conversation、recent files 等分组。
- 不提供删除、增加或编辑操作。

验收：

- 从聊天区或 Context 入口可以打开右侧 Context Tab。
- 有 context state 时展示真实数据；没有时展示空态或 snapshot。
- 分组可折叠，长内容可滚动。

### Task 5: Kairos 轻量状态视图

修改目标：

- 由 `docs/exec-plans/active/20260528-kairos-right-panel-compact-view.md` 承接具体实现。
- 本计划只要求右侧面板 tab 底座能够容纳 Kairos tab，不在这里重复定义 compact 布局。

验收：

- Kairos compact plan 完成后，可以通过右侧面板打开 Kairos tab。
- 右侧面板总框架不阻断 Kairos compact 视图接入。

### Task 6: 暂缓入口收口

修改目标：

- 对 `打开终端` 和 `打开文件改变` 做明确暂缓状态。
- UI 不应该出现点击无响应的入口。

验收：

- 暂不支持的入口禁用或显示简短说明。
- 文档记录后续计划，不让用户误以为是坏了。

## 验证方式

- `pnpm typecheck`
- `pnpm build`
- 浏览器 mock 验证面板布局、Tab、Markdown、图片和 HTML mock。
- 涉及文件读取、preload、IPC 和本地路径时必须做 Electron 真实验证。

## 进度记录

- [ ] 确认当前 right panel shell 和 split view 状态。
- [ ] 完成右侧面板 Tab 底座。
- [ ] 完成文件预览。
- [ ] 完成 HTML 渲染视图。
- [ ] 完成 Context 完整只读视图。
- [ ] 与 `20260528-kairos-right-panel-compact-view.md` 对齐 Kairos tab 接入边界。
- [ ] 完成暂缓入口收口。
- [ ] 跑完验证，更新必要文档和 history。

## 决策记录

- 2026-05-27：右侧工作区第一版只做查看，不做编辑；终端和文件改变明确后置，避免把右侧面板变成过大的并行任务。
