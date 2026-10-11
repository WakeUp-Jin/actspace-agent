# SQLite Usage 真实 Electron 验收

状态：Mac 已解锁，独立 fallback 已完成真实 Computer Use；S 首轮真实 CU 失败保留，最新 S 冷同步复验由用户要求暂停，M/L 真实 CU 尚未覆盖。S/M 与独立 fallback 运行时验收与 CU 分开记录。2026-10-11，受委派模型 gpt-6.1-sol。本子任务仅使用脱敏临时数据目录，未使用用户真实数据、未发送 provider 请求。

本文只记录本子任务的 Electron 运行时与 CU 覆盖。主线另有 Resources/app Browser 进程打包探针通过，以及首次误启动默认数据目录的事故：Journal 未改，派生库、workspaces.json 与 Chromium 缓存发生写入；停止后已添加隔离与入口守卫。详情见[执行摘要的打包探针与误启动记录](execution-summary.md#45项回归与实际发布布局验证)。该事故不属于本子任务执行的 CU，不能由本文临时目录范围推断所有主线测试均未触碰默认目录。

## 验收点

- E1：使用统计首次打开、同步中状态和窗口响应。
- E2：使用统计搜索、清空、翻页、Tab 切换与滚动结果。
- E3：同步取消、失败与重试；不能实际触发时保留未覆盖。
- E4：侧栏本机会话历史搜索、分页、选中后回到 Session 正文。
- E5：浅色、深色与窄窗布局。
- E6：性能 IPC 采样和肉眼可见冻结；运行时测量与 Computer Use 分开记录。

## 操作分组

1. 使用统计：设置 → 使用统计，首次打开/同步、搜索、清空、翻页、Tab 和滚动；保存首次/同步、分页、搜索结果等关键状态，覆盖 E1、E2、E3、E6。
2. 历史搜索：返回侧栏本机会话，搜索、分页、选择会话，核对 Session 正文；保存搜索和选中后状态，覆盖 E4。
3. 主题与窄窗：复用使用统计/历史入口，切浅深主题、缩窄窗口，核对文字、列表、按钮、状态和滚动；覆盖 E5。

## 启动事实

- renderer 构建日志 `/tmp/usage-renderer-build.log`：`built in 11.17s`。
- 执行 `node scripts/run-electron-dev.mjs --prepare-only apps/desktop/dist-electron/main/index.js` 准备专属开发 runtime；身份 `Actspace Dev 83a6-24b9` / `com.actspace.desktop.dev.w24b92665`。
- 空 fixture Electron 主进程 PID `64879`，数据目录 `/tmp/actspace-usage-cu-empty`，CDP `127.0.0.1:9337`，启动日志 `/tmp/usage-cu-electron-empty.log`。
- CDP page URL 为本 workspace 的 `apps/desktop/dist/index.html`；`window.actspace` 注入成功。
- 初始检查时 S/M/L 仍由基准 Worker 写入；后续分别获准启动 S 与 M，结果各自独立记录。L 未在本子任务启动，不把空 fixture 或 S 结果用作 M/L 验收。

## 当前结果

| 点 | 状态 | 证据/边界 |
|---|---|---|
| E1 | CU未覆盖；S/M运行时首次查询与同步状态已记录 | M旧策略冷同步35分30.7秒、每5秒真实IPC进度持续响应；未实际CU打开使用统计/观察窗口 |
| E2 | CU未覆盖；S/M稳定搜索与筛选运行时通过，首次复杂筛选成本保留 | 最新M标题/model/provider热p95 16.9–24.9ms；复杂标题首次2185.1ms、历史B5失败样本均保留。清空、Tab、滚动与真实点击翻页未CU覆盖 |
| E3 | CU未覆盖；独立历史fallback运行时通过，取消/点击重试未覆盖 | 真实preload返回source=session/status=fallback，DOM显式降级与重试提示；未实际触发CU取消或点击重试 |
| E4 | CU未覆盖；S/M历史摘要搜索分页运行时通过 | 最新M两页搜索20组p95 38.2ms、跨页无重复；未CU选中返回Session |
| E5 | CU未覆盖 | Mac锁屏，未执行浅深主题与窄窗交互 |
| E6 | S/M性能IPC已覆盖；CU肉眼冻结与L未覆盖 | M旧冷建426个5秒区间max值p95 10.95ms/max34.87ms；最新M稳定统计区间max10.10ms。区间max分布不等同底层histogram百分位；S首次499.26ms等旧慢样本保留 |

## 运行时发现 B1

空 fixture 启动后会话列表显示的 DOM 文本为“会话列表加载失败，请稍后重试。重试”。main 日志错误为 `Session provider does not support lightweight query sources.`，调用链 `RuntimeSessionController.querySources → DesktopAppService.sessionQuerySources → DesktopRuntimeV2Registry.sessionQuerySources → fixed-renderer-ipc.js:61`。已交回主智能体定位，未修改业务代码。

## 空 fixture 性能 IPC 探针

CDP Runtime.evaluate 调用真实 preload 桥（运行时检查，不是 CU）：`performance.setActive(true)`，约 1.5 秒后 `sample()`，再 `setActive(false)`。采样时间 `1791700037705`，`mainDelayMs=10.755839`；Browser working set `123648 KiB`，renderer Tab `85536 KiB`，GPU `47104 KiB`，Utility `30736 KiB`。该单次空 fixture 探针只证明性能 IPC 可用，不能作为 M/L 卡顿通过证据。

## Computer Use 阻断

首次 `cua.getState()` 返回：`The Mac is locked and automatic unlock could not unlock it. Ask the user to unlock the Mac manually before continuing.` Native apps inventory 为空；主智能体已请求用户手动解锁。Chrome inventory 另有 `unsupported Codex auth method: apikey`，本验收预期走 native App，因此不会以 Chrome 替代真实 Electron。未重复尝试自动解锁。

### B1 定向复核

主智能体补齐 JSONL provider 服务适配层 `querySource/querySources/readEventBatch` 转发并构建后，退出旧 PID 64879，重新启动同一空目录，主进程 PID 65694。`/tmp/usage-cu-electron-empty-retest.log` 不再出现 list-page handler 能力错误；CDP 读取 DOM 会话列表恢复为空态，出现 `Default workspace`、`actspace-agent`，不再有“会话列表加载失败”。B1 **运行时复核通过**；因锁屏，实际 CU 复验尚未覆盖。Chromium Shared Dictionary/cache 创建错误仍见日志，与本次业务错误分别记录。

## S 启动与阻断 B2

主智能体确认 S Worker 已完成并释放目录后，停止空 fixture，启动 `/tmp/actspace-usage-acceptance-s`，PID `66153`，CDP 9337，日志 `/tmp/usage-cu-electron-s.log`。该目录为 **100 Sessions / 201,000 activities**（原100k，加两次增量101k），不是 M/L。为避免默认选中追加较大的 `benchmark-0`，按主智能体授权在 `benchmark-99/journal.jsonl` 追加合法 `session/title-set` seq `7001`，标题 `SQLite S acceptance benchmark-99`，时间为当前。

启动事实：macOS sample 标注 Launch Time `2026-10-11 14:29:07.576 +0800`。启动24s/44s/65s 时主进程 CPU 分别约100%/99.2%/97.8%；`/json/list` 请求在44s和65s检查时仍超时，日志仅有 DevTools listening，没有可访问 renderer page。macOS `sample 66153 1` 输出 `/tmp/usage-cu-s-startup.sample`，采样 `14:29:55.616 +0800`，physical footprint与峰值均 `1.0G`。该阻断是启动路径运行时证据，尚不能归因为 Usage 查询，也没有 CU 肉眼冻结证据。已交回主智能体定位。

B2 已由主智能体定位：`runtime-registry.ts` boot 阶段恢复 workspace admission 调用 `app.listSessions()`，走旧 Runtime 全历史完整 projection，阻塞窗口创建。按主智能体指示停止 PID66153，等待修复后对 S 重启定向复核。98秒检查时 Main CPU100%、RSS384224KiB，CDP page仍超时。

### B2 两轮定向复核与后续 B3

纠正进程记录：旧 PID66153 的 TERM 被同步阻塞而未退出，首次复测 PID67585 遇9337占用。已分别 SIGKILL 这两个专属测试进程，然后干净复测 PID67657。首轮有界 workspace 修复后，11s/22s时 CDP 可即时返回空page列表，约29s创建renderer窗口（缓存日志时间14:33:31），48s检查时 page 和 bridge 可用；DOM 历史首屏10条、Show more、选中 `SQLite S acceptance benchmark-99`，正文显示“正在加载更早消息”。48s主进程CPU96.4%、RSS228448KiB；后台同时存在M/L/XL基准重负载，不将这些数值作为最终启动通过结论。

第二轮 Provider `eventTypes` 过滤构建后，按主智能体指示停止 PID67657，重新启动 PID68973，开启 Node inspector9237/CDP9337。20s内出现renderer page。保存10秒Main JS profile `/tmp/usage-cu-s-main-startup.cpuprofile`：主要是idle（5767 samples），`applyUsage`108+55 samples，一条栈是projection-cache `#read→registry.sync/fold`，另一条是Runtime `resume→liveModel→durable-session.replay→registry.sync/fold`。采样结束 `process.memoryUsage`: rss461176832、heapUsed74989624、external354303064 bytes。

随后通过preload开始S真实Usage `getActivity({scope:'global',range:'total',limit:50})`，首请求长时间不返回；之后Main memory rss161579008、heapUsed713967960、external3209146025 bytes。保存第二个10秒Main JS profile `/tmp/usage-cu-s-main-query.cpuprofile`：5003 samples为 `applyRelations` (`session/journal/dist/invariant-validator.js:121`) ← `inspect` (`session/persistence/dist/session-store.js:29`)，另463/441 samples在applyRelations内部，272 samples为 `snapshotSessionJson→validateEventEnvelopeShape→inspect`。这是 B3 **Main全量Session inspect/关系校验阻塞**运行时证据，已交回主智能体定位；采样时尚没有CU界面交互。不得把未返回的查询写成通过，也没有M/L性能结果。

主智能体确认第二profile足够定位后，SIGKILL专属 PID68973，停止本轮S运行。Usage 首请求没有返回，8次查询采样未完成，没有生成成功结果文件；等待有界调用者诊断与修复后继续。

### B3 调用者定位

按主智能体授权，先尝试 Node Inspector logpoint；`--inspect-brk` 诊断出现idle/无renderer的暂停边界，不作为产品性能结论。随后仅临时在**编译产物** `packages/session/persistence/dist/session-store.js` 的inspect入口插入诊断console，正常`--inspect`启动专属PID70797。日志 `/tmp/usage-cu-electron-inspect-callers2.log` 捕捉到至少9次重复的 `USAGE_ACCEPT_INSPECT benchmark-0`，调用栈：

```text
SessionStore.inspect
repairSubagentPublications  packages/subagent/dist/publication.js:14
beforeRecovery             packages/runtime/dist/session/session-plugin.js:27
RuntimeSessionController.resume  session-controller.js:256
openSession                packages/runtime/dist/harness/managed-runs.js:17
packages/agent-service/dist/service.js:105
```

该调用在没有发起Usage查询时就发生，指向背景Session恢复/子agent publication修复。抓取后立即恢复编译产物，逐字节与 `/tmp/usage-cu-session-store.backup.js` 相同，停止专属PID70797。没有修改业务源码。

### B3 子会话修复后仍有 bind 阻塞 B4

主智能体修复普通Session无delegation时跳过子会话publication扫描，确认dist注释`Ordinary Sessions`后重新启动S（PID71702），20s内renderer page可用。早期memory为 rss1102675968、heapUsed473588792、external382029377 bytes。79s时进程CPU93.9%、RSS505936KiB，Usage首请求仍无返回。

再次保存10秒JS profile `/tmp/usage-cu-s-main-retest4.cpuprofile`：3437 samples为 `applyRelations` ← **`SessionStore.bind`** (`session/persistence/dist/session-store.js:95`)，381 samples `snapshotSessionJson→validateEventEnvelopeShape→bind`，296/257 samples applyRelations内部。与前一轮`inspect`不同，说明仍有写入lease/Session open的完整关系校验路径。已交回主智能体继续定位调用者，不能签收Usage查询或大规模UI门禁。

主智能体定位 B4 为 `App.tsx:528` 启动时对全部visibleSessions请求tasks snapshot，每次通过ManagedRuns openSession触发bind，包含巨型benchmark-0。按指示停止PID71702，等待任务状态获取惰性边界修复后复测。无需进一步诊断编译产物。

### B4 修复后 S schema8 冷同步

主智能体新增catalog pending task摘要、hasPendingTasks惰性边界后，确认renderer dist时间14:47:02、build17.52s通过，启动PID80640（`/tmp/usage-cu-electron-s-retest5.log`）。schema7→8自动重建派生索引；不把冷重建墙钟时间误判为Main挂死。

已通过真实preload同时执行 `getActivity` 首次total查询、`getStatus(s-runtime-0)` 和每3秒performance采样。查询进度持续从3840、22784、40704推进至671232events（约114秒、0/100 Sessions完成，先处理benchmark0的巨大增量）。性能IPC持续响应；首次sample mainDelay499.26ms与首会话加载重叠，后续观察约6–10ms；Browser working set从约320MB下降至244MB，renderer约88MB。该证据表明B4后**运行时响应已解堵**，尚未完成全部cold/热查询，也不是肉眼CU验证。完整结果待写入 `electron-s-runtime.json`。

## S 真实 Electron 运行时最终采样（本轮）

证据 `electron-s-runtime.json`，明确只是preload/IPC运行时检查，**不是Computer Use**。schema8首次cold总查询310826.1ms；共201000条activity，201000成功request，26,130,000 totalTokens，201USD。每次结果均50行、50785 bytes（无search）或50548 bytes（search），符合行数/字节上限。

| 查询 | 页 | 耗时ms | totalRows |
|---|---:|---:|---:|
| 无search冷同步+查询 | 1 | 310826.1 | 201000 |
| search=`benchmark` | 1 | 19819.6 | 201000 |
| 无search热查询 | 1 | 19.0 | 201000 |
| search=`benchmark` | 1 | 16451.0 | 201000 |
| 无search热查询 | 2 | 14.0 | 201000 |
| search=`benchmark` | 2 | 15641.8 | 201000 |
| 无search热查询 | 2 | 13.2 | 201000 |
| search=`benchmark` | 2 | 15329.7 | 201000 |

标题search匹配全部activity时明显超过100ms热查询目标，标记 **B5：搜索性能失败**，已交回主智能体优化。无search热查询本轮13.2–19ms。125个每3秒performance采样提供的是**各区间max值**；这些区间max值的p50/p95/p99为9.51/10.56/17.18ms、最高499.26ms，不能冒充底层event-loop histogram的p95/p99。首个499.26ms与首次Session正文恢复重叠，后续最大17.18ms。Browser工作集采样峰325680KiB，末次117488KiB，renderer末次61712KiB。后台M/L/XL仍共享机器负载。

## S 历史查询运行时

证据 `electron-s-history-runtime.json`。workspace首屏10条11.7ms，精确标题搜索`SQLite S acceptance`5.9ms、仅benchmark-99。注意workspace分组分页用末项id（不是搜索用的nextCursor字段）：修正探针`after:benchmark-16,pinned:false`后返回benchmark-17..25等10条，7.7ms；search=`benchmark`第一页5.0ms，nextCursor=benchmark-16；第二页4.9ms返回另外10条，无重复。`hasPendingTasks=false`已真实返回，Main不再被无关历史会话任务恢复阻断。这里只验证摘要IPC分页/搜索，未执行真实CU选择/回Session，不签收E4界面覆盖。

### B5 首轮优化定向复测

主智能体完成标题搜索rollup/TEMP聚合优化、31项测试通过后，停止PID80640并重启同schema8的S（PID87196）。证据 `electron-s-search-retest.json`。启动最初有两条`SESSION_WRITER_LOCKED`（旧PID80640、benchmark99，旧heartbeat在停止后30秒stale窗口内）；未删除租约/事实数据，后续查询正常返回。

| 搜索 | 命中activity | 重启后首查询ms | 后续热查询ms |
|---|---:|---:|---:|
| benchmark | 201000 | 1327.2 | 657.1；第2页111.6 |
| 精确短语 `"Benchmark history 0"` | 102000 | 3231.0 | 1127.2 |
| 精确短语 `"SQLite S acceptance"` | 1000 | 48.6 | 22.3 |

较15–20秒有明显改善，但大范围命中热查询仍超过100ms门禁，B5保持失败待优化，不用小范围通过掩盖。每次仍50行、49.6–50.8KB。无新schema重建；机器仍有后台基准负载。

后续检查发现benchmark99租约仍是旧PID80640（而非当前87196），PID80640已不存在。按主智能体授权，保存精确owner到 `dead-fixture-lease-owner.json` 后只删除临时fixture中 `sessions-v2/benchmark-99/.writer-lock`，未修改Journal；当前PID87196未持新租约。该清理仅为测试进程强停后的恢复，不归为业务查询失败。

全标题搜索在同PID87196稳定后连续20次：首17.8ms，p50=7.1ms、p95=8.3ms、p99/max=17.8ms、min6.6ms。每次新requestId、scope global/range total/search benchmark/limit50/page1，总行201000。证据 `electron-s-all-title-20.json`。**全标题稳定热搜索通过100ms目标**；启动阶段1327/657/111ms仍作为独立记录保留。部分标题巨型Session命中仍待优化复测，B5不能整体关闭。

### B5 部分标题缓存优化复测

32项测试通过后SIGTERM正常退出PID87196（确认进程消失），重启同schema8 S，证据 `electron-s-partial-title-20.json`。每个条件连续20次、每次新requestId，第一页limit50：

| 条件 | 首次ms | 全20次p50 | 全20次p95 | 全20次p99/max |
|---|---:|---:|---:|---:|
| `"Benchmark history 0"`（102000行） | 2293.9 | 20.4 | 462.5 | 2293.9 |
| `"SQLite S acceptance"`（1000行） | 52.4 | 12.5 | 30.0 | 52.4 |

大组前3次2293.9/462.5/97.4ms，随后17次15.3–35.5ms；按全20次统计大组p95仍超过100ms，稳定热路径显著改善，首匹配仍约2.3s。不能删除慢样本宣称完整分布通过。条件切换大→小→全后totalRows为102000/1000/201000，totalTokens为13260000/130000/26130000，结果正确，未复用错误条件的缓存。CU仍未覆盖。

同一进程标题切回大组的**准备查询1991.9ms**单列保存，之后连续20次缓存命中：p50=7.7ms、p95=8.8ms、p99/max=9.3ms、min6.5ms。证据 `electron-s-partial-stable-20.json`。说明稳定热路径满足100ms目标，复杂标题条件首次准备约2秒的成本仍未消除；此组不替换上方原始含首个20次分布。

## 本轮暂停位置

按主智能体指示正常SIGTERM退出S专属Electron PID88437并确认进程消失，fixture保留。M/L尚未准备完成，不启动重复冷构建；待主智能体明确通知可用后继续。Mac仍锁屏，E1–E5界面与E6肉眼冻结均未覆盖。当前无测试Electron运行，没有删除Session Journal。

## M 独立验收启动

主智能体确认基准PID64191已退出、目录释放后启动M：`/tmp/actspace-usage-acceptance-m`，**1000 Sessions / 1,101,000 activities**，主进程PID93557，日志`/tmp/usage-cu-electron-m.log`，Inspector9237/CDP9337。按授权在benchmark-999 Journal追加合法title-set seq7001、标题`SQLite M acceptance benchmark-999`及当前时间，让默认小会话最新；没有修改其它Journal事实、SQLite版本或绕过产品schema7→8重建。M证据独立保存为`electron-m-runtime.jsonl`（持续落盘）与完成后的`electron-m-runtime.json`，不能用S结果替代。

当前等待启动/冷重建；每5秒记录真实performance IPC与Usage进度。后台L/XL继续共享机器负载。Mac锁屏尚未收到解除通知，所有M Computer Use界面验收仍未覆盖。

M阶段进展：page监测等待34.192秒出现file renderer target。首次DOM文本读取恰在document.body未创建时抛null TypeError，属于诊断采样时机，随后preload/性能/Usage IPC正常，不归为业务Bug。冷重建推进至68/1000 Sessions、1,184,604events；近期mainDelay10.36ms，Browser working set231728KiB。M冷同步期间不重启或另开重复构建，首次查询后补statistics/model/provider精确过滤。

M继续运行原启动时版本（旧SQLite临时存储策略），不被主智能体后续temp_store优化构建替换。主智能体新L/XL长跑在独立目录重启，不触碰M。M已到478/1000 Sessions、4,059,878events，Browser工作集200656KiB、最新5s区间max10.23ms，持续文件证据中有完整历史。该旧策略M证据仍有效，但最终产品最新策略须另行注明。

## M 旧策略完整真实 Electron 结果

证据`electron-m-runtime.json`/逐条`electron-m-runtime.jsonl`。产品schema7→8冷同步+首次查询 **2,130,651ms（35分30.7秒）**，总行1,101,000。后续全标题首946.4ms、无search第2页108.6ms、102k部分标题首2258.7ms/缓存65.2ms、1k标题首78.1ms/缓存54.4ms。每次50行、99–100KB，低于500行/1MiB边界。426个5秒**区间max值**分布p50/p95/p99=10.17/10.95/14.03ms，max34.87ms；不是底层histogram百分位。Browser采样工作集峰287904KiB，未观察持续Main阻塞；CU肉眼冻结仍未覆盖。

补充证据`electron-m-extra-runtime.json`，原PID93557，每项单列一次准备查询后20次稳定热查询：

| 条件 | 准备ms | 热p50 | 热p95 | 热p99 |
|---|---:|---:|---:|---:|
| statistics | 87.4 | 66.6 | 84.3 | 85.8 |
| 全标题benchmark | 92.4 | 85.3 | 104.2 | 105.7 |
| 部分标题102k | 2285.6 | 127.0 | 187.5 | 234.5 |
| 部分标题1k | 189.7 | 113.0 | 139.8 | 140.8 |
| model-0 | 121.3 | 105.2 | 118.2 | 126.2 |
| provider-0 | 111.8 | 108.9 | 129.4 | 130.6 |
| model-0+provider-0 | 173.6 | 91.5 | 111.1 | 117.0 |

model/provider/combined总行137625/367666/46208，过滤结果正确。旧策略多数端到端热查询p95超过100ms，保持失败记录；statistics本轮通过。没有把S的低延迟换算为M通过。

完成原进程证据后SIGTERM93557正常退出并确认消失，按主智能体授权重启同M/schema8最新dist（新model/provider索引、单批lookahead、临时存储策略、history fallback）。后续独立`electron-m-latest-runtime.json`，新索引首次建立成本会计入准备查询，不删除旧结果。

## M 第一轮最新dist复测（仍旧descriptor检查）

PID28783，同schema8未重建Journal，证据`electron-m-latest-runtime.json`。首次statistics38993.7ms，包含新增model/provider全库索引准备成本。20次稳定热p95：statistics110.9ms、全标题70.0ms、大部分标题63.8ms、小部分标题320.0ms、model142.3ms、provider96.3ms、combined107.9ms。混合结果如实保留，部分条件未过100ms。

主智能体另定位每次1000个未变descriptor仍open/fstat/close约60ms；fresh stat缓存优化已构建，待其替换/删除专项测试通过再正常重启，单独记录下一轮，不覆盖本轮。

## M fresh-stat最终定向运行时复测

Provider12/12、Service41/41通过后正常SIGTERM28783退出，再启动PID30472（`/tmp/usage-cu-electron-m-fresh-stat.log`）。原新增索引已存在，不再有39秒升级成本。证据`electron-m-fresh-stat-runtime.json`：

| 条件 | 准备ms | 20次热p50 | 热p95 | 热p99 |
|---|---:|---:|---:|---:|
| statistics（启动重叠） | 389.7 | 30.3 | 303.0 | 1108.0 |
| 全标题benchmark | 26.1 | 21.4 | 23.9 | 26.9 |
| 部分标题102k | 2185.1 | 16.0 | 16.9 | 17.1 |
| 部分标题1k | 38.9 | 19.0 | 21.1 | 21.3 |
| model-0 | 19.7 | 18.2 | 21.0 | 21.8 |
| provider-0 | 20.7 | 21.3 | 24.9 | 25.2 |
| model-0+provider-0 | 32.9 | 21.0 | 23.5 | 24.2 |

fresh-stat后Activity稳定热查询全部p95<100ms，过滤行数/费用/token与原结果一致。复杂部分标题首次准备仍2185.1ms，保持失败成本记录；statistics第一组与启动重叠有1108ms慢样本，不能删除。

随后同PID独立稳定statistics20次，证据`electron-m-stable-statistics.json`：p50=13.4ms、p95=22.2ms、p99/max22.4ms；performance区间max10.10ms，Browser working set171632KiB、renderer69728KiB。该稳定组通过100ms，不替换上方startup重叠失败组。M真实Electron CU仍因锁屏未覆盖。

## M 历史运行时与目录释放

新Provider下`electron-m-history-runtime.json`：search benchmark第一页50条+nextCursor第二页50条为一组，重复20次，组合p50=21.1ms、p95=38.2ms、p99=67.2ms；每组跨页无重复。随后5秒performance区间max10.62ms。SIGTERM PID30472正常退出并确认消失，M目录释放给主智能体增量基准，未修改其原SQLite/Journal。

## 独立真实 Electron 历史fallback

fixture `/tmp/actspace-usage-history-fallback-cu`，3个合法单turn Journal（fallback-0/1/2）；不使用M/S索引。原建议runtime-v2放文件会在`index.ts:128`启动mkdir时使进程直接退出，日志`/tmp/usage-cu-electron-history-fallback.log`保留，该尝试不算fallback通过。

按主智能体授权精确调整故障：runtime-v2真实目录、`usage-read-model.sqlite`为目录，使SQLite创建/重建的unlink报EPERM；其它Session事实不变。PID33821启动真实Electron，证据`electron-history-fallback-runtime.json`：

- 默认分组列表返回全部3条，284.1ms，readModel source=session/status=fallback/reason=EPERM。
- search `Fallback acceptance` limit2返回fallback-0/1，433.6ms，nextCursor=fallback-1。
- 同搜索after=fallback-1仅返回fallback-2，240.7ms，无跨页重复。
- 精确短语`"Fallback acceptance 2"`仅返回fallback-2，166.3ms。
- CDP DOM包含“查询索引暂不可用，已从会话文件读取 重试”，证明renderer显式状态已渲染；仍不是CU肉眼/点击验证。

该小fixture只证明真实fallback状态、FTS结果、分页与恢复数据可读；1,000 Sessions/5,000events/8MiB上限由专项测试覆盖，本轮没有扩大发送数据越界。完成后SIGTERM33821正常退出并确认消失，所有验收Electron进程均释放。

## Mac 解锁后首轮真实 Computer Use（S，19:08–19:14）

隔离启动前已重建 renderer 与 Electron main/preload。主进程 PID97724，日志 `/tmp/usage-cu-resumed-s.log`；`ACTSPACE_DATA_DIR`、`ACTSPACE_WORKSPACE_ROOT` 和 cwd 均为 `/tmp/actspace-usage-acceptance-s`。日志确认 dataRoot/sessionRoot，界面文件来自本 worktree。S 当前100 Sessions /579000 activities；本轮没有访问用户默认profile或发送provider请求，未占用M/L。

实际CU通过 native应用 `com.actspace.desktop.dev.w24b92665` 操作。先按E1–E6清单执行使用统计路线，再执行历史路线；主题路线期间切换深色。所有结果如下，不以运行时旧证据替代CU：

| 点 | 本轮真实CU状态 | 证据与边界 |
|---|---|---|
| E1 | 部分通过，查询结果失败 | 设置→使用统计→显示记录；真实出现等待、同步0/100；窗口可导航和点击，但随后Worker超时，结果不可用。`cu-evidence/s-sync.jpg` |
| E2 | 未完整覆盖 | 已点模型Tab与全部范围，UI选中状态变化；搜索/清空/实际结果分页/滚动因查询失败未覆盖，不能签收 |
| E3 | 取消与失败提示通过；重试恢复失败 | 点取消即时显示“查询已取消，可刷新重试”，点重试进入读取；随后出现Worker超时后的fallback超限错误，再次点重试进入读取，未恢复结果。`s-query-waiting.jpg`、`s-query-cancelled.jpg`、`s-worker-timeout-error.jpg` |
| E4 | 首屏部分通过，搜索/分页失败 | 返回应用首10条显示，默认99进入Session；fixture无用户消息surface，因此正文为空属于fixture边界。点Show more及输入SQLite S acceptance后均出现History fallback超限错误。`s-history-fallback-limit-error.jpg` |
| E5 | 双主题同步/失败态部分通过；窄窗未覆盖 | 起始系统浅色、切深色后使用统计和历史文字/按钮/错误可见；尚未验证有结果的双主题。窗口角拖动未改变尺寸，不算窄窗通过。`s-dark-loading.jpg`、`s-worker-timeout-error.jpg` |
| E6 | 真实交互未观察窗口冻结；本轮性能IPC未采样 | 同步/超时期间设置、Tab、取消、主题、返回应用和历史搜索输入可响应。此结论仅限上述已操作状态；S查询失败不能算大规模功能通过。既有IPC采样与本轮肉眼观察分开 |

新阻断：日志先 `Usage Worker timed out`（usage-read-model.js:398），随后UI `Usage index unavailable; Session fallback exceeds 5,000 events. Retry rebuilding the index.`。历史搜索/下一批同样退到受限fallback并报错。已交回主智能体；按其指示停止重复重试/取消，保留进程供只读诊断。截图均为原生JPEG，位于本文相邻 `cu-evidence/`。

## 独立 fallback 真实 Computer Use（19:14–19:18）

S PID97724正常TERM退出后，fallback专属PID1728启动，data/workspace/cwd均`/tmp/actspace-usage-history-fallback-cu`，日志`/tmp/usage-cu-resumed-fallback.log`。结束后主线确认无Electron占用。

- E3：历史显式降级提示，实际点击重试返回3条并保持降级；故障配置仍在，不宣称索引恢复。Usage显式fallback状态、刷新后结果可读。
- E4：精确短语`"Fallback acceptance 2"`返回唯一结果，点击后标题为Fallback acceptance 2并退出搜索。fixture消息surface为空，未验证可见正文文本；3条不足页大小，UI跨页未覆盖。
- E2：按主智能体授权只改fixture `global-usage-reset.json` resetAt从2026-10-11T11:15:22.866Z为2000-01-01T00:00:00.000Z，未改Journal。刷新显示3请求/390Token/3明细；no-match-acceptance搜索显示无匹配，点击清除恢复3条；服务商provider-0/模型model-0各3请求390Token，工具为空。1页3条且上下页禁用，跨页未覆盖。
- E5：浅色宽窗及约480 CSS px窄窗（截图962物理px，Retina）、深色窄窗实际查看；概览2列、筛选换行、导航横向滚动条及表格横向滚动条可见；垂直滚动有效。横向滚轮尝试未改变表格，横向滚动行为未签收。
- E6：上述真实操作未观察冻结；小fixture不能替代S/M/L。

证据位于`cu-evidence/`：fallback-history-banner.jpg、fallback-history-exact-search.jpg、fallback-session-selected.jpg、fallback-usage-three-records.jpg、fallback-light-480.jpg、fallback-dark-480-table.jpg。

## 最新 S 冷同步复验（进行中）

- 隔离目录 `/tmp/actspace-usage-acceptance-s`，cwd/workspace 均为该目录；最新 dist，主 PID 32539，日志 `/tmp/usage-cu-s-final.log`。
- 实际进入 Usage 后同步持续增加：333,568 → 1,033,216 → 1,896,448 条，均为 0/100 会话。未显示结果；不能据此声称结果/分页通过。
- 从 Usage 切到外观、选择浅色、返回 Usage，真实导航可响应；但日志出现 `Usage query cancelled.`，回到同步 0/100、已读取 0，丢失该巨型 Session 的未提交进度。未点击取消按钮。主线登记 U09；不修复。
- E5 浅色宽窗/约 481 CSS px 窄窗同步态可见，布局无明显遮挡，仅同步态通过。证据：[浅色同步](cu-evidence/s-final-light-sync.jpg)、[窄窗同步](cu-evidence/s-final-light-narrow-sync.jpg)。
- 当前继续等待，E1 最终完成、E2 大规模结果、E4 本轮历史和 E6 本轮 IPC 尚未完成。

## 用户要求停止时的交接（2026-10-11）

用户要求停止验收，等待其它任务完成后统一验收。本节只汇总已取得的观察；未新增 UI 操作或测试。

- 当前主进程 PID **32539**，fixture `/tmp/actspace-usage-acceptance-s`；启动日志 `/tmp/usage-cu-s-final.log`。交由主线清理，子智能体未在停止后退出/点击取消。
- 最后一次真实 UI 观察：S 正在 syncing，**39/100 会话，已读取 3,632,951 条事件**。此前依次观察第二轮 330,240 → 573,952 → 1,040,896 → 1,782,528 → 2,408,448 → 3,069,440 → 10/100、3,423,010 → 39/100、3,632,951。停止时未观察到完成，不推断仍在运行或已完成。
- 主线从启动日志读取 data directories ready `11:46:20.079Z` → runtime ready `11:46:37.194Z`，17.115 秒；这仅是日志阶段，非首窗口完整耗时。第二轮冷同步精确起止未采到，不能使用 PID elapsed 当纯重建耗时。
- M/L 当前无本子任务 Electron 占用，尚未实际执行本轮 UI。旧运行时证据不能补充为 CU 通过。

| 验收点 | S 最新 CU（停止前） | M 真实 CU | L 真实 CU |
| --- | --- | --- | --- |
| E1 首次/同步响应 | 部分通过：同步持续推进，窄窗/导航可响应；最终结果未覆盖 | 未覆盖 | 未覆盖 |
| E2 搜索/清空/翻页/Tab/滚动 | 结果态未覆盖；仅同步态模型 Tab 可见。真实分页前后未取得 | 未覆盖 | 未覆盖 |
| E3 取消/失败/重试 | 首轮取消、错误、重试已实际触发且失败证据保留；最新导航自动取消进度归零 U09，完成后重试未覆盖 | 未覆盖 | 未覆盖 |
| E4 历史搜索/分页/选中正文 | 首轮 fallback 超限错误已记录，本轮未覆盖；该 fixture 无 user surface，不能声称正文正确 | 未覆盖 | 未覆盖 |
| E5 双主题/窄窗 | S 首轮深色同步及最新浅色宽/481 CSS px 窄同步态通过；有结果状态未覆盖 | 未覆盖 | 未覆盖 |
| E6 IPC/冻结 | 同步中实际导航/resize响应，未观察冻结；本轮性能 IPC 未取得，主线 RSS采样与IPC不同 | 未覆盖 | 未覆盖 |

独立 fallback 的真实 CU 已覆盖3条请求、精确历史搜索、点击正确Session、请求搜索无结果与清空、provider/model/tool Tab、浅深窄窗；真实跨页/横向滚动未覆盖，详见上节。S 首轮超时/fallback 超限失败及 U09 均保持失败，不由持续推进或 fallback 小数据通过覆盖。


主线收口：自有S测试进程PID32539已正常SIGTERM并确认退出。本文运行时JSON/JSONL现保留在本地`artifacts/usage-read-model/electron-acceptance-20261011/`，截图保留本文相邻`cu-evidence/`；这些原始制品不随Git提交分发，关键数值与逐点结论以本文为准。
