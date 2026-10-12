# SQLite 查询验收问题清单

当前状态：已获用户授权恢复联合实现与验收；2026-10-12接受U-01批量追加和U-06首次复杂标题统计耗时限制。最新结果见本文后续更新及[联合验收](../20261011-context-sqlite-integration/acceptance-results.md)，以下初轮失败保留追溯，不代表当前全部仍失败。

历史暂停记录：当时用户要求暂停验收与修复，等待其他任务完成后按[统一验收计划](../../exec-plans/completed/20261011-usage-sqlite-acceptance.md)处理。用户在真实界面验收期间明确要求停止修复；该要求之后不修改业务实现、测试实现或构建脚本。源文件基线见本地 `artifacts/usage-read-model/acceptance-only-source-baseline.json`，HEAD 为 `c15c26b34d89fc8752c97d61773e38e87c853c63`，验收的是其上未提交工作树。报告及测试生成的临时数据可以更新。

本清单区分当前失败、待复验和历史版本已修复问题；不能把历史失败自动解释成最新版本仍有同一缺陷，也不能用单测通过自动关闭真实界面失败。

2026-10-11 承接更新：代码已整合到 `fix/context_manager_v1`；[联合计划](../../exec-plans/completed/20261011-context-sqlite-integration/README.md)统一安排后续实施与验收。当前只落文档，以下 Bug 状态和历史证据不因此改变；本清单继续作为 U-01–U-10 唯一状态登记处。

## 初轮问题与验收缺口

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

## 联合计划文档轮核对（2026-10-11）

当前 `fix/context_manager_v1` 的 `pnpm check:docs` 报 2 条既有媒体链接缺失，均在本目录 `electron-acceptance.md:264`：`cu-evidence/s-final-light-sync.jpg` 和 `cu-evidence/s-final-light-narrow-sync.jpg`。本次联合设计/计划新增链接均可解析。旧记录的 307 条是当时环境结果，不当作当前数量；U-07 仍未关闭。本轮未恢复业务测试或 Computer Use。

## 联合实施轮更新（2026-10-11）

用户已批准恢复联合实现及修复；开头的暂停约束仅描述上一轮时间点。当前分支 `fix/context_manager_v1`，证据目录 `artifacts/context-sqlite/`。以下为当前状态，保留以上全部历史证据。

| ID | 当前状态 | 新证据与尚缺部分 |
| --- | --- | --- |
| U-01 | **仍失败** | 只读新增 7k/35k 事件正确，但 S 最终页缓存配置追加 1k/5k p95 约 525/7144ms；M 批量优化前 2035/15086ms。并发负载下实测，不能因负载解释而改为通过。 |
| U-02 | 实现已调整，规模 CU 未签收 | 批次 cursor 持久化、取消等待者独立、一次恢复及 bounded fallback 回归通过；小 Electron 查询可用，原巨型场景仍需复验。 |
| U-03 | 实现及小规模启动已验证，M/L 待验 | 已注册 workspace 优先，历史发现后台有界；真实小 Electron data-ready→runtime-ready 669ms、renderer loaded 2387ms（进程起点计）。大规模启动与权限矩阵未全部签收。 |
| U-04 | Provider/Runtime 回归通过，真实未 flush CU 未覆盖 | append-only writer epoch + durable clamp 保留替换检测；Provider 13 项和 Runtime 定向 3 项通过。不能声称任意中部覆盖伴尾部追加均可检测。 |
| U-05 | 实现已调整，规模最终恢复待验 | schema 9 空表建索引并按需重放，移除旧巨表隐式补建；等待 Worker 真退出，超时不删库。最终 L 冷任务仍运行。 |
| U-06 | **仍未关闭** | 已限定索引候选集并缓存聚合；S 首次标题约4549ms，热 p95约5.59ms，首查成本仍高。 |
| U-07 | 当前文档检查通过 | 两个已丢失本地截图改为明确的缺失证据说明，未伪造/恢复截图；`t10-docs.log` 通过。 |
| U-08 | 原失败回归修复通过 | indexed/fallback 在 reset 比较前规范化 UTC，四条原失败断言连同 U-10 去 TODO 后通过；旧 schema 升级回归覆盖。 |
| U-09 | 生命周期实现与回归通过，完整规模 CU 待验 | 已提交批次 cursor 保留、published/building 分代、离页释放等待者；需完成大数据离页/取消/退出/重开路线后才能关闭。 |
| U-10 | 原失败回归修复通过 | catalog UTC 规范化和同时间稳定 cursor；indexed/fallback 原断言及 offset 边界/分页回归通过。 |

新 Context 问题见 [联合 Bug 清单](../20261011-context-sqlite-integration/acceptance-bugs.md)。最终签收以联合矩阵为准。

### 2026-10-12 继续复验

- U-02/U-05仍未关闭：C-09解决building rowid分批复制的重复全扫描；M巨型Session已经发布342000活动/2394000seq，但实际CU随后仍收到Worker超时。派生库保留、原进度可查询，当前通过正常重试继续；未确定超时具体发生在提交checkpoint还是后续操作。
- U-03/M响应有定向改善：General快捷键组件的全量Session恢复已替换为按需搜索（C-08）。M Main p95/p99约12.75/14.17ms，无legacy list IPC，启动max433ms保留；不代签完整M/L路线。
- L原冷任务在2614/5000时停止以加载C-09，保留已提交进度续跑。原冷时间、续跑时间分别记录，不把续跑当新版本完整冷重建。

### C12独立负载复核

M/L大写入停止后，S实际585k→705k，各20次追加1k/5k p95为358.12/1753.86ms；U-01仍失败。只读取新增7k/35k事件正确。首次标题7423ms、热10.43ms；SQL定位显示首次临时聚合约8717ms，U-06仍未关闭。证据和新结构待审建议见[性能复核](../20261011-context-sqlite-integration/performance-review.md)，未降低原门槛。

L已保存3066/5000会话进度，M583后以C12恢复并达到605以上；不能将分次恢复时间称作最终构建的完整冷重建。U-02/U-05/U-09最终规模结果仍未签收。

## 2026-10-12 用户接受性能限制并继续验收

本节为U-01/U-06最新状态，前文历史失败保留。U-01一次追加1k/5k的250ms目标未达，但用户同意作为非日常压力场景接受现有限制，不再单独阻断；只读新增事实仍须正确。U-06首次复杂标题查询慢已告知，用户拒绝用高频写入预统计换低频查询提速，本次不进一步优化。两项均是**接受限制，不是性能达标**。

用户同时同意暂不做大Session发布重构，U-02/U-05/U-09的正常交互、超时和恢复问题不因此豁免。继续以大量历史下正常消息/工具/会话切换/统计取消恢复的实机结果判断；热查询与资源有界门槛保持。

### 日常验收与M最终恢复（2026-10-12）

M经取消、离页、退出重开后1613会话最终全部发布，0building。CU最终1,341,009请求、4工具、174,331,080tokens与生成器/真实Journal/只读SQL核对一致，各Tab/跨页/筛选/24h→全部/刷新通过；U-02/U-09的M恢复路线通过，原超时证据保留，L最终结果仍待验。U-03 M首窗口约1.55秒，L约1.24秒，Runtime就绪不再等待全历史扫描；分别记录启动单次loop max349/377ms，不能替代持续响应分布。L日常普通回复和工具/Context已通过，首次目录重建继续观察，尚不能签完整L验收。

### 2026-10-12 晚间U-04真实持久化边界复验

U-04已补真实Agent + JSONL writer + Electron查询 + gpt-6.1-sol CU：assistant批次字节写入后、fsync前保持闸门，descriptor查询等待而Usage仍为1680；释放后仅增加本次120至1800，无未持久化尾部提前计入或重复累计。另有JSONL14项含fsync回归、Runtime定向回归。证据见联合目录`acceptance-results.md`及`computer-use.md`，本地`artifacts/context-sqlite/small-durable-{before,held,after}.json`。该边界已通过，不扩展为任意中部覆盖与尾部追加组合都能检测。

## 2026-10-12 最终范围调整

用户明确取消510万条L最终整库与完成后界面验收。U-02/U-05/U-09及C-09保留M最终恢复/数字核对通过、L取消/重开/日常交互通过；L最终结果未验证，不作为本轮门槛，不将其改写成通过。U-01/U-06及发布结构优化继续按此前用户接受限制处理。联合实现计划完成归档；默认并行测试失败和Main约1.51MiB的未定性内存观察详见联合执行摘要，不以L取消掩盖独立问题。
