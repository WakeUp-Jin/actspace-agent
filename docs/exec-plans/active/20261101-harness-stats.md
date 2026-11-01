# Harness 统计（第一期：数据层 + 设置页）

## 目标

设置「活动」分组新增「Harness 统计」页，按方向 A demo 展示插件、工具、上下文、Skills、渐进式披露、压缩、Agent 循环、子 Agent、后台任务和 Harness 版本对比的全部指标，并支持时间、模式、模型、工作区、会话类型、版本筛选。数据层同时为第二期的 Agent 查询工具准备好：同一套查询和「值得关注」规则。设计见 [11-Harness统计设计](../../design-docs/自进化的方案设计/11-Harness统计设计.md)，视觉见 [harness-stats-demo.html](../../design-docs/frontend/harness-stats-demo.html)（方向 A）。

## 范围

- 包含：设计文档第 3–7 节列出的全部指标；插件挂载层运行时采集；统计文件写入；使用统计 Worker 内的汇总表、增量同步、按 tab 查询；IPC；设置页 7 个 tab；mock；测试与验证。
- 不包含：Agent 查询工具（第二期）；新增会话日志事件；运行时数据按会话归属；统计页里的删除 / 修改操作；Harness 统计的会话直读降级。

## 背景

- 相关文档：[11-Harness统计设计](../../design-docs/自进化的方案设计/11-Harness统计设计.md)、[10-V1实现与使用说明](../../design-docs/自进化的方案设计/10-V1实现与使用说明.md)、`docs/references/front-新功能开发清单.md`（IPC 七步）。
- 相关代码路径：
  - 插件挂载：`packages/composition/cordis-adapter/src/cordis-tree.ts:74-80`、`packages/composition/boot/src/harness-mount.ts`、`packages/core/runtime/src/startup/boot.ts`
  - 版本：`packages/composition/boot/src/harness-generations.ts`、`<dataRoot>/harness-state/selections.jsonl`
  - 使用统计 Worker：`apps/desktop/src/main/runtime-v2/usage-read-model-*.ts`、`read-model-sync.ts`、`usage-journal-projection.ts`
  - 披露重放：`packages/context/engine/src/state.ts`（`applyStateEvent`）
  - 页面：`apps/desktop/src/renderer/components/SettingsNav.tsx`、`SettingsPage.tsx`、`UsageStatisticsPage.tsx`、`renderer/mock/handlers.ts`
- 已知约束：
  - Cordis 版本有门禁（`cordis-types.ts`、`cordis-admission.ts`），只能在 adapter 层包装，不能改 Cordis。
  - 部分服务对象使用 `#private` 字段，Proxy 必须 `Reflect.apply` 回原对象。
  - dataRoot 只经 Host 选项进入 runtime，记录器和写文件必须放在 Host 侧启动代码，不能做成 Harness 插件。
  - Schema 升级沿用整库重建（14 → 15）。
  - 页面颜色只用主题 token，`check:frontend-tokens` 必须通过。

## 风险

- 风险：Proxy 包装改变服务对象的行为（身份比较、私有字段、Cordis 自带代理）。
  - 缓解：只包函数属性；同插件同对象缓存同一 Proxy；`ACTSPACE_HARNESS_STATS=0` 一键关闭且关闭时不包；默认 Harness 启动、挂载、HMR 切换、真实 Host 端到端测试全跑。
- 风险：首次补历史时间长，或 `request/context` 解析拖慢使用统计。
  - 缓解：与使用统计共用一次读取，只解析需要的三块；记录真实数据目录下的补历史耗时和单会话增量耗时，写入执行摘要。
- 风险：旧会话缺少字段（无 run 事件、manifest 不可比、旧版审批字段）。
  - 缓解：记为“未知版本”、“缺少明细”，在页面上显示数量，不猜。
- 风险：统计文件写入影响 Host 性能。
  - 缓解：只在内存累加、每 60 秒追加一次；基准测试对比开 / 关统计的工具调用耗时。

## 里程碑

1. T0 文档：设计文档、本计划、索引（已完成，等用户审阅）。
2. T1–T4 运行时采集：契约、挂载层包装、记录器与统计文件、接线。
3. T5–T9 数据层：Schema、会话日志汇总、统计文件汇总、查询与规则、主进程服务与 IPC。
4. T10 页面：7 个 tab、筛选、按需加载、mock。
5. T11–T12 验证与收尾。

### 任务明细

| # | 任务 | 主要文件 | 完成标准 |
|---|---|---|---|
| T0 | 设计文档、执行计划、索引 | `docs/design-docs/自进化的方案设计/11-*.md`、本文件 | 用户审阅通过 |
| T1 | 共享类型与常量：tab、筛选、每个 tab 的结果类型、规则阈值、直方图分档、统计文件行格式 | `packages/util/shared/src/harness-stats.ts`、`packages/util/shared/src/ipc.ts` | 类型被 main / renderer / worker 共同引用 |
| T2 | 挂载层通用观察口：`cordis-tree` 挂载选项接受可选的观察者，有就把插件 ctx 交给它包装，没有就原样挂载 | `packages/composition/cordis-adapter/src/cordis-tree.ts` 及类型 | 无观察者时行为与现在完全一致（现有测试全过）；有观察者时每个插件调用一次 |
| T3 | 新 Host 插件包 `@actspace/harness-stats`：观察者（包 `get` 得服务 Proxy、包 `on / once` 计监听、包 `apply` 计加载、`tools.runtime.register` 记工具归属）、内存累加器（小时 × 版本 × 插件 × 类型 × 名称 × 方法、直方图、2 万键上限）、统计文件写入（60 秒、退出时、失败计数）、插件清单记录 | `packages/harness-evolution/harness-stats/*` | 单测覆盖：私有字段服务可调用、同对象同 Proxy、Promise 计时、抛错计数、累加、换小时、超上限立即写、写失败保留数据 |
| T4 | 接线：Host 启动时创建 `@actspace/harness-stats`，把观察者经 `harness-mount` 传给挂载层，带上当前版本；`ACTSPACE_HARNESS_STATS=0` 时不创建；Host 退出时写文件 | `packages/core/runtime/src/startup/boot.ts`、`packages/composition/boot/src/harness-mount.ts` | 真实 Host 跑一轮后 `<dataRoot>/harness-stats/` 有内容；`check:packages`、`gen:contract-matrix --check`、`check:harness-events` 通过 |
| T5 | Schema v15：设计文档 4.1、4.2 的全部表与索引，加入同步表清单；会话移出目录前把该会话的汇总追加到 `archived-sessions.jsonl`，重建时读回 | `usage-read-model-schema.ts`、`usage-read-model-worker.ts`、`read-model-sync.ts`、新建 `harness-stats-archive.ts` | 旧库自动重建；删除会话后统计仍在，重建后仍在；运行时表保留 |
| T6 | 会话日志汇总：扩展投影白名单（只取元数据），一次读取同时产出使用统计与 Harness 统计；披露状态重放（含查索引与索引转化）；压缩拿掉的工具输出（`surface/replaced` 编号对 `harness_tool_output`）；Harness 版本关联（run 事件 → 父会话 → 未知） | `usage-journal-projection.ts`、新建 `harness-stats-projection.ts`、`harness-disclosure-replay.ts` | 每个指标有 fixture 单测（含旧日志缺字段）；增量与整会话重建结果一致 |
| T7 | 统计文件汇总：按文件字节偏移增量读取、只读完整行、文件变小时重建；读 `selections.jsonl` 得版本列表 | 新建 `harness-stats-file-ingest.ts` | 单测覆盖半行、跨月文件、截断重建 |
| T8 | 查询与规则：每个 tab 一个 SQL 查询函数、直方图求 P50 / P95、筛选选项查询、设计文档第 6 节的 12 条规则 | 新建 `harness-stats-queries.ts`、`harness-stats-flags.ts` | 每个 tab 有查询单测；每条规则有命中、不命中、样本不足三个用例 |
| T9 | 主进程服务与 IPC：`harnessStats.query / getStatus / cancel`，查询时先返回现有结果并带同步进度，同步完成后通知；IPC 七步 | `apps/desktop/src/main/runtime-v2/harness-stats-service.ts`、`fixed-renderer-ipc.ts`、`packages/util/shared/src/desktop-bridge/contract.ts`、preload、`renderer/mock/handlers.ts` | `check:ipc-channels`、`test:ipc-channels`、`check:renderer-bridge` 通过 |
| T10 | 设置页：导航项、页面骨架、筛选条、4 张指标卡、7 个 tab、SVG 图表（散点、趋势、堆叠条、直方图、悬停提示）、`useHarnessStatsTab`（按需、缓存、2 秒防抖刷新当前 tab）、同步进度条、mock 数据 `?mock=harness-stats` | `renderer/components/harness-stats/*`、`SettingsNav.tsx`、`SettingsPage.tsx` | renderer 测试覆盖按需加载、缓存、筛选只重查当前 tab；浅色 / 深色 mock 截图与 demo 方向 A 对齐 |
| T11 | 验证：见下方“验证方式” | — | 全部通过，结果写入执行摘要 |
| T12 | 收尾：`docs/histories` 记录、learnings、相关文档同步、计划移入 completed | `docs/histories/*`、本文件 | 索引与文档无过期描述 |

T2–T4 与 T5–T8 互不依赖，可以并行；T9 依赖 T1、T5–T8；T10 可先用 mock 开发，接 T9 收尾。

## 验证方式

- 命令：
  - `pnpm typecheck`
  - `pnpm test`（重点：cordis-adapter、harness-stats、desktop main、desktop renderer、shared）
  - `pnpm check:packages`、`pnpm gen:contract-matrix --check`、`pnpm check:harness-events`
  - `pnpm check:ipc-channels`、`pnpm test:ipc-channels`、`pnpm check:renderer-bridge`
  - `pnpm check:frontend-tokens`
- 手工检查：
  - 浏览器 `?mock=harness-stats` 7 个 tab 浅色 / 深色截图，与 demo 方向 A 对比。
  - 真实 Host：跑几轮带工具调用、压缩、子 Agent、后台任务的会话，打开统计页核对数字与会话日志一致（抽查 5 个指标）。
  - 开 / 关 `ACTSPACE_HARNESS_STATS` 各跑一次，确认关闭时无统计文件且行为一致。
- 观测检查：
  - 记录本机真实数据目录的首次补历史耗时、单会话增量耗时、打开各 tab 的查询耗时、统计文件月大小。
  - 对比开 / 关统计时 100 次服务调用的耗时差。
- Electron 实机：页面在 Electron 中打开、切 tab、改筛选、会话进行中自动刷新（交给后续统一验收，不在本计划内宣称通过）。

## 进度记录

- [x] T0 设计文档与执行计划（2026-11-01，用户确认 A–E）。
- [x] T1 共享类型与常量（2026-11-01）。
- [x] T2 挂载层包装（2026-11-01）。
- [x] T3 记录器与统计文件（2026-11-01；健康行改为写增量）。
- [x] T4 接线（2026-11-01）。
- [x] T5 Schema v15（2026-11-01；汇总粒度改为按小时，见决策记录）。
- [x] T6 会话日志汇总（2026-11-01）。
- [x] T7 统计文件汇总（2026-11-01）。
- [x] T8 查询与规则（2026-11-01）。
- [x] T9 主进程服务与 IPC（2026-11-01）。
- [x] T10 设置页（2026-11-01；浏览器 mock 浅色 / 深色截图已看）。
- [x] T11 验证（2026-11-01；自动化与本机数据烟测完成，Electron 实机未做，见执行摘要）。
- [x] T12 收尾（2026-11-01；设计文档同步、histories、执行文档）。计划暂留 active，等 Electron 真实 Host 验收后移入 completed。

## 决策记录

- 2026-11-01：用户确认 D1–D12（见设计文档第 2 节），方向 A，加载策略按建议。
- 2026-11-01：调研确认会话级指标全部可从现有日志算出，不新增日志事件。
- 2026-11-01：用户确认：运行时统计做成独立的 Host 插件包 `@actspace/harness-stats`，挂载层只加通用观察口（Harness 插件无法包装兄弟插件、没有数据目录、会被自进化删改、切版本会重挂载）。
- 2026-11-01：用户确认保留「压缩拿掉的工具输出」（`surface/replaced`）与「查睡眠索引 / 索引转化」（`indexPaths` + `read_file`），均从现有日志算出；更正此前“无法识别查索引”的判断。
- 2026-11-01：用户确认会话删除时把汇总追加到归档文件，统计永久保留。
- 2026-11-01：用户确认 12 条「值得关注」规则阈值按设计文档。
- 2026-11-01：运行时数据只按时间和版本归属，不建立每步异步上下文（以不消耗资源为前提）。
- 2026-11-01（实施中）：会话级汇总从“按天”改为“按小时”，24 小时范围也能精确筛选，查询仍只做行相加。
- 2026-11-01（烟测后）：带 `offset / limit` 的 read_file 不算截断；压缩后重读读到即累加；Skill 从未被读取超过 3 个合并成一条；健康行写增量；`dataVersion` 由汇总库指纹决定。

## 执行模式

- **交互模式**：涉及插件挂载层与 Schema 升级，用户在线审阅。

## 执行文档

执行开始时在 `docs/exec-runs/20261101-harness-stats/` 创建 `execution-process.md` 与 `execution-summary.md`。
