# 执行过程：统计页重做

计划：[20261107-stats-redesign](../../exec-plans/active/20261107-stats-redesign.md)

## 2026-11-07

- demo 第 4 版确认；两份只读调查（使用统计数据层、Harness 表删留）完成并抽查。
- 写定 [统计页规范](../../design-docs/frontend/front-统计页规范.md) 与执行计划。
- 开始 T1。
- T1–T8 数据层完成（自己写）：usage 读模型 v18（小时汇总、`queryUsageActivity` 一次给全卡片数据、请求明细服务端分页）；Harness 表瘦身（删 7 张表、停采不显示的数据，新增 Bash 程序与 Skill 文件表）；查询 kind 改为 `options / overview / usage-vs / context / disclosure / plugins / versions`；删 `usage-source-cache.ts`、client `usage-aggregates.ts` 与 `usage.getStatistics` 通道。主进程 615 通过、harness-stats 包 16 通过、client 79 通过。
- T9 共用件：`components/stats/stats-ui.tsx`（指标卡、卡片网格、环形图、柱图、热力图、排行列表、悬停卡、明细表、分页）与 `stats-format.ts`、`styles/stats.css`。
- T10 使用统计页重写（自己写）：`UsageStatisticsPage.tsx` + `usage/usage-stats-model.ts`；mock `?mock=usage-stats`；测试 12 条。偏好晚到时只水合一次，写回 300ms 防抖、与已存值相同不写。
- T11 Harness 页交给并行分支（fork），只改 `components/harness-stats/**`、`mock/harness-stats-fixture.ts`、`test/harness-stats-*.test.tsx`。

## 2026-11-08

- 删旧 `UsageHoverCard`、usage 预览夹具；`native-button-baseline.json` 去掉两项；修 `app-streaming-user-message.test.tsx`（第一次 sed 误删了同一行里的别的 override，从 HEAD 重新精确替换）。
- 检查：渲染层（不含 harness）204 文件 2125 通过；`typecheck:contracts`、client / harness-stats / shared tsc 通过；`check:frontend-tokens`、`check:frontend-theme`、`check:ipc-channels`、`check:renderer-bridge`、`check:packages`、`check:desktop-build-graph` 通过。
- `check:current-docs` 报归档文档链到已删的 `usage-aggregates.ts`，改成纯文字；`check:hot-path-reads` 基线收紧（`usage-source-cache.ts` 已删）。
- 文档：11-Harness统计设计 §4–§7、front-设置页规范 §10–§11、frontend README、FRONTEND_VERIFICATION 已同步。
- T11 并行分支完成：`HarnessStatsPage` + `HarnessStatsCards` / `HarnessStatsDetail` / `harness-stats-parts`，删旧 7 个 tab 组件与旧图表件；主线程审过入口与跳转逻辑。
- 全量：渲染层 206 文件 2150 通过，主进程 615 通过；根 `typecheck`、`check:repo`、`check:docs` 等通过。
- 浏览器截图（`?mock=usage-stats` / `?mock=harness-stats`，浅 / 深，1240 / 820 / 600）后修了三处：
  - 使用统计页外层多套了一个 `main` 且自带滚动，和设置页的滚动容器重复，改成普通 `div`。
  - 指标卡副行原来单行截断（「输入 354.3M · 输出 18…」），改成在「 · 」处换行、数字不拆开。
  - 工具失败原因补中文标签（退出码非 0、超时、权限被拒绝等），不认识的代码原样显示。
- 820px 时明细表格比卡片宽，在表格框里横向滚动（表格最小宽 40rem），页面本身不横向溢出。
