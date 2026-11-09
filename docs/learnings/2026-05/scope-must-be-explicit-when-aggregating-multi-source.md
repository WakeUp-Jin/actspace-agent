# 聚合页的契约：scope 显式、分页只切明细、累计指标不靠采样集

合并自：多事实源聚合页 scope 必须是显式契约字段、Paginated Detail Views Preserve Aggregate Truth、运行时累计指标 ring buffer 不是账本。

关联：[`20260528-2000-usage-page-global-scope.md`](../../histories/2026-05/20260528-2000-usage-page-global-scope.md)、[`20260604-1954-usage-request-details.md`](../../histories/2026-06/20260604-1954-usage-request-details.md)、[`20260528-1735-kairos-usage-accumulator-persistent.md`](../../histories/2026-05/20260528-1735-kairos-usage-accumulator-persistent.md)

> 历史说明：文中 `usage-statistics:get`、`createUsageStatisticsSnapshot`、`aggregateKairosUsage`、`usage-accumulator.json` 来自 v1 的 Kairos 与旧 Usage IPC，当前代码已不存在；当前使用统计的入口见 `packages/client/client/src/sessions/indexed-usage.ts` 与 [派生读模型](../2026-10/20261011-derived-read-model-worker.md)。下列契约原则仍然适用。

三条规则回答同一个问题：**页面上的数字到底统计了哪些事实**。

## 1. scope 是契约里的显式字段，不是参数缺省

“看似汇总全部”的页面（usage、billing、activity feed、全局 dashboard）若数据来自多个事实源（不同 session、agent、租户、数据库），取数范围必须显式。旧实现：`sessionId` 必填 + `range="total"`，用户按“总计”看到的其实是当前那条 session 的全部事件——切换对话数字就变，用户的心智是“账户总账单”，代码层面没人写错，是 UI 词汇与实现语义错位；Kairos 事件还没进账本。

反面：`{ sessionId?: string }`，“不传 = 全部”——类型看不出含义，调用方误传 null 会沉默切换取数路径。正面：

```ts
type UsageScope = "session" | "global";
type GetUsageInput  = { scope?: UsageScope; sessionId?: string /* 仅 session 必填 */; range?: Range };
type UsageSnapshot  = { scope: UsageScope; sessionId: string | null; title: string; sourceCount: number /* 参与聚合的事实源数 */ };
```

- scope 与时间窗 range 正交（day/week/month/total 是时间切片，session/global 是来源切片）。
- 入参、出参都带 scope：renderer 拿到 snapshot 就能决定标题、来源数提示、钻取按钮，不依赖自己上次的 input；`sourceCount` 给“数据可信度”提示。
- 缺省值指向“信息更全的一档”（global），兼容逻辑只放在 handler 入口。
- 事件级合流优于 snapshot 级合流：N 个来源先摊平原始事件再算占比/命中率/成本舍入，不要先算 N 个小 snapshot 再合并（重复舍入、语义模糊）。
- 单个事实源读失败（某 session 文件损坏）不炸整张账单：`try/catch return null` + `.filter(Boolean)`。
- 修契约的同一个 PR 必须刷新所有 fixture/mock（`as` 强转会让缺字段在运行时变成 `undefined` 被当 `"session"`）。时间窗语义也要写死并测试：本仓库 day/week/month 是“往回数 N 天”，与 controller 的“日历今天”刻意分开。

## 2. 分页只作用于明细，不改变聚合依据

页面常同时有聚合卡片与分页明细表。`page=2` 若在聚合前应用，总计、模型分布、缓存命中、每日行会悄悄变成“第 2 页总计”。查询仍扫描整个时间窗，用全部匹配事实算总计和分布，再只切片表格行：

```ts
const rows = buildRequestRows(requestRows).sort(newestFirst);
const summary = buildSummary(allEvents), dailyRows = buildDailyRows(allEvents);
const pageInfo = normalizePage(input.page, rows.length);
return { summary, dailyRows, requestRows: rows.slice(start, start + pageInfo.pageSize), requestRowsPage: pageInfo };
```

别用 `requestRows.length` 推总页数（那只是当前页长度）；页大小固定，除非产品要求可选；总行数已知后再 clamp 非法页，空数据集返回稳定的 `page=1,totalPages=1`。检查：翻页时主 token 总数不应变化；响应同时有当前行与总行数。

## 3. 累计指标不能依赖采样集（ring buffer 不是账本）

第一版用量胶囊在 renderer 对 ring buffer（默认 200 条）实时 `aggregate(events)`：跑几小时后老事件滚出去，数字越跑越小；进程重启 buffer 清零而 jsonl 里事件还在，胶囊归零。本质：ring buffer 为“最近事件浏览”设计，丢弃策略与累计指标的留存策略不重合。

| 数据类型 | 寿命 | 存储 |
|---|---|---|
| 样本流 | 短期，容量滚动 | ring buffer/缓存/最近 N 条 |
| 累计指标 | 长期，显式 reset 或时间窗切换 | 独立 accumulator + 持久化 |

两者不共用数据源。累加器骨架：内存累加 + debounce(~300ms) atomic rename 写小 JSON（带 `schemaVersion`）；启动先读文件，缺失/损坏再扫最近事件流重建（`load()` 只读引导，不立刻落盘）；`reset()` 先等 pendingWrite 再 unlink，避免迟到的写把快照写回；账本进运行时状态机、累加后同步 emit state，UI 直接展示不自己聚合；字段命名表达 reset 边界（`*Today`），需要生命周期总量就新增 `usageLifetime`，不改 today 语义；币种“是否混合”这类跨调用状态外推到 observer，累加函数保持无副作用；兜底扫盘用 UTC 键、展示用本地时间，两条线分别明示。

注意区别：Usage 页的事实账永远基于 jsonl（可重建的全量事实）重算；增量累加器只服务“自上次 reset 起”的运行时胶囊，用它做账本会复刻 ring buffer 问题。

## 自检

1. 新页面“全部 X”的来源有几个、是否各有独立存储，入参有没有字段说明要哪一档？
2. 从路径 A 进入再从 B 回来，数字会无声变化吗（scope 漏维度）？
3. 点“下一页”主总量会变吗？
4. UI 数字会因采样集滚动而变小吗？崩溃重启 5 秒后累计与之前差多少？reset 后所有 `*Today` 都清空了吗？
