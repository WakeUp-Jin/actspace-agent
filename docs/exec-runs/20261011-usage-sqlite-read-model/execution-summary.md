# 使用统计 SQLite 读模型与 Worker 执行摘要

状态：实现收口，验收与修复按用户要求暂停；已知缺陷和性能门禁未关闭。后续见[统一验收计划](../../exec-plans/completed/20261011-usage-sqlite-acceptance.md)。
日期：2026-10-11
计划：[20261011-usage-sqlite-read-model](../../exec-plans/completed/20261011-usage-sqlite-read-model.md)

## 当前实现

- Session Journal 仍是唯一事实源；Agent Loop、恢复和轨迹详情保持原路径。
- Main 通过 Runtime/App/Storage 的 `readEventBatch` 可选能力读取事件，不再在 Usage 主查询中读取完整 JSON usage cache 或调用完整 Session inspection。
- JSONL Provider 懒启动独立读取 Worker，校验 Header、envelope、连续 seq 和不透明 cursor；每批最多 256 事件，字节目标 256 KiB，单记录遵守既有 1 MiB 上限。文件身份、截断或已读边界变化使 cursor 失效；这是 append-only 协议下的边界校验，不是每次全文件 checksum。
- SQLite Worker 保存精简 step/call 关联事件和 turn/run 映射，复用既有 Usage projection；不保存完整 request context、对话正文、工具参数或结果。单关联组最多 10,000 条精简事件或 8 MiB，超限显式失败。
- 单 Session 的行、FTS、关联状态、cursor、indexed revision 同一事务提交；跨批失败回滚。重启后从 SQLite 水位恢复，无变化不读事件。
- 当前 schema 8 保存 activity FTS、标题和 512 字符消息片段 FTS，以及小时/日/全量汇总和精确 run 去重计数；重命名与 workspace 更新会刷新派生 metadata；sourceWatermarks 读取已提交 indexed revision，不能用 catalog revision 冒充。
- `sessions.listPage` 已接入 catalog SQL 分组分页和本机标题/片段搜索；侧栏新增独立搜索入口，每页 50 条，翻页替换结果，详情继续回 Session。远端列表不混入本地搜索。
- Query Source 描述符由 Provider Worker 有界读取 Header/尾部，缓存按物理 stamp 失效；Runtime 对打开的 Session 以 `durableSeq` 限定水位，并解析已知 codec 后提供增量。查询不再经过 `ensureGlobalIndex` 冷重放。未打开的文件以完整前缀为可见范围，不保证外部进程尚未完成的 fsync。
- 独立 SQLite owner lease 防止第二 Worker 删除活动索引；退出/崩溃后 OS 自动释放。进度、取消、8 请求队列上限和 60 秒无进展 Worker 超时已接入；SQL 执行中取消会终止查询 Worker。
- 响应超过 1 MiB 显式拒绝；聚合结果使用有界迭代。每次请求明细最多 500 行。多 workspace 首页明细合计也最多 500 条，未加载分组保留入口。
- 索引重建再次失败时，小数据走 Worker 内 Session fallback；总事件超过 5,000 或精简状态超过 8 MiB 时拒绝，而不是在 Main 全量扫描。页面显示 fallback 状态，旧 JSON cache 文件保留但不参与主查询。

## 当前轮验证

| 检查 | 结果 | 边界 |
| --- | --- | --- |
| SQLite Worker/Service 测试 | 58 项通过（含源故障恢复、共享页面预算、原生 Worker 退出等待、分批删除中断回滚） | 游标同值、分片、事务回滚、prune、坏库/schema/application id、真实 Journal 增量与重启、fallback、标题变更和水位 |
| JSONL Provider 测试 | 12 项通过，其中查询读取新增 7 项 | 有界读、追加、外部 cursor、截断、序号断裂、关闭 |
| Runtime projection | 15 项通过 | 原有投影和 durable 通知回归 |
| Runtime storage-neutral | 2 项通过 | 独立内存后端列表、分页、导出、fork、恢复、关闭不依赖查询 Worker |
| 原 Usage cache / projection | 23 项通过 | 原口径回归；不代表大规模链路验收 |
| Desktop typecheck / Electron build | 通过 | 本地构建，不等同最终打包应用验收 |
| IPC / build graph / frontend tokens / theme | 通过 | 静态契约检查 |

## 最新性能记录

以下都是 **Worker 合成行基准**，不覆盖真实 Provider → Main → Renderer 全链路；schema 6 的全量/日汇总已复测；schema 7 进一步把重复维度文本从逐行 FTS 改为去重索引，正在跑 L。结果保存在 `artifacts/usage-read-model/`，不是最终验收通过声明。

| 1,000,000 行 / 1,000 Sessions | 初始小时汇总 `m-worker.json` | 顺序分页索引 `m-ordered-page.json` |
| --- | ---: | ---: |
| 冷导入 | 131,198 ms | 158,213 ms |
| activity p95 | 61.18 ms | 70.45 ms |
| FTS p50 / p95 | 3,584 / 3,785 ms | 66.64 / 167.29 ms |
| status p95 | 38.66 ms | 48.14 ms |
| cursor p95 | 56.38 ms | 60.53 ms |
| statistics p50 / p95 | 4,939 / 5,061 ms | 197.88 / 459.56 ms |
| 追加 1,000 / 100,000 行 | 204 / 15,002 ms | 247 / 17,210 ms |
| Main event-loop p95 / p99 / max | 12.05 / 12.55 / 20.89 ms | 12.05 / 12.35 / 13.84 ms |
| Main heap / Worker heap / 进程 RSS 采样峰值 | 30.81 / 23.45 / 182.42 MiB | 32.08 / 27.21 / 185.91 MiB |
| 最大响应 / 明细行数 | 110,606 bytes / 100 | 110,606 bytes / 100 |

顺序分页复测 10 次，首次查询也计入 p95。搜索和 statistics 的 p95 尚未达 100 ms 目标。RSS 是整个 Node 进程，不是单 Worker RSS。初始版本只监测冷导入 event-loop；顺序分页版本把热查询和追加也纳入监测，因此表中两个 event-loop 窗口不同。

现有单测证明真实 Journal 增量/重启不会全量重新读事件，但不代表百万行真实目录的性能；对应全链路验收仍未完成。

### 全量/日汇总后的 M Worker 结果

`m-total-rollups.json`：1,000,000 行 / 1,000 Sessions / 20 次重复；冷导入 182,446 ms，activity / FTS / status / cursor / statistics p95 分别为 **2.54 / 20.65 / 2.45 / 2.34 / 5.69 ms**。追加 1,000 行 204 ms、100,000 行 19,610 ms。Main event-loop p95 12.04 ms、p99 12.34 ms、max 15.02 ms。Main heap / Worker heap / RSS 采样峰值 37.61 / 22.92 / 198.22 MiB；最大响应 110,608 bytes / 100 行。

该组 Worker 热查询达到初始目标，不能替代真实 Journal/Electron 通过声明。测试同时揭示冷同步的写放大，因此继续使用惰性索引，未把写入接到 Agent Loop。

新建 `benchmark-usage-journal.mjs`，覆盖真实 JSONL Provider → Runtime codec → Main Service → Worker，并断言热查询事件读取为零、追加只读取新增事件。1,000 行 smoke 的追加 1,000 行约 463 ms，尚未达增量目标；它与 Worker 直接插入行的 204 ms 是不同链路。

`verify-usage-read-model.mjs --dataset S/M/L/XL` 现在实际运行对应规模，S/M 额外执行旧 JSON 基线和 Journal 全链路。无 dataset 参数保留轻量 smoke；不能把无参数输出当大数据结果。

## 必须继续完成

- XL长跑与L新statistics基数优化复测；L旧版完整结果已记录，性能失败项仍须复验。
- 历史 FTS 端到端验收、极多 workspace 分组的全局行数限制。
- Provider/Main/Worker 的完整大数据链路基准；验证新 Query Source 入口的冷热目录耗时与 Main 内存。
- S/M JSON基线已完成；M/L真实Journal、XL长跑和最新实现的性能失败项仍须复验。
- 真实 Electron M/L Computer Use、浅深主题和窄窗状态提示、开发及打包路径探针。
- 最终文档、history 和验收矩阵收口。`check:docs` 上次报告 307 个既有历史图片链接错误，仍需最终区分本次新增问题。


### JSON 对照与 S 真实 Journal 全链路

| 指标 | S JSON 100k | M JSON 1m | S Journal + Worker 100k |
| --- | ---: | ---: | ---: |
| 全量解析 / 冷构建 | 142.5 ms | 2,685.8 ms | 76,239.4 ms |
| 翻页 p95 | 207.3 ms | 1,993.4 ms | 5.32 ms |
| 搜索 p95 | 119.7 ms | 880.7 ms | 5.83 ms |
| Main heap 采样峰值 | 145.6 MiB | 1,357.8 MiB | 60.8 MiB |
| 进程 RSS 采样峰值 | 192.6 MiB | 1,138.6 MiB | 332.1 MiB |
| Main loop p95 / p99 / max | 216.1 / 293.9 / 293.9 ms | 2453.7 / 2659.2 / 4844.4 ms | 12.04 / 12.56 / 52.23 ms |

JSON 只含旧派生行全量解析和既有查询函数；Journal 列包含原始7事件/请求的首次投影与索引写入，冷耗时不能直接作相同工作的速度比。JS heap/RSS 使用不同采样时点，不应互相当包含关系。共享开发机器存在并发基准/构建负载。

S Journal 热查询事件读取为0；追加1k/100k行分别读7k/700k事件，耗时838.6/111828.1 ms。该数据没有通过250ms增量目标，继续优化和复测。

历史catalog与Usage水位已拆开；history-only不构建activity/rollup。真实Electron已发现并修复provider服务转发缺失；旧workspace admission全量重放正在复测有界事实读取修复。CU因Mac锁屏暂未覆盖，详见[electron-acceptance](electron-acceptance.md)。

### 14:48 集成复查

- Electron 生产依赖部署探针：39.8.10 / Node 22.22.1 / SQLite 3.51.2，Provider Worker、SQLite Worker、FTS5 均通过。命令为 `verify-usage-package.mjs --app-root=<pnpm production deploy> --electron=<Electron executable>`；验证生产依赖布局，不等同签名、DMG 或真实 UI 验收。
- 修复子智能体恢复的无关 Session 全量扫描，12 项 provider/lifecycle 回归通过。
- 侧栏原本对所有可见历史会话调用任务 snapshot，触发完整恢复。schema 8 增加只含身份/状态的 pending task 提示，关闭的已完成历史不再为了徽标被恢复。Worker 33 项、队列及 IPC 预算 24 项通过。
- Desktop 全量首轮：1,704 通过、2 超时、2 跳过；两个超时所在文件单独串行复跑全部通过（含本轮新增共24项）。全量运行与大数据压测并发，不能掩盖首次超时记录。
- Provider 11、Runtime durable/storage-neutral/provider转发 8、workspace admission及browser reconfigure 10通过。静态 token/theme/renderer bridge通过。
- `check:docs` 和 `check:current-docs` 均仍报307条已有历史图片链接错误，本次任务路径0条。
- 正在进行的L/XL和真实Journal基准使用schema7；schema8只增加catalog任务提示，不改变Usage行/汇总计算。最终报告须保留版本差异，不能声称这些长跑已覆盖新任务提示或真实UI。

### 15:01 真实搜索瓶颈修正

新增回归后Worker/Service **33/33**、IPC guard **29/29** 通过。模型/服务商精确过滤支持与时间、status、FTS组合，旧statistics的整段汇总语义保持一致。Session删除同时清理两套水位、cursor和stamp。

真实Electron发现标题搜索重复扫描全部宽行，原`benchmark`搜索201k命中耗时15.3–19.8s。修正为全标题命中走global rollup、部分命中一次SQL TEMP聚合；TEMP只保留最近一项，SQLite连接写入计数变化即失效。再次实测：

- 全标题匹配201k：稳定20次p50/p95/p99 = **7.1/8.3/17.8ms**。初次启动复测的1327/657/112ms也保留在CU报告，不能只截取稳定值。
- 部分标题匹配102k：首次**2293.9ms**，20次包含首个的p50/p95/p99 = **20.4/462.5/2293.9ms**，仍未达到整组p95门禁；第三次97.4ms，之后15.3–35.5ms。
- 部分标题匹配1k：首次52.4ms，p50/p95/p99 = **12.5/30/52.4ms**。
- 大→小→全部标题切换的totalRows/token totals正确；没有把上一查询的聚合错误复用。该结果仍是实际preload/IPC证据，不是Computer Use。

缓存实验未采用：100k/1000 Sessions默认与32MiB页缓存冷导入98.09s/96.13s、追加1k1120/1194ms，RSS104.75/141.78MiB。默认缓存已足够接近，固定增大内存没有相称收益。SQLite缓存语义参考[官方PRAGMA文档](https://www.sqlite.org/pragma.html#pragma_cache_size)。

部分标题大组稳定缓存命中另行20次：准备查询1991.9ms单列，随后p50/p95/p99 **7.7/8.8/9.3ms**。这验证了分页复用效果，不能替换首次筛选2s或原20次含首个的失败结果。证据见`electron-s-partial-stable-20.json`。

### L 500万行合成长跑完成

`artifacts/usage-read-model/l-dimension-fts.json`：schema7 / 5,000 Sessions / 20次重复，后台与其他基准共享设备。冷导入2,808,892ms（46.8分钟）；CPU user311,336ms/system1,815,597ms，系统调用/磁盘开销突出。activity/FTS/status/cursor p95 **18.01/16.01/17.95/18.03ms**，旧statistics p95 **579.00ms**（未达100ms）。追加1k/100k **811.3/86382.5ms**（1k未达250ms）。Main loop p95/p99/max **12.08/12.62/114.29ms**；单次max超过100ms，不能据p95宣称全程无峰值。

Main heap / Worker heap / RSS采样峰值 **30.60/24.04/132.42MiB**；结果最多100条明细、348027bytes。有界内存与明细热查询达标；冷导入写放大、旧statistics和增量延迟仍是独立问题。这组长跑早于schema8和最终标题缓存/精确过滤，不声称覆盖那些新增行为。

旧statistics基数修正的定向S探针：复制已关闭的S schema8派生库（201k行）到独立临时目录，当前Worker首次辅助表原子回填+查询1004.4ms；随后20次total statistics p50/p95/p99 **0.93/1.29/1.37ms**。同副本旧`COUNT DISTINCT`单条查询102.2ms，精确计数同为201000。Worker heap采样9.0MiB，V8 heap上限4144MiB（运行时默认上限，不是承诺使用量）；该限制现可由diagnostics观测。结果`s-cardinality-query.json`不替代最终L复测。

### M 100万行真实Journal完成

`m-journal.json`：1000 Sessions、1,000,000 activities、冷读取7,001,000 events。生成19.83s，冷构建2,675,932ms（44.6分钟）；20次page/FTS/cursor p95 **69.79/83.27/72.11ms**，p99 **104.98/260.86/74.28ms**。热查询事件读取严格为0。

追加1k/100k行只读7k/700k新事件，耗时 **860.25/77329.27ms**；1k仍未达到250ms。Main heap峰 **59.05MiB**、进程RSS峰 **258.59MiB**；重复查询heap样本39–54MiB间波动，未呈单调线性增长。Main loop p50/p95/p99/max **10.84/12.08/12.62/91.68ms**。

该组是旧schema7全链路（Provider→Runtime→Main→SQL Worker），不是Renderer证据；最终目录含1,101,000行、1000 Sessions，交给真实Electron以最新schema8产品路径复测。旧索引由产品自动重建，没有人为改版本跳过门禁。L真实Journal与XL合成长跑继续运行。

### 15:26 临时存储策略与当前长跑版本

最新Worker/Service **36/36**，包含temp切换缓存失效与dirty-group超限原子回滚。S真实Journal最终策略复测 `s-journal-temp-policy.json`：冷77.06s，page/FTS/cursor p95 **7.22/11.02/7.30ms**；追加1k **414.88ms**（仍未达250ms）、100k **34.49s**，严格只读7k/700k新事件，无变化读0。Main heap/RSS采样峰 **58.43/290.05MiB**，Main loop p95/p99/max **12.04/12.30/49.61ms**。只证明追加改善，不能宣称冷重建已提速。

为让最终大数据验收对应当前代码，保存旧schema7长跑进度后终止旧进程：XL导入4,209,000/10,000,000行、L Journal已提交1,413/5,000 Sessions（1,413,000行）。两者均**未完成，不能标记通过**，证据 `interrupted-schema7-long-runs.json`。旧L合成5m完整结果与M Journal完整结果继续保留。

最新L Journal复用原始5m活动的生成文件（未改Journal），由产品自动识别schema7并重建schema8；此次还会测1k/100k追加。XL使用当前Worker重新生成10m，含model/provider/no-match、statistics新辅助表与临时存储策略。M真实Electron当前仍跑先前启动版本，不以新代码覆盖其结果。新结果文件分别为 `l-journal-temp-policy.json`、`xl-temp-policy.json`，尚未完成。

写入策略后的类型检查、IPC channel/build graph检查通过；再次生产依赖部署到独立目录后，以实际Electron39.8.10/Node22.22.1/SQLite3.51.2验证Provider Worker、SQL Worker和FTS5通过。后续仅补强catalog-only已有索引重建使用FILE临时存储，不改变这两个Worker加载契约；该分支由36项回归再次验证。

### 15:34 重复增量分布与投影诊断

将短期dirty group从逐条TEMP SQL改为同上限Set，并以256项/1024字符上限缓存批内关联。36项回归通过。对1万行初始Journal连续追加20次各1000行，生成/flush不计入查询耗时，完整服务链路p50/p95/p99 **271.41/460.30/627.88ms**，每次严格只读7000新事件；Main heap/RSS峰60.21/277.11MiB、loop p95/p99/max12.03/12.33/16.20ms。`journal-append-20.json`证明250ms目标仍失败，不能以单次较快结果宣称通过。测试脚本新增`--append-iterations=20`保留全部样本。

临时SQL计时探针中，1万行冷投影activity INSERT约718ms、compact event INSERT约240ms；其余关联SQL单项不足60ms。探针包含计时代理开销，不作为性能门禁。最新L/XL长跑启动于批内缓存之前，不含该纯投影局部优化；索引结构/事务/字段口径一致，不为局部改动反复重启长跑。


### 稀有模型/服务商筛选与历史回退补齐

在独立 201k 行索引副本追加一条最旧的稀有模型/服务商记录，原时间索引扫描的 p95 为 4,687.96 ms。新增 `(model,started_at,source_event_seq,activity_id)` 和对应 provider 索引后，查询计划变为索引搜索，同一探针 p95 为 0.642 ms（20 次；首次建索引不计入查询；不是 M/L 验收）。新增回归同时检查 EXPLAIN 和游标同值分页。

历史查询此前在二次失败后只报错，IPC 层另有小数据 Runtime 全量恢复回退。现在统一到 Service：二次失败后从 Session 有界批读，在 Worker 内临时内存 SQLite 复用相同 catalog projection/FTS/分页，结束或失败即关闭。限制总计 1,000 Sessions、5,000 events、8 MiB 序列化输入；预检超过事件预算不会打开 Session body；超限显式失败。该路径不依赖磁盘索引和 owner lease，仍依赖可用的 Node SQLite 驱动。正常持久索引与临时回退共用 schema initializer，不改变 Agent Loop。

`SessionListPage.readModel` 传递降级状态；侧栏和独立历史搜索提示已从会话文件读取。40/40 Worker/Service 回归、7/7 历史搜索与 IPC 预算测试、Desktop typecheck 通过。未进行真实视觉验收。

本轮新增索引、批次缓存与历史回退未包含在已经启动的 L/XL/M 长跑中；长跑不反复中断，完成后按明确版本边界定向复测。


### 单批预读与最新生产布局验证

Service 在发送当前 Journal 批次投影时，最多预读下一批（Provider 上限 256 events/256 KiB 目标，单记录 1 MiB）；捕获预读拒绝，当前 Session 事务仍回滚，重建不会跳过失败批次。无变化查询仍读取 0 事件，新增测试验证预读失败后恢复无丢失/重复。预读只重叠文件解析与 SQL，不扩大 Provider 批次。

`journal-prefetch-20.json`：10k 初始数据/10 Sessions，20 次追加 1k，p50/p95/p99 为 257.73/285.46/343.38 ms；每次严格读取 7,000 新事件。Main heap/RSS 采样峰 60.81/280.19 MiB，event-loop p95/p99/max 为 12.03/12.13/12.67 ms。较前一相同规模的 p95 460.30ms 改善，但机器负载不同，不能作为精确加速比；250ms 门禁仍未通过。

最新 Renderer build 通过。生产 deploy 首轮受 npm registry 网络超时影响，终止后改用本机已有缓存 `--offline` 成功；新独立目录 `actspace-usage-package-history-offline` 运行实际 Electron 39.8.10 / Node 22.22.1 / SQLite 3.51.2，Provider Worker、SQLite Worker、FTS5 和临时历史 fallback 全通过。该版本含新增查询索引、历史回退与预读 Service；不是签名 DMG 或真实界面通过。IPC 162、build graph 44、frontend token/theme/bridge 静态检查均通过。


### 未变化目录的 descriptor 检查成本

独立 Provider Worker 探针读取 M 的 1,000 Sessions 描述符（同文件内容，20 次重复）。此前每个未变文件仍执行 open/fstat/close：p50/p95/p99 为 70.19/76.99/78.42ms。缓存命中改用 fresh stat，比对相同物理 stamp，发生变化再打开并重新 fstat 读取：p50/p95/p99 为 5.66/7.86/13.43ms；冷读 1.52s/1.15s 包含 Worker 启动与尾部读取，均单列，不混入热分布。该探针不替代 Electron 查询；Electron 将单独重启定向复测。缓存仍每次校验文件存在性、身份、大小、mtime，追加/同长替换/删除不能被缓存隐藏。


更新 Provider fresh-stat 后 `journal-prefetch-stat-20.json`：10k/10 Sessions，20次追加1k，p50/p95/p99 207.82/222.77/226.59ms，首次达到该小fixture的250ms目标；不能代替M/L，也不证明5k追加通过。新增复用fixture脚本按真实descriptor读取revision，并从现有seq生成新的请求身份，避免曾追加过的数据重复seq或request id。正在独立S已有201k数据上测试20次1k/5k追加，原M/L/XL保持各自版本边界。


### 最新 S 已有201k数据增量 / M Electron热查询

`s-existing-incremental-latest.json`：复用100 Sessions/201k活动，首次265.08s读取1,400,100事件（此前Electron的codec stamp与core基准不同，受影响Session合法重建；不得称为纯热启动）。热page/FTS/cursor p95 2.96/3.06/2.27ms，20次追加1k p95 256.62ms、追加5k p95 1102.87ms，**均未通过250ms目标**。Main heap/RSS峰58.24/248.91MiB，loop p95/p99/max12.04/12.34/38.54ms；失败是同步完成延迟，非Main持续冻结。结束fixture321k行，不能再称201k当前数据。

M真实Electron fresh-stat后稳定20次 p95：statistics22.2、全标题23.9、部分大标题16.9、部分小标题21.1、model21.0、provider24.9、组合23.5ms，均满足稳定热查询100ms目标。首次复杂标题2185.1ms以及启动重叠statistics最高1108ms仍单列保留。历史search与两页50条组合20次p95 38.2ms，无跨页重复，performance5s区间max10.62ms。该组仍不是CU；详情证据见[electron-acceptance](electron-acceptance.md)。M进程正常退出，目录交回主线最新增量基准。

最新Provider（含fresh-stat与12项回归）再次独立offline production deploy，Electron Provider/SQLite/FTS/historyFallback探针全部通过。41项Worker/Service通过；docs依旧307个已有图片链接错误，本次任务路径0。


### 回退查询一致性与目录增量同步

Usage fallback 原先复用旧 JS 过滤，缺少新索引的标题 FTS 和 cursor 语义。现保留 Session 原投影，在请求级内存 SQLite 中复用正式 schema、行绑定、FTS、汇总和分页 SQL；始终关闭临时连接，异常/超限亦清理状态。不创建磁盘库或租约。最多 1,000 Sessions、5,000 events、8 MiB 精简输入（包括 metadata），IPC 仍不超过 500 行/1 MiB。使用标题/工作区事件复原轻量 descriptor 缺少的 metadata。磁盘索引无法写入的测试中，标题搜索、第二页 cursor、summary 与 statistics 均与正常索引深度对照一致。

Worker/Service **44/44**；新增的目录对照测试确认一个会话更名只写该会话，未变化请求无 catalog 写入，删除会话仍会清除搜索结果。Service 将原全目录 fingerprint 改为逐会话 fingerprint；首次连接完整校验，之后只向 Worker 发送变化项，存在删除时才触发 prune。S/M 增量门禁仍以实测为准，不因优化已编码就改判通过。

含 Usage fallback 一致性版本的 Desktop typecheck 与独立 offline production deploy 通过。实际 Electron 39.8.10 / Node 22.22.1 / SQLite 3.51.2 的 Provider Worker、SQLite Worker、FTS5、historyFallback、usageFallback 探针全部通过；目录增量优化在此后加入，已通过构建和44项回归，最终打包复测待执行。

独立真实 Electron 故障 fixture 把派生 SQLite 路径设为目录，重建 unlink 失败后，preload 的历史搜索与分页继续从 Session 得到正确结果；renderer 文本明确显示“已从会话文件读取”。这是运行时/DOM 证据，锁屏下未执行真实 Computer Use。证据见 `electron-history-fallback-runtime.json` 与 [Electron 报告](electron-acceptance.md)。


S 已有321k数据的目录增量版本（`s-catalog-delta-incremental.json`）冷启动核对427.3ms、事件读取0；20次1k/5k追加 p95 **320.45/1338.63ms**，仍未达250ms。Main heap58.41MiB、RSS320.81MiB；loop p95/p99/max11.73/12.05/12.61ms。此时与L/XL/M基准共享设备，不能将不同数据库大小的前后结果当作严格A/B提升。目录优化以写入审计证明减少无关catalog更新，尚不声称端到端增量达标。

尝试将多个独立step/call合并调用既有投影器（`s-group-projection-incremental.json`，已有441k，20次追加）：1k/5k p95 **320.60/1428.71ms**，未见改善，已撤回合并调用代码。保留新增的run关联事件字节计费，防止关联展开绕过单组8MiB/10k事件预算。实验后的S fixture含561k行，后续复用须以真实revision和行数为准。


### 45项回归与实际发布布局验证

最终 Worker/Service **45/45**、Desktop typecheck、IPC162和build graph44通过。run关联展开计入单step/call的8MiB/10k事件预算；超限测试验证事务回滚，原activity和水位均保留。

检查 `scripts/release-package.sh:120` 确认当前发布使用 `Contents/Resources/app`，未启用ASAR。复制生产依赖目录与最新dist-electron到独立`.app`布局后，使用stock Electron的真实Browser进程从该目录加载Provider/SQLite Worker；FTS5、historyFallback、usageFallback全部通过（Electron39.8.10/Node22.22.1/SQLite3.51.2，`processType=browser`）。这证明实际发布目录与Worker依赖可加载，不等同签名/DMG、完整应用启动或CU通过。命令为 `verify-usage-package.mjs --browser-process --app-root=<copy>/Contents/Resources/app --electron=<stock Electron>`。

**打包探针误启动记录**：16:11:52–16:12:05首次误用带`Resources/app`的复制版Electron，CLI bootstrap被正式入口覆盖，打开默认ActSpace数据目录。确认后终止该测试进程；文件mtime检查显示Session Journal无改动，查询派生库、workspaces.json及Chromium缓存发生写入。没有原始配置快照，因此未删除或伪造回滚这些文件。随后改用stock Electron；探针强制独立`ACTSPACE_DATA_DIR`/workspace/cwd、清除继承repo root、60s超时、成功标记文件，并拒绝Browser模式下传入已打包入口的binary。第二次隔离验证通过。日志分别为`/tmp/usage-portable-browser-probe.log`与`/tmp/usage-portable-browser-isolated-probe.log`。


### XL 1,000万行长跑完成

`artifacts/usage-read-model/xl-temp-policy.json`：10,000 Sessions / 10,000,000 activities，20次热查询。冷导入 **2,837,716ms（47.3分钟）**；CPU user561,705/system925,334ms。activity/FTS/model+provider/无匹配/status/cursor/statistics p95分别 **24.24/23.60/29.44/24.54/25.71/26.60/16.21ms**。statistics p99为85.64ms，仍保留首轮慢样本。

Main/Worker heap采样峰值 **32.74/23.94MiB**，进程RSS **135.48MiB**，heap limit4144MiB是V8上限而不是实用内存。Main event-loop p50/p95/p99/max **11.04/12.05/12.50/48.01ms**。最大返回100条明细、643049bytes；全部响应低于1MiB。追加1k/100k **407.95/26318.49ms**，每种仅一次样本，不能称p95；1k单样本已超过250ms初始目标。

该组证明千万行合成Worker的有界内存、分页/FTS/统计热查询和Main响应；不是Journal全链路或Renderer/CU，也不是已完成最新代码全部验收。进程载入15:26临时存储策略版本，之后新增model/provider索引、预读、fresh-stat、fallback和目录增量未在此进程重新载入；具体版本边界保留。与L/M和构建共享设备；不作为隔离设备的严格前后A/B。脚本完成后按原约定清理其临时数据目录，报告保留。L真实Journal和M最新增量仍运行中。


### 增量 CPU 定位（非验收分布）

对 S 已有561k活动/100 Sessions 使用 V8 CPU profile，连续3次追加1k和5k；带采样开销且与L/M并发，不作为正式p95。Worker主要采样归因于活动INSERT（约1436ms）、关联投影（约1137ms）和COMMIT（约770ms）；重复目录插入检查只有很小占比，未据此引入额外优化。Provider主要是JSON快照校验、解析与冻结。

报告 `s-increment-profile.json` 保留：1k样本约298–380ms、5k约1006–1151ms，每次分别只读取7k/35k新事件。该结果用于定位，不能证明250ms门槛通过。测试结束S fixture为579k活动；CPU文件保留在临时诊断目录，未纳入仓库。下一步待M/L长跑完成后再判断真实规模结果，避免在同一设备并发压力下反复做无因果依据的优化。


### 深度收尾审查与定向修复

按 check 技能执行安全、架构及四个独立异常组合审查，HIGH项另由独立反证者复核。主线逐项回读上下游后修复：

- 基准脚本只自动删除自己 mkdtemp 创建的根；显式 `--root` 默认保留。用含 sentinel 的隔离目录回归，旧代码失败、修复后通过；没有对用户目录做破坏性复现。
- codec digest独立于文件追加stamp持久化；codec升级与seq增长同时发生仍重放旧事件。旧v8实验库可从原stamp末段识别digest。新增回归旧代码读seq1，修复后从seq0重建。
- Runtime描述符返回健康sources与failedSessionIds；批读失败后逐项定位。workspace facts隔离正文损坏，记录失败日志；不支持可选provider能力时返回null并走原Session目录读取。窗口原本会创建，但Runtime/核心IPC缺失这一精确影响已纠正。
- Service隔离源读取/codec失败，健康会话继续查询；受影响派生投影清除并下次重试，Session事实文件不改。历史响应保留failed计数，Usage明确显示被排除数量；数据库错误仍走原重建/fallback。
- activity/statistics与历史页面逐行计入原始字节预算后才解析，避免先分配巨大页面再检查响应。带400KiB合法reason的测试揭示旧statistics漏限，修复后拒绝超预算。
- SQL写入将合法偏移时区规范化UTC；修复30小时前的+08时间误入day范围。
- 重建与fallback的SQL查询都进入querying阶段，取消可中止Worker并释放队列；两类恢复路径定向测试通过。
- 全局sourceWatermarks成为最多500项的诊断样本，截断用sourceWatermarksTruncated明确标识，不改变完整sourceCount和聚合。650会话空搜索回归通过；前端无依赖逐会话水位的恢复/新鲜度逻辑。

阶段验证：Worker/Service52项全套通过，随后补两项SQL恢复取消回归均通过；Runtime2项、workspace4项与Usage页面回归通过，最新全套复跑中。所有新缺陷的首次失败日志保留于临时测试目录。

仍未关闭：启动workspace admission仍需逐批扫描旧Journal（Worker保护Main调度，但窗口创建等待全扫描）；durableSeq不变而物理尾部变化可能重复重建；增量250ms目标、L真实Journal/最新M结果、真实CU锁屏。这些不因审查修复完成而自动通过。


### 解锁后继续验收与复审修复

用户已手动解锁，指定 gpt-6.1-sol 恢复真实 Computer Use；不再将锁屏列作当前阻塞。S 首轮实际点击验证了同步取消、重试、Tab/主题切换响应；大 Session 重建超时，随后历史搜索/加载更多受同一 Worker 队列影响，均记录失败，见 [Electron 逐点报告](electron-acceptance.md)。独立小 fixture 的历史 fallback 搜索、降级提示和打开对应 Session 已真实操作验证。

复审补齐：源失败隔离同时失效 usage/catalog 两类缓存及目录 fingerprint，恢复同一 descriptor 时重新插入完整目录；不支持可选批读能力的 Provider 明确报告 Usage 不支持，保留历史/正文能力，不能将健康 Session 当损坏返回零统计；分组历史页共享原始数据 1MiB 预算。

L 从早期实验库补建 model/provider 索引超过原 60 秒超时，旧 Worker 原生 SQL 尚未退出，恢复 Worker 因 owner lease 失败；原库保留，索引最终完成。第一次 latest-hot 失败日志保留，随后重试没有重读事件。修复后超时不自动判定损坏/删除库；新 Worker 等待旧 Worker 真正退出。S codec 变化重建 48 万行单 Session 时，带触发器的大 DELETE 也暴露了长语句问题；现改为每次最多删除 500 条，同一 Session 事务保持原子，批间发送存活通知并让出 Worker，取消可终止同步。60 秒计时是无进展检测，不是整个重建限时；单个原生 SQL 尚不能被普通消息中断。58/58 Worker/Service 测试通过，包含临时源故障恢复、跨组预算、退出等待与删除途中取消回滚。

### M 最新真实 Journal 增量完成

`m-existing-incremental-latest.json`：初始 1,101,000 行/1,000 Sessions，codec 切换全量重建 2,127,614ms（35.46 分钟），读取 7,708,002 事件；热 page/FTS/cursor p95 **18.88/16.51/12.89ms**，无变化读取0事件。20次追加1k/5k后同步查询 p95 **368.72/970.99ms**，仍不满足250ms初始目标；每次只读7k/35k新增事件。Main heap峰56.55MiB、进程RSS246.72MiB；事件循环 p50/p95/p99/max **11.01/12.04/12.47/34.05ms**。结束 fixture 为1,221,000行。该长跑载入15:59版本，后续故障隔离等修复未包含在这份结果中。

### L 真实 Journal 完成及最新热查询

`l-journal-temp-policy.json`：5,000,000行/5,000 Sessions，读取35,005,000事件，完整冷重建 **5,448,968ms（90.82分钟）**。旧版本 page/FTS/cursor p95 **219.08/264.33/199.10ms** 未过100ms；追加1k/100k单样本424.55/18008.89ms。Main heap70.07MiB、RSS262.69MiB；loop p95/p99/max12.04/12.44/47.48ms。长跑使用15:26版本，不含之后fresh-stat等优化。

最新实现复用5,101,000行目录，补建索引超时后的第二次查询 `l-journal-latest-hot.json`：进程首次检查6962.63ms、读取0事件；20次page/FTS/cursor p95 **92.77/95.04/139.72ms**，cursor仍不通过。Main heap169.46MiB、RSS261.27MiB；loop p95/p99/max12.30/17.24/21.15ms。堆样本随着GC回落，不能把峰值直接解读为泄漏。与S实际Electron重建共享设备。该组没有追加，不替代增量指标，也不等同L真实UI验收。


### 只验收模式的本轮工程检查

用户明确后续只验收，Bug先记录，统一修复另行安排。验收源文件哈希冻结于本地 `artifacts/usage-read-model/acceptance-only-source-baseline.json`；报告和临时fixture继续生成，不修改业务代码。问题清单见[acceptance-bugs](acceptance-bugs.md)。

本轮 Desktop 使用统计/历史搜索/IPC预算/workspace admission及browser reconfigure共26项通过，JSONL Provider12项通过。Desktop typecheck、IPC162、build graph44及隔离真实Browser进程发布目录探针已有最新通过证据；Worker/Service58项通过。`check:docs`本轮仍为307条历史媒体链接失败，本次任务路径0条。保留全量Desktop首次2个超时的旧事实，不以本轮定向26项覆盖全仓。

L最新稳定完整Node链路复测 `l-journal-latest-stable.json`：5,101,000行/5,000 Sessions，首轮目录核对4820.90ms、读取0事件；20次page/FTS/cursor p95 **57.68/61.08/55.48ms**，heap/RSS峰90.54/240.42MiB，loop p95/p99/max11.13/13.53/18.63ms。与先前共享机器高负载时的cursor139.72ms组分开保存，不覆盖或删除失败分布；这份报告未追加、未验证L Electron实际UI。


### 用户要求暂停并收口提交

用户最终要求停止验收，等其他任务完成后统一验收，并创建分支、提交一个commit、合入main。原实现计划转入completed表示实现收口，验收与缺陷修复移交独立active计划，不表示签收。U-01–U-10保持开放/待复验。

切换Astra后仅增加U-08/U-10的普通及fallback四个回归复现：实际运行全部失败，证明reset先比较原始字符串会误包含before、误排除after，历史混合时区排序也错误。用户暂停前没有写入对应业务修复；四用例以Bug ID标TODO保留，不能计为通过。此前58项通过结果仍只代表其明确测试范围。

S最新CU最后观察39/100 Sessions、3,632,951事件，未观察最终完成；M/L本轮CU未执行。5分钟31个RSS样本Browser峰241.92MiB、Renderer峰90.30MiB，4进程合计峰375.83MiB（共享页可能重复计入），不代表长期无泄漏。主线核实自有测试进程身份和隔离cwd后正常SIGTERM退出，保留fixture和证据。没有继续运行大数据或UI验收。
