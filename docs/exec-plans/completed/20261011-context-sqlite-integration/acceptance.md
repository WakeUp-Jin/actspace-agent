# Context / SQLite 联合测试验收计划

> **2026-10-12 用户确认的调整**：一次追加1k/5k的250ms目标及低频首次复杂标题统计耗时，保留压力测试实测与原失败记录，本次作为已接受限制，不再单独阻断完成。不新增预先统计、不做发布结构重构。日常单次回复/少量工具调用、切换会话、打开统计及大量历史同步时的正常使用继续验收；反复超时、无法恢复、数据错误或正常操作阻塞仍需修复。以下历史数值未删除；热查询与内存有界要求、其余正确性/交互覆盖继续有效。

状态：执行中。本文列验收范围和执行方法，不是通过记录；实际证据保存于联合执行目录。入口为[联合执行计划](README.md)；[原 SQLite 计划](../20261011-usage-sqlite-acceptance.md)的 A1–A4、P1/P2、E1–E6 和隔离要求保留，阈值适用上述用户确认的例外，以下为新增或交叉覆盖，不缩减旧清单。

## 1. 证据与数据前提

冻结当前分支的 HEAD + dirty diff/untracked 指纹、lockfile、schema/projector/estimator/codec 版本、Node/Electron、硬件、并发负载。原有通过记录只作基线。测试生成 fixture 必须有合法可见 Session Surface，能打开正文、工具记录和轨迹；只有合成 SQL 活动的数据不能用于声明 Agent/Context/CU 通过。

所有测试限定本任务数据目录、workspace 和 cwd；先从启动日志核对。真实 provider 使用已有配置，不能在日志/文档暴露凭据；无配置则将对应真实模型路线标未覆盖。受控 provider 可以验证真实 Loop/IPC/Session 路径，但须明确不是外部模型 API 成功。

每项记录：编号、版本、通过/失败/未覆盖、证据类型、命令或操作步骤、期望/实际、Bug id。截图只保存关键状态和异常；媒体默认本地不随仓库分发，文字必须足以复现。

## 2. 后端与契约验收点

| ID | 测试内容与预期 | 主要落点 |
| --- | --- | --- |
| B1 | 当前/请求 manifest 分类同源；稳定 key、摘要独立分类、工具调用/结果和 thinking 可识别；分页前后分类总量不变；模型上限与当前配置同版本 | engine manifest/projection 单测、Loop context-conversion |
| B2 | 模型/工具输出先 durable 再 reconcile；多个 Step 与 Run 的逻辑身份稳定；Session/scope 隔离；迟到状态与实例重建不使 UI 回退 | engine instances/reducers、Runtime integration |
| B3 | 空会话、只有 prepared 请求、失败、重试、未返回 usage、压缩前后、旧快照缺身份/上限；最近请求不能声称网络送达；usage 不按 step 重复累计 | Loop、Context read-model 脚本 |
| B4 | 不变查询读 0 events；单会话不枚举全库；追加只读增量；未 flush 尾部/截断/替换/同大小覆盖/codec 升级正确失效 | Provider/Runtime、U-04 原回归 |
| B5 | 批次崩溃、取消、Worker 超时、双 owner、删库损坏、schema 8 升级、generation 发布、重启后无重复漏数；超时不删库，取消不走恢复链；同 schema 两代的 rollup/FTS/run 不双计；全局 reset 不清 Context 会话累计 | SQLite service/Worker；U-02/U-05/U-09 |
| B6 | 正负 offset、reset 相等边界、UTC 同时刻、两页 cursor 无重复遗漏；普通索引和 fallback 一致；旧库重建后修正既有数据 | U-08/U-10 四条原断言及扩展 |
| B7 | current 可用而 history 失败/同步时返回独立状态；旧 published 数据标 stale；无内存实例只标历史来源；读面板不启动 Run、不写 Session | App/面板 service 集成 |
| B8 | IPC sender、Session/scope、cursor/revision 校验；全文只对非会话条目有界分页，拒绝任意磁盘路径；越权/跨会话请求失败；远端 gateway 行为不退化 | IPC guards/gateway、renderer hooks |
| B9 | 索引结束且无新消息、Context/模型 facts 独立变化可刷新；切会话迟到结果被丢弃；条件探测单在途、隐藏停止、空闲/错误退避；notModified 不含完整清单，不反复聚合/扫描/重建；截断/分页/全文 stale 状态明确 | renderer Context、mock、Usage 测试 |

先运行失败回归再修复；从 Bug 清单移除失败状态必须带相同断言通过证据。原 TODO 测试不能计作通过。工程命令见 README；新增有意义的性质/边界断言，不为只改文字增加机械测试。

以下为原 SQLite 分支已经实现或明确约定的保留回归，不因新增 Context 而缩减：

- **A1/B3/B6**：FTS 词项/短语和受限片段边界、旧 page 输入与 cursor、未知费用/null/混合币种、run/重试去重、范围/维度过滤与全量汇总等价。
- **A2/A3/B4/B5**：删除会话、源/codec 失败隔离、failedSources 可见、同 descriptor 恢复重入；超时保留派生库、等待退出、有限重建、fallback 使用同投影/SQL 语义，临时库结束释放。驱动/Worker 无法加载时明确不可用；错误探测不形成无限重建循环。
- **A3/A4/B7**：无查询时两个 Worker 不为索引持续读取；SQLite 不可用时 Agent/Session/正文仍可运行；Provider 缺少可选查询能力不误判 Session 损坏。pending-task 徽标和 delegation lineage 不触发无关会话恢复；延后 admission 时后台恢复/写入与 UI 一样须先验证权限。
- **A4/B8/E4**：多 workspace 首屏总预算、>500 总记录连续可达、历史正文与轨迹读 Session；结构化 IPC 不接收 SQL；Electron 开发/生产依赖布局下 Provider Worker、查询 Worker、node:sqlite/FTS5 均可用。已有生产探针不代表最终安装包或当前版本已通过。
- **B5/P1/P2**：真实 schema 8 fixture 升级记录冷耗时/CPU/磁盘；Context 只请求一个 Session 时升级不重放其余 Session。升级中无查询后暂停，重开续跑；schema 不兼容不能谎报旧代 ready。同 schema 源重建则验证旧代 stale、完整新代原子发布和旧代有界回收。

## 3. 规模、内存、响应和磁盘

| 规模 | 目标数据 | 必须跑的路径 |
| --- | --- | --- |
| S | 100 Sessions / 100k activities；另保留原 579k 巨型 Session 场景 | 正确性、取消、恢复、小 fixture 对照 |
| M | 1,000 / 1m | 真实 Journal、Context 请求快照、真实 Electron 全路线 |
| L | 5,000 / 5m | 同上，加长期内存、分页、全局 Usage 与当前 Context 并发 |
| XL | 10,000 / 10m | 合成 SQL 长跑；真实 Journal/CU 未跑则单列未覆盖 |

复用数据前重数实际 activities/Session/Journal bytes，不能沿用追加前的规模标签。Context 专用样本包括 >500 请求、>200 上下文事件、>500 当前条目、重复压缩、重试、图片/附件引用和接近/超过 1 MiB 的单条 Journal。数字趋势 fixture 必须来自真实可解析请求事实。

当前门槛（含用户确认例外）：

- 热查询 p95 ≤100ms；1k/5k各20次追加的原250ms目标改为压力边界记录，本次不再阻断。补测1/5条新增各20次的延迟、只读增量和准确计数，配合真实聊天/工具验收；100k仍只报告吞吐、耗时、取消。
- Main loop p95 ≤16ms、p99 ≤50ms，无持续超过 100ms 的连续阻塞。不能用 interval max 代替 histogram。
- IPC ≤500 明细/1 MiB，Context 主响应目标 ≤200 KiB；大清单必须分页且总量完整。Preview/全文分别遵守设计预算。
- 热查次数增长时 GC 后 heap 不持续线性增长；L 不因全量数组出现数量级跃升。Main/Worker isolate heap、Browser/Renderer RSS 分开报告，Worker RSS 不重复相加。
- 冷启动、冷重建、首次复杂筛选、热查询分别报告；同时量测 data-ready→runtime-ready、首窗口和首次交互。
- L 真实 UI 不能有明显长冻结；同时采集 IPC/loop/内存。SQL 跑得快不代替 UI 流畅度。

新增联合门槛：Usage 冷同步时 current 读取不等待其完成；已准备好的当前投影热读采用 p95 ≤100ms 目标。后台同步期间正常交互、取消与恢复可验证，完成Context同步后无需新消息即可刷新；已知大Session发布长事务本次不重构，但反复超时/正常操作阻塞仍不豁免。无可靠 live Context 时明确历史状态，不为满足延迟伪造 current。

补测空闲可见面板和全部查询关闭两个状态：持续记录探测次数、IPC 字节、事件读取、聚合次数及 CPU。相同版本 Journal 读取/全量条目估算/数据聚合均为 0；全部消费者关闭后只允许当前有界批次收尾。不能以“每次很快”代替证明没有重复计算，也不能以 Worker 隔离代替计算总成本与冷等待体验验收。轮询与调度初始参数可以根据数据调整，原硬门槛不随之降低。

磁盘无事后新增硬阈值：记录 Journal/SQLite/WAL/空闲页、重建双 generation 峰值、清理后的稳定值和 Context 增量成本。原 L 14.60 GiB Journal / 23.26 GiB SQLite 仅作历史观察，不是本版本结果。

现有基准入口（由实施轮运行，不在文档轮启动）：

```sh
node apps/desktop/scripts/benchmark-usage-journal.mjs --rows=1000000 --sessions=1000 --appends=1000,5000 --append-iterations=20 --out=artifacts/context-sqlite/m-journal.json
node apps/desktop/scripts/benchmark-usage-journal.mjs --rows=5000000 --sessions=5000 --appends=1000,5000 --append-iterations=20 --out=artifacts/context-sqlite/l-journal.json
node apps/desktop/scripts/benchmark-usage-read-model.mjs --rows=10000000 --sessions=10000 --out=artifacts/context-sqlite/xl-sql.json
```

默认脚本创建隔离目录；显式 root 只允许任务 fixture。新 Context benchmark 在 T6 实现并写明参数/输出 schema，再用于同版本联合负载；不能复用普通 Usage fixture 冒充 Context 覆盖。

## 4. Computer Use 验收点

在后端与工程验证后执行。只委派 `gpt-6.1-sol` 子智能体；不可用则说明限制并保留未覆盖，不静默改用 Astra。子智能体先读 AGENTS、本文和前端验证规范；主智能体准备隔离 app、fixture、日志和构建版本，不代替子智能体操作验收。

以下 C 点全部需要真实界面操作。原 E1–E6 全量继承，特别是 Usage 各 Tab/筛选/搜索/分页、历史跨 workspace 与超过旧 500 限制的连续分页。

| ID | 界面、状态和行为 | 预期 |
| --- | --- | --- |
| C1 | 打开空会话、已有 Context、只有历史请求的会话，查看五区块与 Composer | 0/null/历史来源区分准确；上限未知不猜数；两处数字口径一致 |
| C2 | 真实 Loop 的用户输入→工具调用/结果→助手完成→下一步，持续观察 Context | 当前随持久事实变化；最近请求比较基准固定到对应 request；无需手动重开面板 |
| C3 | 用户/助手/工具类型筛选，点普通会话行及“最新某类”，打开找不到的定位目标 | 轨迹定位到同 messageId/callId，缺失提示可关闭，不能跳错会话 |
| C4 | 超长清单加载更多、分类过滤、展开非会话全文、处理中 revision 变化 | 总量不随分页变；全文有界；旧 cursor/stale 有可恢复说明 |
| C5 | 压缩、切模型/模式、重试后的比较/趋势/事件 | 摘要独立；上限随模型一致；事件真实/推导可辨；未知回收量不当 0；截断有说明 |
| C6 | Usage 冷重建时打开 Context、离开再返回；显式取消、改筛选、关闭/重新打开测试窗口 | current 可用；共享索引不因页面离开回到起点；恢复最终有正确结果 |
| C7 | 切会话、停止产生新消息后等待历史追赶；隔离库故障与重试；清空全局 Usage | 无迟到覆盖；历史完成自动更新；失败不冒充空态；会话累计不被清零 |
| C8 | 浅/深主题、正常宽度/约480 CSS px，结果/空/加载/错误态，键盘与滚动 | 可读、不重叠、焦点合理；横向滚动实际有效；操作无明显冻结 |

## 5. 操作分组

验收点定义范围，分组仅减少重复操作，不按组数签收。

1. **浏览器 mock 路线**：`pnpm --filter @actspace/desktop dev:renderer`，使用 long-session 和 T7 新增的状态 fixture。一次连续检查 C1/C3/C4/C8 的视觉与导航状态；截图结果/错误/窄窗关键态。标注 mock，不能代替 C2/C5–C7 的真实后端。
2. **Electron 主会话路线**：从日志 `[dev-runtime]` 的 appName/appId 选中本任务 app；进入隔离的可写 Session，完成输入、工具、下一步、压缩、模型切换、条目到轨迹及全文分页，覆盖 C1–C5。中间 Context 变化必须当场观察记录，不用最终截图推断；没有模型配置则记录受影响点未覆盖。
3. **M/L Usage 与 Context 联合路线**：每种规模串行；先完成原 E1/E2/E6 的等待→结果→各 Tab/过滤/分页，再打开 Context 完成 C6/C7，离页/显式取消/重试后等待最终正确结果。同步记录 loop/IPC/内存。结果态再切主题/窄窗覆盖 E5/C8，不为了看主题反复中断冷同步。
4. **真实历史路线**：复用同一 M/L app，完成原 E4 的跨 workspace、搜索/短语/清空、更多和连续分页，打开正确 Session 看正文/轨迹/历史 Context；覆盖 C1/C3，保留页首尾与定位证据。
5. **隔离故障路线**：只操作专用小 fixture，主智能体预置派生库不可用/迁移/恢复条件；子智能体操作错误→重试→结果、会话切换及 Usage 清零，覆盖原 E3 与 C6/C7；补错误态 C8。故障注入的运行时证据和实际点击分开记录。

已知且可安全连续执行的操作可以在一次 CU 调用内完成；需要根据反馈决定下一步时先观察。公共组件选代表位置只证明共性，特殊行为补测。修复后的复验只覆盖受影响点及必要回归，但最终报告合并此前全部点，不用末轮少量操作代替完整覆盖。

## 6. 签收与 Bug 关闭

- U-01：原1k/5k每种20次分布保留为用户接受的性能限制；日常1/5条新增与真实交互、增量读数及结果正确性继续验证。
- U-02/U-05：巨型 Session/索引准备、取消、Worker 真正退出、重试后最终结果正确；不是只看 loading。
- U-03：启动三段计时及 workspace 权限事实不退化。
- U-04：受控与真实未 flush 尾部场景均有证据，同时保留替换检测。
- U-06：首次复杂标题和热缓存分别报告，不用热 p95 掩盖首次。
- U-07：重新检查，区分既有与本次新增失链；单独记文档任务状态。
- U-08/U-10：原四个断言去除 TODO 后通过，补旧库、offset 边界和两页 cursor。
- U-09：离页、过滤、显式取消、关闭、共享消费者和重启的完整生命周期通过，安全提交进度不丢失。

B/C/A/P/E 每项有结论；无法执行或外部条件缺失标未覆盖。性能未达线只能标失败或用户明确接受例外，不能自行降线。代码合入、类型检查通过、计划进入 completed 都不等于功能验收通过。

## 2026-10-12 最终范围调整

用户明确取消L（510万条）未完成的最终统计、完成后界面和长期资源验收，不作为本轮门槛，也不签通过。M/Small已列覆盖保持；三项性能优化继续暂缓。实现完成归档与全部门槛通过是两件事，默认并行测试失败和未定性内存观察见执行摘要。
