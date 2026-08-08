# Kairos 默认隐藏与功能门控

## 目标

为 Kairos 增加独立于自治循环启停状态的产品功能开关。新安装和缺少该字段的现有安装默认关闭：非设置页面不展示 Kairos 入口，也不创建运行时 Controller；用户可在「设置 > Kairos」显式启用功能，之后再到 Kairos 页面决定是否启动自治循环。

## 范围

- 包含：
  - 在 `settings.json` 的 `kairos` 分区持久化 `featureEnabled`，安全默认值为 `false`。
  - 设置页保留 Kairos 导航，并提供功能 Toggle；关闭时不挂载其余 Kairos 配置表单。
  - 门控左侧栏、右侧面板启动页与对象菜单中的 Kairos 入口，并关闭遗留的 Kairos 右侧 Tab。
  - 功能关闭时持久化自治循环关闭意图，停止并释放 Controller；应用启动时跳过 Controller 初始化。
  - 功能开启时按已有模型和 `preferences.enabled` 状态创建 Controller，但不强制启动自治循环。
  - 更新设计文档、测试和 history。
- 不包含：
  - 删除 Kairos 页面、配置、历史、模型选择、Skill 白名单或运行记录。
  - 改造 Kairos prompt、工具集、调度算法或现有「开启 / 暂停」交互。
  - 修改本任务开始前已有的发布记录改动。

## 背景

- 相关文档：
  - `docs/design-docs/kairos/agent-kairos-autonomous-mode.md`
  - `docs/design-docs/kairos/front-Kairos监控页规范.md`
  - `docs/design-docs/frontend/front-设置页规范.md`
  - `docs/FRONTEND_VERIFICATION.md`
- 相关代码路径：
  - `packages/shared/src/settings.ts`
  - `packages/desktop/src/main/settings-service.ts`
  - `packages/desktop/src/main/index.ts`
  - `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
  - `packages/desktop/src/renderer/components/Sidebar.tsx`
  - `packages/desktop/src/renderer/components/RightPanel.tsx`
  - `packages/desktop/src/renderer/components/right-panel/RightPanelObjectMenu.tsx`
  - `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- 已知约束：
  - Kairos 配置 IPC 必须常驻，不能重新依赖可选的 Controller。
  - `featureEnabled` 只控制产品能力是否可用；`preferences.enabled` 继续表示自治循环运行意图。
  - 关闭功能后不能留下不可见的后台自治循环。
  - renderer 不直接访问文件系统，所有持久化仍走现有 settings/config IPC。

## 风险

- 风险：关闭功能时只隐藏 UI，Controller 仍在后台运行。
- 缓解方式：main 进程先写入 `preferences.enabled=false` 并停止 Controller，再释放运行时 IPC。
- 风险：Controller 不存在时设置页读取运行态 IPC 报错。
- 缓解方式：关闭状态只挂载功能 Toggle；配置控制面 IPC 继续常驻。
- 风险：开启功能被误解为立即启动自治循环。
- 缓解方式：Controller 创建使用普通 `start()`，尊重默认关闭的 `preferences.enabled`，不使用 `force=true`。
- 风险：隐藏入口后仍保留已打开的 Kairos 右侧 Tab。
- 缓解方式：Workbench 观察功能开关并关闭 `id="kairos"` 的 Tab，所有创建入口同时门控。

## 里程碑

1. 扩展 settings 契约、默认值、迁移和生命周期调和。
2. 接入设置页开关与 renderer 全入口门控。
3. 补齐聚焦测试和设计事实。
4. 完成工程验证、history 和 plan 归档。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/shared build`
  - `pnpm --dir packages/desktop test -- src/main/test/settings-service.test.ts src/renderer/test/settings-page.test.tsx src/renderer/test/workbench-layout.test.tsx src/renderer/test/right-panel-kairos.test.tsx`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm check:docs`
  - `pnpm check:frontend-theme`
  - `git diff --check`
- 手工检查：
  - 默认设置下左侧栏、右侧启动页和 `+` 菜单都没有 Kairos。
  - 设置页始终存在 Kairos 分区；开启后完整配置出现，关闭后只保留功能开关。
  - 开启功能不会自动开始自治循环。
- 观测检查：
  - 功能关闭启动时不出现 `kairos controller ready`。
  - 功能开启且模型可用时可创建 Controller；`preferences.enabled=false` 时保持 stopped。

## 进度记录

- [x] 2026-08-08：确认需求、现有入口、配置持久化与 Controller 生命周期。
- [x] 完成 settings 契约和 main 生命周期门控。
- [x] 完成 renderer 入口门控与设置页开关。
- [x] 完成测试、文档、history 和工程验证。

## 决策记录

- 2026-08-08：使用 `kairos.featureEnabled` 作为产品功能开关，不复用 `preferences.enabled`，避免「入口可见」与「自治循环正在运行」语义混淆。
- 2026-08-08：缺少字段按 `false` 处理，因此升级后的现有安装也默认隐藏；保留全部 Kairos 数据和配置。
- 2026-08-08：设置页 Kairos 导航始终可见，作为关闭状态下唯一的显式恢复入口。

## 完成结果

- `featureEnabled` 已进入 shared 契约、v2 默认值、v1 迁移与 settings 原子持久化，缺失字段统一回落 `false`。
- main 启动、模型变更、Skill 变更和设置更新均受功能门控；关闭时将自主循环意图持久化为 `false` 并释放 Controller，配置 IPC 保持常驻。
- Sidebar、右侧对象启动页、对象菜单和遗留 Kairos Tab 已统一门控；设置页关闭态只挂载功能 Toggle。
- 聚焦 Vitest 7 个文件、162 项通过；桌面端全量 Vitest 94 个文件、763 项通过，仍有 `app-streaming-user-message.test.tsx` 中 2 个任务开始前已有的紧凑侧栏状态断言失败。
- `pnpm typecheck`、`pnpm build`、`pnpm check:docs`、`pnpm check:frontend-theme` 和 `git diff --check` 通过。
- 浏览器 renderer 实测默认左侧栏、右侧对象启动页与对象菜单均不显示 Kairos，设置导航仍保留 Kairos。`pnpm dev:log` 编译与 Electron runtime 启动成功；Computer Use 无法读取动态开发窗口，真实 IPC 点击链路留作人工验收边界。
