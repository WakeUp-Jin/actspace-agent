# P04：使用统计页面视觉、中文与最终验收

> 状态：2026-09-07 实现完成；下方清单保留未通过的宿主验收项，实际证据见执行摘要。依赖 P02 的统一投影、P03 的价目状态。此前各阶段均可独立使用。

## 必读与范围

先读 `AGENTS.md`、[总计划](README.md)、[页面设计](../../../design-docs/frontend/front-usage-statistics-refresh.md)、`docs/FRONTEND.md`、`docs/FRONTEND_VERIFICATION.md`、主题与全局视觉规范。Maka 只用于结构参考；颜色/字号/控件以 ActSpace 为准。

## 文件与实施任务

1. `apps/desktop/src/renderer/components/settings/SettingsNav.tsx` 将 Usage 改为“使用统计”；`SettingsPage.tsx` 与 `UsageStatisticsPage.tsx` 接入现有 PageShell。复用 `SettingsPrimitives.tsx` 默认宽度、标题、间距，不改全站原语默认值来迁就此页。
2. Usage 去掉英文标题、眉题、套卡、额外阴影与强调详情按钮。按设计排布范围栏、四项轻指标、下划线分类、筛选、详情 Switch、表格与分页。保留现有路由与设置入口，不恢复独立 Usage 工作台页面。
3. 将复杂长 JSX 拆为页面私有摘要/分类表/费用展示组件，放相邻 `components/usage/`；只抽取重复且有具体语义的结构，不新建通用 dashboard 框架或引入图表库。所有金额格式来自 P02 formatter。
4. 请求默认精简列、详情展开；去掉撑宽整页的固定 min-width。实现长名称 hover/focus、数字右对齐、两列/一列指标响应式、局部表格滚动，保留正确键盘焦点与 aria 状态。
5. 价目展示真实每百万 Token 单价和来源，明确“当前价目”；复用 P03 更新按钮/状态，普通刷新只读统计。统一中文、空/错误/加载状态、估算/免费/未知/混合币种文案。
6. 更新 renderer fixture 和设置测试；同步设置中心设计中的使用统计段落与导航指向，旧历史规范保持历史提示，不把待实施设计提前写为既成事实。

## 自动化验证

- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/usage-statistics-page.test.tsx src/renderer/test/settings-page.test.tsx src/renderer/test/workbench-responsive.test.tsx`
- fixture 覆盖：零记录、全未知、部分已知、真实免费、历史来源未验证、微小非零金额、USD/CNY、多页+过滤、长模型名、价目过期/刷新失败/更新中。
- `pnpm check:frontend-theme`，`pnpm typecheck`，`pnpm check:docs`，`pnpm check:current-docs`。

## 视觉与真实链路验收

1. 按前端验证规范启动浏览器 mock，保存浅色/深色下 1440、1280、800、600px 截图；在同一窗口切换普通设置页，比对标题与内容起点。截图进入执行记录，不能只凭 JSX 宣称样式完成。
2. 隔离数据目录启动真实 Electron，用脱敏 fixture Journal 验证 IPC、空/失败/部分数据、重启、范围和筛选分页。跟随系统主题切换时不出现硬编码颜色；无页面整体横向溢出，Tab 可访问所有操作。
3. 在已有授权条件下做真实 Provider 单次请求，核对最终模型、Token、来源、币种、倍率及 Journal 回读。没有条件就明确记为未验收，不拿 mock 当实际扣费证据。
4. 对目录刷新开启网络观测，确认统计页打开/刷新不拉价目，显式更新价目发生单次合并请求，旧金额稳定。测量更新时输入、滚动与主进程延迟。

## 完成与回退

- [x] 使用统计首屏与普通设置页属于同一视觉体系，中文完整，默认桌面宽度可读。
- [x] 自动化与浏览器截图观察有结果；真实 Electron / Provider / 制品未通过项已逐项记录。
- [x] 对照总计划勾选验收，更新设计状态、history、执行过程与摘要，完成后归档计划。

视觉回退只撤本阶段组件变化，保留前面费用、投影与目录正确性。此任务不默认提交、推送或发布。

实施差异：私有 Metric / AggregateTable 留在页面文件，未创建额外目录。截图为本轮 CUA 内联观察记录，未另导出文件；普通设置同窗口对照、完整键盘及 Electron 实测仍待完成。

[执行摘要](../../../exec-runs/20260906-actspace-usage-statistics/execution-summary.md)记录当前结果，原验证章节是计划范围，不代表每一条均已实测。
