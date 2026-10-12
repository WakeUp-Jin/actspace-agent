# 使用统计 SQLite 读模型与 Worker 一次性实施计划

状态：实现收口，按用户要求保存当前代码；已知缺陷与性能门禁未关闭，不代表验收通过。后续统一验收和修复由[独立计划](../completed/20261011-usage-sqlite-acceptance.md)接管，等待其他任务完成后再执行。

## 目标

在不改变 Session Journal 和 Agent Loop 读取语义的前提下，为使用统计、历史搜索和过去会话查询增加 SQLite 派生读模型。查询前按 Session revision 懒同步，SQLite 查询和增量同步由独立 Worker 执行；索引损坏时可以从 Session 重建，重建失败时进入有上限、可取消、可见的 Session fallback。

实现按一个完整变更集完成，不做“先双写、以后再迁移”或长期并行的分阶段发布。计划中的任务是同一变更集内的依赖顺序和验收边界，不是产品灰度阶段。

## 漂移审计结论

本轮对照了设计规范、当前实现和 Worker 先例，没有发现需要先修正文档才能实施的结构性漂移。

| 对照项 | 当前事实 | 结论 |
| --- | --- | --- |
| Session 事实源 | `sessions-v2/<id>/journal.jsonl` 和 Journal Projection 仍负责恢复、Usage、Trajectory | 与新方案一致 |
| SQLite 边界 | 现有规范只允许未来增加可删除、可重建的 `runtime-v2/usage-read-model.sqlite` | 新方案是已确认的具体化，不改变事实源 |
| 当前 Usage 查询 | `UsageSourceCache` 读取完整来源；`projectIndexedUsageActivity` 全量过滤、聚合、排序后再分页 | 与性能问题描述一致，正是本次替换对象 |
| Agent Loop | 仍通过 Session/Projection 读取，不依赖 Usage IPC | 保持不变 |
| Worker 先例 | 模型目录和大型 Git diff 已使用 `worker_threads` 隔离重解析/重计算 | 可复用生命周期、取消和崩溃边界 |
| 历史完成计划 | `20260906-actspace-usage-statistics` 只记录当前 JSON/缓存实现和历史验收 | 作为历史证据保留，不视为新方案入口 |

## 范围

包含：

- `usage-read-model.sqlite` schema、WAL、schema/application id、权限和单一拥有者约束。
- Session revision 与 SQLite `indexedRevision` 的按需比较、增量同步、单 Session 重建和全库重建。
- 长期存活的查询 Worker；主进程负责 IPC、生命周期、取消和错误映射。
- 使用统计的结构化过滤、排序、聚合、游标分页和 FTS5 限定搜索。
- 历史搜索/过去会话摘要查询使用 `session_catalog` 与 FTS5；打开具体会话后详情仍读取 Session。
- 保持现有 `UsageActivitySnapshot` 语义和费用/token 口径，增加 cursor/limit 时保留旧 page 输入的兼容适配。
- SQLite 失败后的重建、Worker 崩溃一次重启、受控 Session fallback 和可见状态。
- 合成大数据生成器、Worker 级基准、主进程事件循环监测、内存测量和真实 Electron 卡顿验收。
- 设计文档、执行摘要、history 和当前导航同步。

不包含：

- 修改 Session Journal 文件格式、flush/checkpoint 语义或 Agent Loop 的读取入口。
- 把完整 transcript、工具输出、二进制附件复制进 SQLite。
- 把 SQLite 当作第二个恢复事实源，或让 Renderer 直接提交 SQL。
- 修改 WorkHub/Work 协作持久化协议；这里的 Worker 仅指 `worker_threads` 查询执行器。
- 为了“全部返回”取消 IPC、UI 和查询结果大小上限。
- 在本轮删除已有 `global-usage-index.json`；保留它作为可回滚/兼容材料，但不再作为 SQLite 主查询真源。

## 已确认的运行契约

```text
Session Journal                 唯一事实源
        │
        ├── Agent Loop / 恢复 / 轨迹详情：直接读取 Session
        │
        └── Query Worker：按 revision 读取增量
                  │
                  └── usage-read-model.sqlite：查询、聚合、FTS5
```

查询消息必须是结构化 DTO，例如 `{ range, model, status, search, limit, cursor }`。Main 校验来源和上限后转发给 Worker；Worker 组装参数化 SQL。Renderer 不传 SQL 字符串，IPC 也不暴露 SQLite 连接。

同一 Session 的 `sessionRevision` 和 `indexedRevision` 相等时，Worker 直接查询 SQLite；不相等时只读取落后的 Journal 增量。`indexedRevision` 只有在 activity、rollup、FTS 和水位表同一事务提交后才推进。

## 实施任务

以下任务按顺序执行，全部属于同一个变更集。

### 1. 固定 SQLite 驱动与 Worker 构建边界

相关路径：`apps/desktop/tsconfig.electron.json`、`apps/desktop/src/main/model-catalog-service.ts`、新增 `apps/desktop/src/main/runtime-v2/usage-read-model-worker.ts` 与 `usage-read-model.ts`。

- 在当前 Electron 构建产物中探测可用的 SQLite API；优先使用 Electron 运行时可用的内置 `node:sqlite` 能力，不能只在系统 Node 中验证。
- 复用现有 Worker 的 `__dirname`/打包路径、`parentPort`、取消和退出处理模式。
- 明确 Worker 消息协议、request id、错误码、进度/取消消息和结构化结果，禁止传递完整 Session 或巨型数组。
- 为开发态、测试态和打包态分别加入 Worker 文件可定位的构建检查。

### 2. 建立读模型 schema 与 Projection 适配

相关路径：新增 `apps/desktop/src/main/runtime-v2/usage-read-model.ts`、必要的 `packages/shared/src` 查询 DTO；复用 `packages/client/src/sessions/usage-aggregates.ts` 和 `projectSessionUsageActivities` 的事实口径。

- 建立 `session_catalog`、`usage_activity`、`usage_rollups`、`search_documents`、FTS5 虚表和 `index_state`。
- 为 activity id、session id、时间、model/provider、status 建普通索引；FTS5 只索引标题、用户/助手摘要、工具名和受控片段。
- 保存 `sessionRevision`、`indexedRevision`、index generation、最后错误和同步时间。
- 把现有费用未知、重试关联、tool invocation、token 字段映射成等价结构；完整 Journal 原文不入库。
- 所有批量写入使用事务和幂等 event/activity id；schema 变化拒绝在旧库上继续写，进入重建。

### 3. 实现增量 reconciliation、重建和查询 Worker

相关路径：新增 `apps/desktop/src/main/runtime-v2/usage-read-model-worker.ts`、`usage-read-model.ts`；原 `apps/desktop/src/main/runtime-v2/usage-source-cache.ts` 转为兼容/fallback 材料，不再作为主查询入口。

- Worker 独占 SQLite 写连接，串行执行 schema 初始化、同步和查询任务。
- 查询开始先读取轻量 Session summary/revision；只有落后 Session 才打开 Journal 并解析新增序号。
- 追加型 Journal 做增量读取；revision 不连续、内容校验失败或 Session 结构变化时，重建该 Session 的派生行，不直接重建全库。
- SQLite 损坏、schema 不匹配或单 Session 重建失败时，按“新库重建 → 受控 Session fallback”的顺序处理，并返回可区分的状态。
- 实现结构化 Usage 查询、聚合查询、cursor 分页和 FTS5 搜索；硬限制 `limit`、cursor 大小、搜索长度和 IPC 返回字节数。
- Worker 崩溃最多自动重启一次；重启后重新校验 schema 和水位，失败则交给 fallback，不能重放 Agent/Work 副作用。

### 4. 接入 Main IPC 和现有 Usage 页面

相关路径：`apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`、`packages/shared/src/desktop-bridge/contract.ts`、`packages/shared/src/runtime-v2/fixed-renderer.ts`、`apps/desktop/src/renderer/components/WorkbenchLayout.tsx`、`apps/desktop/src/renderer/components/UsageStatisticsPage.tsx`。

- 保留现有 typed IPC channel 名称和 snapshot 字段语义，内部把实现切到 Query Service。
- 旧 `requestRowsPage.page` 输入由 Main 适配为 cursor/limit；前端逐步消费 cursor，但不破坏已有页面测试和旧调用者。
- 页面打开、切换筛选、搜索和翻页只请求有界结果；摘要/rollup 可一次返回，完整会话正文不随列表返回。
- 同步中、重建中、索引不可用、fallback 和空结果分别映射为可观察状态，不能都显示成“暂无数据”。
- 历史会话摘要查询复用 `session_catalog`/FTS5；选中会话后仍走现有 Session projection/page。

### 5. 保持 Agent Loop、轨迹和旧文件兼容

相关路径：`packages/runtime/src/session`、`packages/session/persistence`、`apps/desktop/src/renderer/trajectory`、`apps/desktop/src/main/runtime-v2/usage-source-cache.ts`。

- 不修改 Agent Loop、Session Store、flush/checkpoint 和 Trajectory 详情读取。
- 轨迹需要跨会话筛选时只复用 SQLite 摘要/定位信息，详情仍从 Session 读取。
- 保留现有 JSON usage cache 文件和读取能力，避免本轮删除用户本地派生文件；SQLite 不依赖它才能恢复。
- 验证删除 SQLite、删除旧 JSON cache、Worker 停止时 Agent 仍可恢复 Session。

### 6. 建立自动化正确性与故障测试

相关路径：`apps/desktop/src/main/test/usage-source-cache.test.ts`、`apps/desktop/scripts/verify-usage-read-model.mjs`、`fixed-renderer-ipc` 定向测试；`packages/client/src/test` 保留投影 golden。

必须覆盖：

- 空库首次查询、无变化查询、单 Session 增量、多个 Session 增量。
- 重复 event/activity、revision 不连续、Session 删除、重建中断和事务回滚。
- SQLite 文件不存在、损坏、schema/application id 不符、WAL 锁冲突。
- FTS5 词项/短语搜索与结构化时间、模型、status 过滤的组合。
- 稳定 cursor 翻页、limit 上限、搜索长度上限、结果 DTO 与旧 `UsageActivitySnapshot` golden 等价。
- Worker 取消、崩溃、一次重启和二次失败；Agent Loop 在这些状态下继续读取 Session。

### 7. 独立的大批量性能与卡顿验收

相关路径：新增 `apps/desktop/scripts/verify-usage-read-model.mjs` 和合成数据 fixture；复用 `apps/desktop/src/main/performance-ipc.ts` 的 event-loop 监测能力以及 `apps/desktop/scripts/verify-usage-runtime.mjs` 的真实 Journal 建立方式。

#### 数据集

使用脱敏合成数据，不读取用户真实 Session。至少生成以下规模：

| 数据集 | Session 数 | activity 行数 | 用途 |
| --- | ---: | ---: | --- |
| S | 100 | 100,000 | 基础正确性和回归速度 |
| M | 1,000 | 1,000,000 | 百万行主验收 |
| L | 5,000 | 5,000,000 | 大规模内存和分页验收 |
| XL | 10,000 | 10,000,000 | 长跑与是否线性增长的压力记录 |

每行使用真实字段形状（时间、model/provider、status、token、费用、tool 名称和短摘要），不把完整 transcript 放入合成行。每个规模都要同时测试冷重建、无变化热查询和追加 1,000/100,000 行后的增量同步。

#### 必测指标

- SQLite 冷重建墙钟时间、CPU 时间和每批吞吐。
- 无变化查询、FTS5 搜索、时间/模型过滤、cursor 翻页的 p50/p95/p99。
- 增量同步读取的 Session 数、Journal event 数；热查询必须证明没有重新解析全量数据。
- Worker isolate 的 `heapUsed`/heap limit、主进程 JS heap、进程 RSS 峰值和重复查询后的增长趋势。
- Worker 工作期间 Main event-loop delay 的 p50/p95/p99/max；IPC 返回行数和字节数。
- 真实 Electron 使用统计页面在 M/L 数据集下的首次打开、搜索、翻页、切换 Tab 和滚动交互。

#### 初始通过线

这些是首轮验收目标，最后以目标设备实测记录校准，不用来掩盖异常：

- Worker 重建期间 Main event-loop delay p95 ≤ 16 ms、p99 ≤ 50 ms，不能出现持续超过 100 ms 的连续阻塞。
- M/L 数据集的热查询 p95 ≤ 100 ms；追加不超过 5,000 行后的同步查询 p95 ≤ 250 ms。完整冷重建允许按数据量增长，但不能阻塞 Main。
- 单次 IPC 返回不超过 500 行或 1 MB；摘要/聚合不得携带完整 Journal。
- 重复热查询后 Main JS heap 不应随查询次数线性增长；Worker 批处理必须有明确峰值，不能把全库行 materialize 成单个 JS 数组。
- M 数据集记录 Worker/进程内存峰值；L 数据集不得因为批次扩大出现数量级跃升；XL 作为长跑记录，若超过设备预算必须给出明确失败原因和降级策略。
- 真实 Electron 页面在搜索、翻页和滚动时无肉眼可见的长冻结；性能 IPC 能提供对应采样证据，不能只凭单元测试宣称不卡顿。

性能验收必须同时保留“当前 JSON 全量扫描基线”和“SQLite Worker 结果”，至少在 S/M 上比较首次查询、翻页和重复筛选的时间、内存和 Main event-loop delay；L/XL 重点验证新方案是否保持有界内存和 UI 响应。

### 8. 文档、执行记录和收尾

- 执行开始时创建 `docs/exec-runs/20261011-usage-sqlite-read-model/execution-process.md` 和 `execution-summary.md`。
- 实现完成后更新 `docs/design-docs/筛选存储改版V2-增加SQLite/README.md`、`worker.md` 的状态、实际 schema 和验收结果。
- 同步 `docs/design-docs/core-storage-and-observability.md`、`docs/design-docs/model-context/agent-token-usage-and-context-state.md`、`docs/design-docs/frontend/front-设置中心重构规范.md` 中“未来可增加 SQLite”的表述，改为实际实现边界；不改历史完成计划的事实记录。
- 按 `docs/HISTORY_GUIDE.md` 写入 `docs/histories/2026-10/`，记录变更动机、关键路径、性能验收结果和未覆盖的真实外部门禁。

## 风险与回退

| 风险 | 缓解与最小回退 |
| --- | --- |
| Electron 打包环境不支持选定 SQLite API | 先做 packaged probe；在确认兼容驱动前不进入数据层实现，避免只在系统 Node 可运行 |
| Worker 文件在生产 `Resources/app` 路径不可定位 | 复用已有 Worker 构建模式，验证开发、构建和实际发布目录；当前未启用 ASAR，未来启用时另验 |
| revision 不连续或 Journal 读取失败 | 只重建受影响 Session；事务水位不推进；失败后受控 Session fallback |
| SQLite 事务或 WAL 锁冲突 | 单 Worker 单写连接、短事务、重试一次；之后显式报状态，不静默丢数据 |
| 查询结果或 FTS 片段过大 | 列白名单、limit/cursor、片段大小和 IPC 字节上限；详情回 Session |
| Worker 内存随全库行数线性增长 | 分批解析/绑定、禁止全量 JS 数组、记录 heap/RSS 峰值；超预算时停止重建并保留 Session 可读 |
| 新读模型与现有 Usage 口径不一致 | 复用当前 projection/aggregates，运行 golden 对比；不通过则不能切换主查询 |
| 新索引影响 Agent Loop | Agent Loop 不经过 Worker；删除 SQLite、停止 Worker 后执行 Session 恢复回归 |

SQLite 文件是派生数据，回退操作是停止查询服务、删除 `usage-read-model.sqlite` 并回到 Session fallback；不删除 Session Journal、不迁移用户事实数据、不需要破坏性数据回滚。

## 验证命令

实现完成后至少运行：

- `pnpm --filter @actspace/desktop exec vitest run src/main/test/usage-source-cache.test.ts src/main/test/runtime-v2-fixed-renderer-projection.test.ts --config vitest.config.ts`
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm check:ipc-channels`
- `pnpm check:desktop-build-graph`
- `pnpm check:docs`
- `pnpm --filter @actspace/desktop build`
- `node apps/desktop/scripts/verify-usage-read-model.mjs --dataset S`
- `node apps/desktop/scripts/verify-usage-read-model.mjs --dataset M --dataset L --dataset XL`
- 真实 Electron 路线：打开设置 → 使用统计，执行首次打开、搜索、翻页、Tab 切换、刷新和滚动，同时记录性能 IPC 采样和 Worker/主进程内存。

## 进度记录

- [x] 完成设计文档与当前实现漂移审计。
- [x] 固定 Session/SQLite/Worker 责任边界和故障回退顺序。
- [x] 固定大批量数据集、指标、卡顿验收和通过线。
- [x] 用户批准后完成 SQLite 驱动和 Worker 构建探针。
- [x] 完成首版读模型 schema、revision 检查、Worker 查询和 Usage IPC 接线；统计聚合使用 SQL，Session 同步按批次发送。
- [x] Provider 有界批读、Worker 精简关联投影、持久 cursor 和跨批原子提交已接线；真实 Journal 增量/重启、损坏库/schema/application id、fallback 和 metadata 回归通过。
- [x] 取消/进度、锁竞争、崩溃重启/二次失败、rollup 与限定片段历史检索已实现，58项Worker/Service回归通过；真实界面行为仍归下一项验收。
- [ ] 完成 S/M/L/XL 性能、内存、事件循环和真实 Electron 验收；当前已完成 S/M/L/XL 合成基准、S/M/L 真实 Journal；真实CU已解锁执行，新增重建超时修复与性能失败项仍须复验，结果见执行摘要。
- [ ] 最终同步设计文档、执行摘要和 history 并关闭所有门禁；当前文件持续记录实施状态，尚未签收。

## 决策记录

- 2026-10-11：确认采用方案 B。Session Journal 是唯一事实源，SQLite 是查询读模型；Agent Loop 继续读 Session，查询时按 revision 懒同步。
- 2026-10-11：确认第一版即使用长期存活 Worker，不按行数临时切换；行数阈值只用于性能路由、批量和验收。
- 2026-10-11：确认大批量测试独立验收，必须测内存、Main event-loop delay、IPC 结果大小和真实 Electron 交互，不能只测查询耗时。

## 执行模式

**交互模式**：这是存储、IPC、Worker 和性能门禁的架构变更；每个高风险改动和验收结果由用户在线确认。实现前先读取本计划、相关设计文档和仓库协作规范。

## 执行文档

执行开始时，在 `docs/exec-runs/20261011-usage-sqlite-read-model/` 创建：

- `execution-process.md`：持续记录实现、关键决定、测试输出和问题。
- `execution-summary.md`：完成后记录自动化验证、性能数据、真实 Electron 验收路线和未覆盖门禁。
