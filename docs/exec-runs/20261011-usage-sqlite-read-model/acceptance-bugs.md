# SQLite 查询验收问题清单

当前模式：用户最终要求暂停验收与修复，等待其他任务完成后按[统一验收计划](../../exec-plans/active/20261011-usage-sqlite-acceptance.md)处理。用户在真实界面验收期间明确要求停止修复；该要求之后不修改业务实现、测试实现或构建脚本。源文件基线见本地 `artifacts/usage-read-model/acceptance-only-source-baseline.json`，HEAD 为 `c15c26b34d89fc8752c97d61773e38e87c853c63`，验收的是其上未提交工作树。报告及测试生成的临时数据可以更新。

本清单区分当前失败、待复验和历史版本已修复问题；不能把历史失败自动解释成最新版本仍有同一缺陷，也不能用单测通过自动关闭真实界面失败。

## 当前问题与验收缺口

| ID | 状态 | 触发与影响 | 证据 / 复现 |
| --- | --- | --- | --- |
| U-01 | 性能失败，待统一修复 | M 数据集追加1,000/5,000条活动后再查询，同步查询p95为368.72/970.99ms，超过计划250ms；每条活动有7个Journal事件。Main仍响应，不等同窗口冻结。 | `artifacts/usage-read-model/m-existing-incremental-latest.json`，20次每种追加，只读取7k/35k新增事件；版本边界见执行摘要。 |
| U-02 | 最新版真实CU待复验 | S 579k活动，进入使用统计并切全部范围，重建后报Worker超时及5,000事件fallback超限；历史加载更多和搜索随后报同一类错误。用户只验收指示前已拆分大删除并调整Worker退出等待，58回归通过；真实结果尚未签收。 | 本地日志 `/tmp/usage-cu-resumed-s.log`；[Electron报告](electron-acceptance.md)首轮CU；本地截图 `cu-evidence/s-worker-timeout-error.jpg`、`s-history-fallback-limit-error.jpg`（不随仓库分发）。 |
| U-03 | 源码确认的规模缺口，实机覆盖待补 | 每次启动workspace admission仍逐批遍历所有非worktree Journal以读取workspace-set。批读在Worker保护Main调度，但首次窗口/Runtime就绪要等待全扫描，启动成本仍随历史数据量增长。 | `apps/desktop/src/main/runtime-v2/session-workspace-facts.ts` 与 runtime-registry boot；S/M/L实际启动时间须单独记录，不能用热查询时间代替。 |
| U-04 | Service受控Provider复现，真实Agent未覆盖 | durableSeq不变、物理文件stamp变化时Service重置整个Session；未flush尾部追加可能触发重复重建。不能仅忽略stamp，否则破坏替换检测。 | `acceptance-same-revision-stamp.json`：真实Service+SQLite Worker、受控Provider256事件；不变查询读0，同revision仅stamp变读256全量。没有真实Agent/物理Journal未flush尾部复现，边界明确。 |
| U-05 | 长SQL限制，最新恢复待复验 | L实验库首次补建全库model/provider索引超过60秒无进展超时；旧Worker原生调用尚未退出造成恢复锁竞争。用户只验收指示前已等待退出且超时保留库。单条原生索引创建仍可能超时需重试。 | `/tmp/usage-l-latest-hot.log`失败；`l-journal-latest-hot.json`重试成功且读取0事件。该组是Node全链路，不是L CU。 |
| U-06 | 复杂筛选首次查询慢，未关闭 | M部分标题筛选102k活动首次约2185ms；之后稳定热查询p95约16.9ms。首次筛选成本不能被缓存命中结果隐藏。 | `electron-m-fresh-stat-runtime.json`，真实preload/IPC，非CU。 |
| U-07 | 仓库文档检查失败，已有问题 | check:docs本轮确认307条既有历史媒体链接错误，本任务路径0条；不修复用户未要求的历史文档。 | `/tmp/usage-acceptance-only-docs.log`；本任务新增路径单独核对。 |

## 新增问题（只记录，未修复）

### U-08 偏移时区事件绕过Usage重置边界

- 严重度：P2，统计正确性。
- 复现：resetAt=`2026-10-11T00:00:00.000Z`，事件时间=`2026-10-11T03:00:00+08:00`（实际UTC为前一天19:00，早于reset）。对global/total查询应0条，实际返回1条，最终row.startedAt已为UTC前一天19:00。
- 原因范围：Worker同步先用原始字符串比较resetAt，之后insertUsageActivities才规范化UTC。fallback也在写入前按字符串过滤。代码位置usage-read-model-worker.ts:159、usage-session-fallback.ts:50。
- 证据：`artifacts/usage-read-model/acceptance-reset-offset.json`，实际Service+SQLite Worker、受控Provider，未运行真实Agent，未读用户数据。fallback同形源码确认，本轮没有另外动态注入fallback。
- 验收影响：重置边界正确性失败；其他UTC格式的常规路径继续验收。没有修改实现或添加测试代码。

### U-09 冷重建导航离页后大Session进度全部回滚

- 严重度：P2，加载体验与重复计算成本；不是事实数据丢失。
- 真实CU：S正在同步0/100、约1,896,448事件，切到外观设置再返回Usage（未点击取消、未重启）时日志出现query cancelled；返回后当前会话同步读取数为0，从起点继续。
- Session事务回滚保证一致性，但一个巨型Session尚未提交时，任何页面卸载取消会丢弃该Session已做的索引工作，反复导航可使结果长期不可用。
- 证据与更多复现细节由[Electron报告](electron-acceptance.md)记录；当前保持页面等待以完成独立结果态检查，不修复此行为。

### U-10 历史会话混合时区的排序不按真实时间

- 严重度：P2，历史排序/分页正确性。
- 受控目录输入：older-offset updatedAt=`2026-10-11T03:00:00+08:00`（UTC前一天19点），newer-utc=`2026-10-11T00:00:00.000Z`。实际Worker分组历史返回older-offset在前，期望newer-utc在前。
- 证据：`artifacts/usage-read-model/acceptance-history-offset.json`，真实SQLite Worker、受控catalog summary；非真实Agent或CU。目录写入保存原始updated_at，SQL/JS排序比较原始文本；projectQueryCatalog也将event.time原样赋给updated_at。
- 当前生成器用UTC，不能用这些fixture的常规排序通过证明所有合法RFC3339 offset排序正确。错误会影响排序和基于updated_at的翻页边界；本轮只动态复现默认分组顺序，跨页受影响是源码推断。

## 性能观察的解释边界

- L最新稳定Node全链路复测 `l-journal-latest-stable.json`：page/FTS/cursor p95为57.68/61.08/55.48ms，读取0事件；Main heap90.54MiB、RSS240.42MiB，loop p95/p99/max11.13/13.53/18.63ms。此前同最新版本、与S重建并发的一组cursor p95为139.72ms，原样保留；不能删除慢组改写为全场景通过。
- XL10m测试是合成SQLite活动写入/查询，Main/Worker堆有界，不覆盖10m真实Journal或Renderer。
- 主进程interval max采样、Node event-loop histogram、实际UI观察是三类证据，分别报告。
- 未覆盖项持续列在Electron报告及最终验收矩阵中；阻断一个场景仍继续其他可执行验收。


## 磁盘成本快照（性能观察，非新增失败门槛）

本地 `artifacts/usage-read-model/acceptance-storage-snapshot.json` 记录文件stat之和，未读取或改写Journal内容。

| 数据集 | 当前活动数 | Journal大小 | SQLite主文件大小 |
| --- | ---: | ---: | ---: |
| S | 579,000 | 1.70GiB | 2.84GiB |
| M | 1,221,000 | 3.51GiB | 5.48GiB |
| L | 5,101,000 | 14.60GiB | 23.26GiB |

SQLite保存普通索引、FTS、rollup、run关联与精简投影状态，不能将其磁盘成本描述为一个很小的查询缓存。没有事先约定磁盘通过线，因此这是需用户权衡的实测成本，不擅自新增失败门槛。快照时S可能有正在执行的重建；WAL、未使用页面和文件分配量未做稳定状态归因。


## 暂停前复现补充

U-08、U-10已各在普通索引和fallback动态复现，共4个回归用例全部失败（本地`/tmp/usage-offset-red.log`）。U-08正偏移早于reset的事件被误保留，负偏移晚于reset的事件被误排除；U-10普通与fallback都将older-offset排在newer-utc之前。四个用例位于`apps/desktop/scripts/test-usage-read-model.mjs`，暂停后以Bug ID标记TODO，不代表修复或通过。原“fallback仅源码确认”是早期证据边界，此补充提供后续动态复现。业务修复尚未开始。

U-09已定位WorkbenchLayout的view/settingsSection effect会在离开Usage时调用cancel，另有cleanup取消；取消通过终止Worker回滚当前事务。定位不等同修复，后续需验证显式取消、页面切换、筛选覆盖及窗口关闭的完整生命周期。
