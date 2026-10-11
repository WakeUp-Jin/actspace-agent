# 使用统计 SQLite / Worker 统一验收与缺陷修复计划

状态：**待执行，按用户要求暂停验收与修复，等待其他任务完成后统一执行**。2026-10-11 收口当前实现并准备合入 main，不代表功能验收通过。恢复条件：用户确认其他任务已完成并要求开始统一验收；不能根据经过的时间自行恢复。

## 目标与边界

在最终集成版本验证使用统计、历史列表和片段搜索的数据正确性、故障恢复、分页、内存及界面响应，修复下表已知问题，再给出逐点签收结论。Session JSONL 仍是 Agent Loop、恢复和轨迹详情的事实源，SQLite 只承担可重建的查询。

这是一次统一验收，不拆成长期分批发布。当前暂停期间只保存代码、计划和证据，不启动新的压力测试、界面验收或缺陷修复。用户已经授权合入带明确未完成项的当前实现；合并不能代替后续验收。

## 接手必读与代码入口

- [设计规范](../../design-docs/筛选存储改版V2-增加SQLite/README.md)、[Worker 规范](../../design-docs/筛选存储改版V2-增加SQLite/worker.md)。
- [实现计划](../completed/20261011-usage-sqlite-read-model.md)、[执行摘要](../../exec-runs/20261011-usage-sqlite-read-model/execution-summary.md)。
- [验收矩阵](../../exec-runs/20261011-usage-sqlite-read-model/acceptance-matrix.md)、[Bug 详细复现](../../exec-runs/20261011-usage-sqlite-read-model/acceptance-bugs.md)、[真实 Electron 覆盖](../../exec-runs/20261011-usage-sqlite-read-model/electron-acceptance.md)。
- `apps/desktop/src/main/runtime-v2/usage-read-model.ts`：查询调度、revision/stamp 校验、重建与 fallback。
- 同目录 `usage-read-model-worker.ts`、`usage-catalog-projection.ts`、`usage-session-fallback.ts`、`usage-rollups.ts`：事务、时间边界、SQL/FTS、聚合。
- `packages/session/jsonl/src/query-reader-worker.ts`、`packages/runtime/src/session/session-controller.ts`：有界物理读取、durable 水位与 codec。
- `apps/desktop/src/renderer/components/WorkbenchLayout.tsx`、`UsageStatisticsPage.tsx`、`sidebar/SessionSearch.tsx`：请求生命周期、使用统计与历史搜索。
- `apps/desktop/src/main/runtime-v2/session-workspace-facts.ts`：启动时 workspace 事实扫描。

## 停止时的事实

- 58 项 Worker/Service、12 项 JSONL Provider、26 项 Desktop 定向、2 项 Runtime 定向已有通过记录；不是最终集成版本的重新验证。
- M 真实 Journal 最后为 1,221,000 activities / 1,000 Sessions；L 为 5,101,000 / 5,000。重复追加使既有 S 变为 579,000 / 100，其中存在一个巨型 Session。复用前必须重新统计实际大小，不能继续标作原始 100k。
- M 热查询 p95 约 19/17/13ms；L 稳定组约 58/61/55ms，另一个并发负载组 cursor 为 140ms，失败样本保留。
- M 每种追加 20 次：1k/5k 同步查询 p95 369/971ms，超过 250ms 目标。
- M/L 旧冷投影分别约 35/91 分钟；XL 千万行已测的是合成 SQL 活动，不是千万行真实 Journal 或 UI。
- S 首轮真实 CU 查询超时；部分修复后第二轮最后观察到 39/100 Sessions、3,632,951 events，未观察最终完成。随后按用户要求终止验收进程。M/L 本轮真实 CU 没有执行。
- 独立 3 会话 fallback 的搜索、清空、正确会话选择和浅深窄窗已操作；不能代替大数据结果态、跨页或横向滚动验收。
- S 冷同步 31 个样本、约 5 分钟：Browser RSS 峰 241.92MiB，Renderer 峰 90.30MiB，四进程 RSS 合计峰 375.83MiB。RSS 合计可能重复计算共享页，不是物理内存总量，也不证明长期无泄漏。
- 本地日志、JSON、截图默认被 Git 忽略，不随提交分发；本文和执行记录保存关键数值，恢复时不能假设 `/tmp` 或本地媒体仍然存在。

## 已知问题与关闭依据

详细路径、复现步骤和证据以 Bug 清单为准；下表不把源码推断写成实机失败。

| ID | 当前问题 / 状态 | 修复与复验要求 |
| --- | --- | --- |
| U-01 | 追加 1k/5k 的同步查询超过 250ms | 分开量测 Provider 批读、跨线程传输、投影、SQL 和提交；修复后每种重复至少 20 次，证明只读新增事件，保留前后分布。 |
| U-02 | S 首轮 Worker 超时与 fallback 超限；先前修复后的真实结果未签收 | 完成巨型 Session 冷重建、取消、重试、随后历史查询；最终有结果且无重复/漏数才关闭。 |
| U-03 | 启动 workspace admission 扫描历史 Journal，源码确认 | 分别测 data-ready→runtime-ready、首窗口、首次可交互；若优化，权限和 workspace 归属仍以 Session 事实为准。 |
| U-04 | durableSeq 不变但 stamp 变化会整 Session 重建，受控 Provider 已复现 | 补真实 Agent 未 flush 尾部追加场景；同时保留替换/截断检测，不能靠忽略 stamp 修复。 |
| U-05 | 单条原生 SQL 建索引超过 60 秒无心跳；旧 Worker 退出后的恢复待复验 | 实测新辅助索引准备、取消、进程真正退出和重试；不能靠删用户事实或放开无限等待解决。 |
| U-06 | M 复杂标题首次筛选约 2.185 秒，热缓存很快 | 首次和重复命中分别报告；查执行计划与聚合成本，不用缓存命中掩盖首次延迟。 |
| U-07 | 仓库文档检查有 307 条旧媒体链接失败，本任务当时 0 条 | 集成后重新区分既有与新增；历史媒体修复归文档任务，不因本功能合并自动关闭。 |
| U-08 | resetAt 先按原始时间字符串过滤，offset 事件误计入/误排除 | 对正负时区、边界相等、普通索引和 Session fallback 补齐测试；同时处理旧派生库，不能只修新写入。 |
| U-09 | Usage 离页自动取消，当前巨型 Session 未提交的约 190 万事件进度回滚 | 明确页面切换与显式取消的行为，复验离页返回、筛选变更、关闭窗口；保持事务一致性与请求上限。 |
| U-10 | 历史 updatedAt 混合时区按文本排序错误 | 普通目录、Journal 投影、fallback、旧索引及 cursor 边界都按真实时间验；两页不得漏项/重复。 |

U-08/U-10 已各在普通索引和 fallback 运行一个失败用例，合计 4 个真实失败；保留在 `test-usage-read-model.mjs`，以对应 Bug ID 标记 TODO。TODO 表示已知未修复，不是通过；修复后必须去掉 TODO，再运行原断言验证。暂停时还没有实施这两个 Bug 的修复。

磁盘成本另作权衡：既有 L Journal 约 14.60GiB、SQLite 主文件约 23.26GiB；需要记录 WAL、空闲页和稳定态文件大小，事前没有磁盘通过阈值，不事后编造门槛。

## 验收点（逐项报告）

- **A1 正确性**：UTC/offset/resetAt、range/status/model/provider/kind、FTS 词项与短语、费用币种/null、run 去重；对照原 Session 投影与受控期望，所有差异可解释。
- **A2 增量与水位**：无变化查询读 0 events；追加只读新增；活跃未 flush、codec 升级、文件替换/截断、删除、临时坏 Session 恢复；水位仅随事务提交推进。
- **A3 故障与生命周期**：丢库/损坏/schema、锁竞争、Worker 崩溃/超时/退出、取消、重建失败后的有界 fallback；失败必须可见，不静默全量 JSON 扫描。
- **A4 Agent 边界**：Loop/resume/轨迹详情继续读取 Session；UI 索引错误不能破坏事实写入或恢复。使用带合法可见消息 surface 的 fixture 验证打开会话正文。
- **P1 计算性能**：冷重建墙钟/CPU/吞吐、热查询 p50/p95/p99、1k/5k/100k 追加、复杂首次匹配；所有报告携带版本、数据规模、codec/schema 和并行负载。
- **P2 内存与响应**：Main/Worker heap、Browser/Renderer RSS、GC 后趋势、Main loop histogram、IPC 行数/字节；重复查询和大 Session 必须有界。
- **E1 首次打开**：设置→使用统计，检查等待/同步/完成/空态，进度和窗口响应；冷启动与热进入分开计时。
- **E2 结果交互**：搜索/无匹配/清空、range/status、日志/模型/服务商/工具 Tab、跨页往返、刷新、纵向与横向滚动，检查页码及首尾行。
- **E3 状态恢复**：显式取消、重试、离页返回、故障与降级提示；恢复后结果正确，不能仅看到 loading 就判通过。
- **E4 历史查询**：首屏、加载更多、FTS/短语、清空、跨 workspace、超过旧 500 限制后的连续分页、点击正确 Session，验证可见正文和轨迹详情。
- **E5 视觉与尺寸**：浅/深主题、宽窗和约 480 CSS px；结果/空/加载/错误态可读，筛选无重叠，表格横向滚动实际有效。
- **E6 真实流畅度**：M/L 搜索、翻页、Tab、滚动肉眼无长冻结，并附同区间 IPC/事件循环与内存；Node 基准和小 fixture 不能代签。

## 操作分组（提高效率，不缩减验收点）

1. **工程与故障组**：先冻结最终集成 commit/dirty diff、schema/codec，再做 A1–A4；保留失败→修复→原断言通过日志。新缺陷加入原 Bug 清单，避免多份状态矛盾。
2. **基准组**：独立目录运行 S/M/L 和 XL，覆盖 P1/P2；大规模组串行，另设有标注的共享负载组。至少 20 次热样本，冷/首次不混入热分布，增量次数与数据增长写入报告。
3. **真实 Usage 组**：每个 M/L 一次进入完成 E1/E2，再测 E3；冷重建时不为了看主题反复离页。结果态出现后复用同一数据切浅深/窄窗完成 E5/E6，保留关键状态截图。
4. **真实历史组**：进入侧栏连续完成 E4 的搜索、更多、跨页、打开与返回，再补该路线特殊视觉与失败状态；不为了覆盖点机械重启应用。
5. **隔离故障组**：小而合法的独立 fixture 注入派生库不可用，验证 E3、E4 的 fallback 与边界。单页数据只能验单页，补足多页样本再签收跨页。

Computer Use 默认委派 `gpt-6.1-sol`；主智能体负责修复、数据核对与汇总。子智能体返回逐点通过/失败/未覆盖及复现证据，修复后定向复验受影响点；不得用操作分组的完成数量替代验收点覆盖。

## 数据集与通过线

| 规模 | Sessions / activities | 必测路径 |
| --- | --- | --- |
| S | 100 / 100,000，并另留已有 579k 巨型 Session 样本 | JSON 基线、真实 Journal、故障与交互回归 |
| M | 1,000 / 1,000,000 | JSON 对照、真实 Journal、真实 Electron 全路线 |
| L | 5,000 / 5,000,000 | 真实 Journal、真实 Electron、内存/分页稳定性 |
| XL | 10,000 / 10,000,000 | 合成 SQL 长跑；真实 Journal 路径另列，未执行不能合并成同一通过结论 |

- 热查询 p95 ≤ 100ms；追加 ≤5k activities 后同步查询 p95 ≤250ms。100k 追加记录吞吐、总时长与可取消性，不套用 250ms。
- Main event-loop delay p95 ≤16ms、p99 ≤50ms，无持续超过 100ms 的连续阻塞；区间 max 不能冒充 histogram 百分位。
- IPC ≤500 明细且 ≤1MiB，历史跨 workspace 初页共享预算；不得传输完整 Journal。
- heap 不随热查询次数持续线性增长，L 不出现因全量 JS 数组导致的数量级跃升；分别报告进程 RSS 与 Worker isolate heap，不能相加重复算 Worker RSS。
- 冷重建允许随数据量增长，但必须记录进度、等待时间、资源和取消行为；即使 loop 达标，也不能隐去几十分钟的首次加载成本。
- 所有 A/E 点和已确认正确性 Bug 完成验证；性能未达线只能保留失败或经用户明确接受后注明例外，不能自行降低目标。

## 执行入口与隔离

恢复后先按仓库规范构建 Runtime/Client 依赖及 Electron/Renderer，再运行：

```bash
node --test apps/desktop/scripts/test-usage-read-model.mjs
node apps/desktop/scripts/verify-usage-read-model.mjs
node apps/desktop/scripts/benchmark-usage-journal.mjs --rows=1000000 --sessions=1000 --appends=1000,5000 --append-iterations=20 --out=artifacts/usage-read-model/m-unified.json
node apps/desktop/scripts/benchmark-usage-read-model.mjs --rows=10000000 --sessions=10000 --out=artifacts/usage-read-model/xl-unified.json
```

先阅读脚本当前参数；显式 `--root` 只能指本次验收专用目录，不能指用户目录。是否保留/复用 fixture、追加规模和 JSON 基线参数应在执行记录中注明。Electron 必须同时隔离 `ACTSPACE_DATA_DIR`、workspace root、cwd；从日志确认实际根路径后才继续。发布目录探针只能使用其规定的 stock Electron 入口，防止打包入口接管后访问默认 profile。

版本变化后不直接复用旧结果签收；schema/codec 变化引起重建的成本必须计入。源 JSONL 不得为缩短验收而改成已同步；不能手工篡改水位跳过计算。停止时正常退出自有测试进程、保留证据和受影响事务状态。

## 完成条件与进度

- [ ] 其他任务完成，用户恢复统一验收；冻结最终集成版本。
- [ ] 核对 U-01–U-10，完成修复或逐项明确接受例外；移除已修复问题的 TODO。
- [ ] 完成 A1–A4、P1/P2 和 E1–E6，每项标通过/失败/未覆盖。
- [ ] 对修复运行定向回归及真实 UI 复验，保留版本间证据。
- [ ] 输出最终验收摘要，更新设计状态、Bug 清单和计划列表；真正签收后移入 completed。

执行模式：交互模式；当前尚未启动。恢复时为本计划建立同名 `docs/exec-runs/20261011-usage-sqlite-acceptance/` 过程与摘要，旧实现轮证据保持原样作为基线。
