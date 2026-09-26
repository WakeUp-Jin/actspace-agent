# P02：统一使用统计投影与历史口径

> 状态：2026-09-07 实现完成；下方清单保留未通过的宿主验收项，实际证据见执行摘要。依赖 P01 的费用契约；产物供 P04 消费。完成后现有页面即可展示正确口径。

## 必读与范围

先读 `AGENTS.md`、[总计划](README.md)、[费用设计](../../../design-docs/model-context/agent-model-catalog-and-usage-cost.md) 与 `docs/design-docs/agent-runtime/agent-observability-trace-model.md`。只从 v2 Journal 派生统计，不修改原始会话、不引入旧账本或历史自动重算。

## 文件与实施任务

1. 在 `packages/shared/src/ipc.ts` 的 UsageActivitySnapshot schemaVersion 1 上追加可选 `aggregates`、`costSummary` 与查询 search 字段，保留旧调用方；在 `runtime-v2/desktop-ipc.ts`、`apps/desktop/src/global.d.ts`、preload 对应契约中透传。请求行保存归一化后的 USD 金额和来源；兼容 `costUsd` 只存 USD。
2. `costSummary` 定义 `costUsd`、`knownCostRequestCount`、`unknownCostRequestCount`、`unverifiedHistoricalRequestCount`；aggregates 为 provider/model/tool 分类完整匹配集。字段缺失表示旧协议，不等价于空结果。
3. 修改 `apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts`：先按 requestId（缺失时用 session/step 的稳定身份）归并 terminal usage，再过滤、聚合和分页。assistant/message 有 usage 时优先，缺失时使用 step/end；失败请求保留，重试的独立 request 不合并消失。工具活动单独统计，不进入未知模型成本分母。
4. 历史零值无可靠 provenance 时降级未知；已知缺陷版本显示对应原因，显式免费证据例外。外部 CNY 费用在请求投影边界转成 USD；升级时清空旧使用统计索引，不迁移或重算旧记录。
5. 使用现有 session revision / projection 缓存复用读入事实与聚合，分页只切结果；查询 key 包含 range、截止时间桶、search、status、scope。Journal revision 改变使对应统计失效，滚动时间窗不得永远复用过期边界。
6. 修改 `runtime-v2/fixed-renderer-ipc.ts`、renderer `WorkbenchLayout.tsx`、`UsageStatisticsPage.tsx` 的数据接线：移除 activity 失败时静默 catch-null 和混用旧分布；搜索在服务端全量过滤，翻页保留状态。此阶段只做必要的金额/错误状态显示，视觉重构留给 P04。
7. 修改 `apps/desktop/src/renderer/usage-format.ts` 使未知、零值、微小值、币种分别格式化；兼容其他消费者，不用通用 formatter 将所有非有限值强制显示为零。

## 验证

扩展 `apps/desktop/src/main/test/runtime-v2-fixed-renderer-projection.test.ts`：双终态去重、缺 assistant usage 的 step 兜底、多模型单 Run、重试、工具排除、旧异常零、真实免费、缺来源非零、部分未知、混合币种。增加 10,000 请求 fixture 验证分页前聚合与 revision 失效。

扩展 renderer `test/usage-statistics-page.test.tsx` 和 `test/fixtures/usageStatisticsFixture.ts`：完整筛选而非仅当前页，翻页保留 status，失败不伪装空状态，无新字段时明确兼容降级。

- `pnpm --filter @actspace/desktop exec vitest run src/main/test/runtime-v2-fixed-renderer-projection.test.ts src/renderer/test/usage-statistics-page.test.tsx`
- `pnpm --filter @actspace/runtime... build`，随后 `pnpm typecheck`。

## 完成与回退

- [x] 各分类金额与同一查询的请求明细求和一致，未知数只统计模型请求。
- [x] 分页不改变全量摘要，多个模型不被主模型错误归组。
- [x] 历史 Journal 字节未被改写，重建投影结果稳定。
- [x] 冷/热投影耗时与内存有记录，分页不重新读取全部 Journal。

回退 renderer 接线时保留新增字段和费用修复；投影缓存可失效重建，不删除会话数据。若旧协议无法表达新口径，显示可重试错误或兼容说明，不静默回到旧统计金额。

实施差异：来源读取缓存按宿主 durable 通知失效，活动行缓存按 Journal identity / revision 复用；每次查询重新应用滚动时间窗与筛选，避免时间缓存过期。内存记录为测试进程 heapUsed 单点采样，不是峰值。

[执行摘要](../../../exec-runs/20260906-actspace-usage-statistics/execution-summary.md)记录当前结果，原验证章节是计划范围，不代表每一条均已实测。
