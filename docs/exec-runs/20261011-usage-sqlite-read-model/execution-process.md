# 使用统计 SQLite 读模型与 Worker 执行记录

状态：进行中
日期：2026-10-11
模式：交互执行
计划：[20261011-usage-sqlite-read-model](../../exec-plans/completed/20261011-usage-sqlite-read-model.md)

## 执行边界

- Session Journal 继续是唯一事实源；Agent Loop、恢复和轨迹详情继续读取 Session。
- SQLite 只保存可删除、可重建的使用统计与历史查询读模型。
- Worker 负责 SQLite 建库、增量同步和查询；主进程负责 IPC、Session reader 适配、生命周期和错误映射。
- 本执行记录只覆盖本次批准的完整变更集，不把中间状态视为可发布的产品阶段。

## 初始检查

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 设计规范漂移审计 | 通过 | 计划中的漂移审计表；未发现结构性漂移 |
| Node SQLite API | 通过 | Node v22.22.2 可加载 `node:sqlite`；Electron 运行时探针待完成 |
| 现有 Worker 先例 | 通过 | `model-catalog-worker.ts`、`model-catalog-service.ts`、`review-git-worker.ts` |
| 现有 JSON 使用统计路径 | 已定位 | `usage-source-cache.ts` 全量来源读取；`indexed-usage.ts` 全量过滤、聚合后分页 |
| 文档检查 | 有既有失败 | `pnpm check:docs` 报告 307 个历史截图/图片链接问题，与本次新增文档无关 |

## 操作日志

### 2026-10-11：开始执行

- 用户批准按计划开始实现。
- 已建立本执行记录和执行摘要入口。
- 正在确认 Electron 打包运行时的 SQLite 能力，以及 Worker 获取 Journal 增量的最小运行时接口。

### 2026-10-11：实现与基准

- Electron v39.8.10 / Node v22.22.1 探针确认 `node:sqlite` 可用。
- 新增长期存活 `UsageReadModelService` 和 `usage-read-model-worker.ts`；SQLite 使用 WAL、FTS5、结构化过滤、SQL 聚合和有限页返回。
- Main 继续通过 Runtime `globalSessionSummaries`、`inspectSession`、`inspectSessionEvents` 获取 Journal-derived rows；Agent Loop 和轨迹详情未改路径。
- Worker 失败时自动重启一次；再次失败回退现有 `projectIndexedUsageActivity/Statistics`。
- 100k 合成数据：冷同步约 2.6 秒，activity 查询约 0.22 秒，statistics 查询约 0.32 秒，各返回 100 行，Worker heap 约 70 MiB。
- 1m 合成数据：分批冷同步约 77.2 秒，activity 查询约 12.5 秒，statistics 查询约 4.4 秒，各返回 100 行，Worker heap 约 603 MiB；统计不再物化全量请求行，但冷重建和 Worker 峰值仍未达到初始通过线。
- 失败恢复：Service 在 Worker 首次失败后终止旧 Worker、删除 SQLite/WAL/SHM 派生文件、强制重建一次；再次失败才回退 JSON projection。

## 自动化验证

- `pnpm --filter @actspace/runtime... build`：通过。
- `pnpm --filter @actspace/client build`：通过。
- `pnpm --filter @actspace/desktop typecheck`：通过。
- `pnpm --filter @actspace/desktop build:electron`：通过。
- `pnpm --filter @actspace/desktop build`：通过（已有 CSS `::highlight` 与大 chunk 警告）。
- `node apps/desktop/scripts/verify-usage-read-model.mjs`：通过；覆盖 FTS、cursor 翻页、SQL statistics、Session prune 和 SQLite 文件创建。
- `pnpm check:ipc-channels`：通过。
- `pnpm check:desktop-build-graph`：通过。
- `pnpm exec vitest run src/main/test/usage-source-cache.test.ts src/main/test/runtime-v2-fixed-renderer-projection.test.ts --config vitest.config.ts`：23 项通过。
- `node apps/desktop/scripts/benchmark-usage-read-model.mjs --rows=100000 --sessions=100`：完成。
- `node apps/desktop/scripts/benchmark-usage-read-model.mjs --rows=1000000 --sessions=100`：完成，结果见上。
- `pnpm check:docs`：仍被仓库既有 307 个历史截图/图片链接错误阻塞；本次文档没有新增同类错误。

## 验证记录

实现、单元测试、类型检查、基准和真实 Electron 交互验收完成后，在本文件追加命令、结果、耗时、内存和事件循环指标。每项结果区分源码/运行时检查与真实 Computer Use 验证。


### 2026-10-11：继续执行，替换主进程全量来源路径

- 发现原首版仍在 Main `UsageSourceCache` 中全量读取/解析，撤销“实现已完成”的摘要措辞。旧基准不能代表完整生产链路。
- 在 Storage 增加可选、有界且 cursor 不透明的 `readEventBatch`；JSONL 使用懒启动读取 Worker。Runtime/App/Registry 仅转发接口，不解析文件路径或字节偏移。
- SQLite 新增精简 Usage 关联表，按 step/call 增量重投影；复用既有费用、token、重试关联口径。关联事件、行、FTS、cursor 和水位事务一致。
- Main 移除 Usage 主查询对完整 cache/inspection 的依赖；无变化不读 Journal，重启复用已提交 cursor。真实 Journal 测试追加 2 / 5 事件只读取 2 / 5 条。
- 损坏库/schema/application id 重建、事务失败、metadata 更新、fallback 等 15 项 Worker/Service 测试通过；Provider 9 项、Runtime projection 15 项、storage-neutral 2 项、原 Usage 23 项通过。
- fallback 在 Worker 里从 Session 计算；5,000 events / 8 MiB 精简状态上限，UI 有独立提示。大数据下索引和重建都失败时显式报错，不伪装空结果、不退回全量 Main JSON 扫描。
- schema 更新为 3，activity 和 catalog 标题使用独立 FTS，sourceWatermarks 使用 indexed revision。
- 新版 S 基准冷导入 1.412 s、activity p95 299 ms、生成器 Main event-loop p99 12.40 ms；仍未达到热查询通过线。完整数值和边界见执行摘要。
- 旧版 5m 脚本进程已经主动中止（exit 130）；没有形成可用的 L 验收结果，不重复记为通过。


### 冷目录、历史搜索与百万行复测

- Query Source 描述符绕开 Runtime 全量 summary 重放。Provider Worker 有界读取 Header/尾部；打开 Session 的水位由 Runtime durableSeq 限制。Runtime 对 batch 执行 codec 解析，仅传已知可解释事件。
- catalog 元数据和受限消息片段由 SQLite Worker 投影；本机历史搜索增加侧栏入口、50 条一页、翻页替换结果，远端不合并。详情保持 Session 路径。
- 进度与取消 UI、SQLite owner 锁、SQL 取消终止 Worker、队列/超时均已接线。单测与错误状态仍继续验收。
- 百万行普通分页已满足初始目标；FTS 和 statistics 因查询计划选择未排序索引而读取大量行。固定顺序分页访问路径后，中位 FTS 约 67 ms、statistics 约 198 ms。p95 尚未通过，增加日/全量汇总与 run 去重表后继续复测。
- 具体数值和采样边界更新到执行摘要，未把合成 Worker 基准标为真实 Electron 验收。


### 有界历史查询、JSON 对照与真实 Electron 冷启动修复

- 多 workspace 首页合计上限 500 条，保留空分组分页入口；工作树按 sourceWorkspaceRoot 匹配。FTS 支持带引号短语；非法游标直接拒绝，不触发重建。
- 历史 catalog 和 Usage 采用独立水位，只浏览历史不构建 Usage；后续 Usage 同步不能重复累计 catalog turn 数和片段。新增专项测试。
- JSON 基线 S/M 完成：M parse 2,686 ms、翻页 p95 1,993 ms、heap 1,358 MiB、Main 最大阻塞 4,844 ms。不是旧 Journal 完整恢复基线。
- S 真实 Provider→Runtime→Main→Worker：100k/100 Sessions，cold 76,239 ms，page/FTS/cursor p95 5.32/5.83/4.51 ms，热读事件 0；增量1k耗时839 ms，7,000 events。增量目标尚未达到；测试在共享开发机器有并发负载。
- Electron 首次暴露插件服务层遗漏 querySources/readEventBatch 转发，已补齐并增加真实 Cordis 路径回归。另发现 boot workspace admission 调用旧 listSessions 完整恢复，S 启动超过90s且Main满核；改成有界 Session workspace 事实读取，继续复测；不让SQLite成为权限事实源。
- Workspace 元数据读取增加 Provider eventTypes 返回过滤；物理256事件/256KiB批次和cursor连续性保持不变。
- 当前 Worker/Service 26 项通过（完整 statistics golden 追加后重跑中）；Provider10项、Runtime定向8项、UI/guards/gateway94项、workspace/browser10项通过。基准仍运行。
- Computer Use 被 macOS 锁屏阻断，已请求用户手动解锁；CDP运行时采样只记运行时证据，不记作真实CU通过。

## 14:48 生产布局与实际启动回归

生产依赖deploy下Electron Worker/FTS5探针通过。Electron S采样先后暴露 repairSubagentPublications 全库inspect，以及侧栏所有可见会话 tasks snapshot 触发bind。先增加无delegation早退与Header lineage预筛（匹配子Session仍完整校验），随后增加schema8 catalog pending task轻量提示，避免已完成后台历史恢复。子agent只做测试进程临时dist诊断并已恢复。CU仍受Mac锁屏限制；运行时复测继续。Worker28项、Provider11项、队列/IPC24项回归通过，全量Desktop首轮1704通过/2超时，定向复跑通过。

### 15:00 冷缓存实验与真实标题搜索问题

- 临时编译Worker副本对比默认页缓存与32MiB：同形100k行/1000 Sessions，在并发长跑机器上冷导入98.09s对96.13s，追加1k为1120ms对1194ms；RSS峰104.75MiB对141.78MiB。收益不足，因此不把额外缓存写入产品默认配置。该小样本不能替代大库结论。
- 实际Electron S搜索`benchmark`匹配全部201k行，15.3–19.8s，明确失败；无搜索页13–19ms。根因是标题命中绕过global rollup并重复扫描宽明细行。
- 修正查询：标题覆盖整个catalog时直接使用等价的全局汇总；部分标题命中在SQLite TEMP表中一次聚合匹配行，后续摘要/费用/维度复用该组；未筛选的Tab总数保持用全局汇总。增加部分/全部标题、status、混合币种与未知成本回归。
- 删除Session时同时清理两套revision/cursor/stamp，防止历史水位在长期删除/重建中累积。

### L statistics去重计数修正

L旧statistics p95 579ms定位到每日distinct run重复计算，新增SQL精确基数表，按首次/最后kind身份维护，不让查询重新扫描全部运行。已有schema8派生库辅助表原子回填；新增混合kind、替换、删除回归。Worker/Service34/34通过。S现有201k索引副本正在比较旧DISTINCT与当前总览；该副本探针不替代M/L整链路。

### Provider批量上限实验（未采用）

在同一共享负载下，1k行/10 Sessions的真实Journal smoke，256事件批次追加1k行952.5ms；提高到1024事件但保留256KiB目标后1238.7ms，Main loop p99从12.36变为17.09ms。扩大批次未改善同步，已恢复256事件上限，不用增加Main单批负担掩盖SQLite写放大。11项Provider测试通过；最终再用恢复后的产物回归。

### 15:10 资源环境与最新构建

设备为16GiB RAM / 10 CPU cores；同一时刻有M/L真实Journal、XL合成三个长跑，并观察到系统磁盘约345MB/s的瞬时吞吐。因此冷导入/追加墙钟时间属于共享负载下的压力记录，不能和早期单独运行值直接算优化倍率。没有调整系统服务或用户应用设置。

恢复256事件Provider批次后，Provider11/11、Worker/Service34/34通过；最新源码重新生产部署到独立`/tmp/actspace-usage-package-final`，实际Electron 39.8.10的Provider Worker、SQLite Worker、FTS5探针通过。没有使用旧生产依赖副本冒充最新包验证。

### 写入系统调用瓶颈定位与修正

独立临时库使用S数据的一行真实字段形状，1000条INSERT、每轮回滚，逐项移除trigger仅作诊断。默认临时存储完整trigger约550–610ms，CPU以system为主；去掉全部trigger约7–9ms。32MiB页缓存无显著改善；保留全部trigger、改MEMORY临时存储约33–39ms。该诊断不修改业务fixture，也不作为大数据验收结果。

临时Worker完整100k/1000 Sessions实验：冷13.11s、追加1k211.90ms/100k18.88s；Main/Worker heap采样20.24/20.58MiB、RSS134.75MiB，loop p95/p99 12.08/12.61ms。仅用于验证方向，最终业务策略并非全程MEMORY。

业务修正：有界追加事务使用MEMORY，查询/已有数据替换/全局删除/catalog更新使用FILE；切换失效TEMP聚合缓存；dirty group限制10000项/8MiB。36项Worker/Service回归通过，包含无数据变化但TEMP表已删除的缓存重建，以及dirty-group超限回滚不推进水位。真实Journal S和最新大规模复测继续。


### 15:42 稀有筛选和历史回退

- 稀有模型命中只有一行时，201k 副本原查询 p95 4.69s；模型/服务商时间分页索引后 0.642ms。EXPLAIN 回归要求 SEARCH 相应索引，避免只测试高命中条件。
- 历史 Service 补齐“查询失败→一次重建→有界 Session fallback”；移除 IPC 的另一条 Runtime 全量恢复回退。临时 SQLite 复用投影和 FTS；每次请求关闭；上限 1,000 Sessions/5,000 events/8 MiB，状态传递到前端。
- 首次新增分页测试错误地将无搜索分组分页视作 search cursor，修正为真实搜索 cursor 后 40/40 通过；无搜索仍遵守既有每组 10 条接口。7/7 UI/IPC 预算测试通过，Desktop typecheck 通过。


### 15:50 单批预读和生产探针

有界 lookahead 与 SQL 投影重叠，固定最多下一批；20 次追加 1k p95 285.46ms，内存与主线程延迟稳定，仍未通过250ms。预读失败回归初次 fixture 缺 completedTurnCount 导致 catalog SQL 先失败、误进入 fallback；补齐合法 Summary 后定向通过，41 项全套复跑。

生产 deploy 网络重试无进展，明确终止该任务进程后 offline 重做，成功部署新目录。Electron路径首次从根 require 读取为空，改用已确认的本地实际可执行路径；最终 Provider/SQLite/FTS/历史fallback探针全部通过。保留初始命令失败日志，不把重试当额外产品兼容性结论。


### 15:53 descriptor 热路径

1000 Sessions 的独立 Provider 探针定位 open/fstat/close 成本约61–78ms。未变化缓存改为 fresh stat→比较stamp，变化才打开/重新fstat/解析；20次 p95从76.99ms至7.86ms。仍按查询检查，不引入TTL或后台扫描。Provider同长度替换/删除新增回归，Electron待进程重启定向验证；不改变正在运行的L/XL采样版本。


## 回退一致性及增量目录优化

- 补测发现 Usage fallback 旧 JS 搜索不包括标题；改为请求级内存 SQLite，复用正常 SQL 的 FTS、cursor、聚合，保留原 Session projection。新增 metadata 和结果一致性测试，均通过。
- 预检限制加入最多 1,000 Sessions，metadata 纳入 8 MiB 预算，Service finally 与 Worker 查询完成均释放状态。
- 单会话变更原先重写全部 catalog；改为逐会话 fingerprint，只同步变更项，删除或首次连接才 prune。测试审计 SQLite UPDATE，确认只变更目标 Session，同时验证删除结果不残留。
- 当前 Worker/Service 44/44。Usage fallback 版本生产依赖部署 Electron 探针通过；目录优化后 S 已有321k fixture启动20次1k/5k增量复测，结果未返回前不改判门禁。


## 实际发布路径与探针纠正

发布脚本采用Resources/app而不是ASAR。首次用已装入Resources/app的Electron副本启动CLI探针，正式入口接管，误开默认目录；16:12停止测试进程。Session Journal mtime无变化；派生SQLite、workspaces.json和Chromium缓存有写入。未删除配置，未声称完全回滚。修正探针为独立数据目录/工作区/cwd、成功标记、60s超时，Browser模式拒绝已打包binary。stock Electron Browser进程从复制的生产Resources/app目录加载两个Worker、FTS5和两类fallback通过。

Worker/Service45项、IPC162、build graph44通过。真实CU仍因Mac锁屏未覆盖；L/XL长跑与M最新增量测试继续。


## XL长跑完成

千万行Worker合成基准完成，冷47.3分钟，热查询p95 16.21–29.44ms；Main/Worker heap32.74/23.94MiB、RSS135.48MiB，loop p95/p99/max12.05/12.50/48.01ms，最大响应643049bytes/100rows。追加1k单次407.95ms仍超250ms目标。L真实Journal、M最新增量仍在进行；没有把XL作为Renderer或最新完整代码的通过证据。


## 深度审查修复

完成安全/架构和四角度独立审查，HIGH另做反证。修复显式benchmark root清理、codec+append重建、坏源逐会话隔离、可选Provider null兼容、页面解析字节预算、UTC时间与恢复SQL取消；具体失败→修复回归及未关闭项见执行摘要。Runtime启动全扫描和live非durable尾部变化仍作为后续定位项，未宣称全部完成。


解锁后继续真实CU，S取消/主题等交互可响应，但大Session替换超时及后续历史查询失败，保留失败证据。修复源隔离后的交叉查询缓存失效、Provider不支持查询的明确错误、跨workspace原始页预算；Worker等待原生退出后替换，超时不直接删除库，大删除500条一批保持事务且可取消。58项Worker/Service回归通过。M/L真实Journal长跑已完成，热查询优化有效，增量250ms和L部分热查询目标仍失败；详细数值见执行摘要。本计划仍未签收。


用户指定“继续验收，只验收，有bug先记录，我最后统一修复”后转为验收模式。停止业务修复；CU智能体收到相同限制。冻结58个实现/脚本文件的SHA256基线，主线只运行验收和写报告。当前问题集中在acceptance-bugs.md，工程定向26+12测试通过，docs307旧链接失败/任务0；真实CU继续，受阻项按点未覆盖。


只验收探针（临时fixture，不改实现）：Service+真实SQLite Worker输入256事件、durableSeq255；不变查询读取0，同seq仅stamp变化后读取全部256。确认重置分支的重复读取成本，未模拟真实Agent未flush写入，问题U-04保留这一边界。结果 acceptance-same-revision-stamp.json。无dataset参数的verify smoke也通过，不能替代大数据验收。


只验收新增U-08：resetAt为UTC零点，+08事件实际早5小时却返回1条，期望0；Service+真实Worker/受控Provider复现，worker159先原字符串过滤后UTC入库，fallback同形源码。另CU报告U-09，同步190万事件离开Usage到外观再返回自动取消并回滚当前大Session进度；保留页面等待，不改业务实现。


用户短暂要求边验收边修复后，主线加入U-08/U-10四个回归复现并实际观察全部失败，尚未修改业务实现。随后用户明确暂停验收和修复，要求整理计划、创建分支、一个commit并合入main。已停止CU，确认PID32539属于隔离S fixture后正常退出；冻结阶段58文件核对无业务变化，新增复现以TODO保留。新统一验收计划接管全部已知问题、数据/性能指标和E1–E6覆盖，原实现计划按仓库规范收口至completed。
