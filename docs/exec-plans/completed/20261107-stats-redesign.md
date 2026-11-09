# 统计页重做（使用统计 + Harness 统计）

## 目标

按 demo 第 4 版重做「使用统计」和「Harness 统计」两页：使用统计看用了多少，Harness 统计看 Harness 好不好。只算页面上显示的数：不显示的数据停止采集、删表，统计库 Schema 17 → 18 整库重建一次。

## 范围

- 包含：使用统计投影与 rollup（TTFT、输出时间、用途、重试，不再写工具行）、Harness 投影瘦身与新增（缓存被打断、工具执行耗时合计、Bash 命令、Skill 文件）、运行时统计停记 dependency / health、Worker 查询、IPC 类型与守卫、两页 renderer 全部重写、浏览器 mock、单测、文档。
- 不包含：Agent 查询工具（自进化第二期）；统计导出；运行时统计按会话归属。

## 背景

- 设计：[统计页规范](../../design-docs/frontend/front-统计页规范.md)；采集机制：[Harness 统计设计](../../design-docs/自进化的方案设计/11-Harness统计设计.md)；视觉：`docs/design-docs/frontend/stats-redesign-demo.html`。
- 代码：`apps/desktop/src/main/runtime-v2/`（`usage-*`、`harness-stats-*`、`read-model-sync.ts`、`bash-programs.ts`）、`packages/client/client/src/sessions/chat.ts`、`packages/util/shared/src/{ipc,harness-stats,settings}.ts`、`packages/harness-evolution/harness-stats/src/`、`apps/desktop/src/renderer/components/{UsageStatisticsPage.tsx,usage/,harness-stats/}`、`WorkbenchLayout.tsx`、`renderer/mock/`。
- 约束：Schema 版本在 `usage-read-model-schema.ts` 与 `usage-read-model-worker.ts` 两处；rollup 度量列表在 `usage-rollups.ts` 与 `usage-batch-write.ts` 两处；归档读回按当前表结构过滤列和表。

## 风险

- 重建整库耗时：沿用现有进度与先显示已有结果；只升一次版本。
- 去掉工具行影响现有消费方（`indexed-usage.ts`、回退查询、旧测试）：同一批改完，`UsageActivityKind` 收窄后由类型检查兜底。
- 本机时区分桶与 rollup 的 UTC 小时：时区偏移按整小时以外（如 +5:30）时，小时 rollup 分桶有半小时误差；只在 `utcOffsetMinutes % 60 !== 0` 时走明细路径。
- 工作区筛选走明细扫描：只按会话集合走 `usage_activity_session_idx`，测大库耗时。

## 里程碑

1. 数据层（顺序做，主智能体自己写）：T1–T8。
2. 页面（两页互不依赖，可并行）：T9–T11。
3. 验证与文档：T12–T14。

## 任务

| # | 任务 | 文件 |
|---|---|---|
| T1 | 使用统计投影：`compactUsageEvent` 保留 `firstTokenAt`；请求行算 `ttftMs / decodeMs`；不再生成工具行；`UsageActivityRow` 加字段、`UsageActivityKind` 收窄 | `chat.ts`、`usage-journal-projection.ts`、`ipc.ts`、`indexed-usage.ts`、`usage-aggregates.ts` |
| T2 | `usage_activity` 新列与生成列；rollup 维度 `purpose`、度量 `ttft_ms, ttft_samples, decode_ms, decode_tokens, retries`；Schema 18 | `usage-read-model-schema.ts`、`usage-activity-write.ts`、`usage-rollups.ts`、`usage-batch-write.ts`、`usage-read-model-worker.ts` |
| T3 | Harness 表瘦身、删表、新表 `harness_bash_rollup / harness_skill_file`、新列 `harness_changed / duration_ms / duration_samples` | `harness-stats-schema.ts` |
| T4 | Harness 投影：删掉不用的处理与状态；加缓存打断摘要、执行耗时合计、Bash 解析与累加、Skill 文件 | `harness-stats-projection.ts` |
| T5 | 运行时统计停记 dependency / health；Worker 读取时忽略旧行；健康表移除 | `packages/harness-evolution/harness-stats/src/{instrument,sink}.ts`、`harness-stats-ingest*`、`usage-read-model-worker.ts` |
| T6 | Harness 查询重写为新 kind（options / overview / usage-vs / context / disclosure / plugins / versions），一次 GROUP BY 版本算上一版本对比；flag 规则删两条 | `harness-stats-query.ts`、`harness-stats.ts`（shared） |
| T7 | 使用统计查询：summary 增失败 / 重试；timing；series（本机时区）；heatmap（98 天）；模型拆分；工具 / 命令 / Skills / 子 Agent / 辅助行（读 Harness 表）；工作区筛选；filterOptions；回退时 `harnessUnavailable` | `usage-read-model-worker.ts`、`ipc.ts`、`guards.ts`、`usage-read-model.ts` |
| T8 | 主进程单测：投影、Schema 重建、归档读回、新查询 | `apps/desktop/src/main/test/` |
| T9 | 共用组件：指标卡、卡片、环形图、柱状图、热力图、排行滚动列表、详情小卡、可排序表格、下划线 tab；样式文件 | `renderer/components/stats/` |
| T10 | 使用统计页重写 + `WorkbenchLayout` 取数 + 偏好字段 + mock | `UsageStatisticsPage.tsx`、`usage/`、`WorkbenchLayout.tsx`、`settings.ts`、`sanitize.ts`、`renderer/mock/` |
| T11 | Harness 统计页重写 + hook 改为按 kind 并行 + mock | `harness-stats/`、`renderer/mock/harness-stats-fixture.ts` |
| T12 | renderer 测试改写 | `renderer/test/` |
| T13 | `pnpm` 类型检查、单测、lint、`check:frontend-tokens`；浏览器 mock 两页浅 / 深、三档宽度截图 | — |
| T14 | 文档：设置页规范 §10/§11 指向新规范；Harness 统计设计 §4/§6/§7 更新；前端 README 加索引；执行记录 | `docs/` |

## 验证方式

- 命令：`pnpm -w typecheck`（或仓库现有的类型检查脚本）、`pnpm --filter @actspace/desktop test`、相关包测试、`pnpm check:frontend-tokens`、lint。
- 手工检查：浏览器 mock 两页截图（浅 / 深，928 / 820 / 600），悬停卡、跳转、tab、排序。
- 观测检查：真实数据库从 v17 打开自动重建为 v18，重建后两页有数据（Electron，由用户或 Codex 验收）。

## 进度记录

- [x] 2026-11-07 demo 第 4 版确认；数据调查完成；设计规范写定。
- [x] 2026-11-07 T1–T8 数据层：主进程 615 测试通过，harness-stats 包 16 通过，client 79 通过；`tsconfig.electron.json` 通过。
- [x] 2026-11-08 T9 共用件、T10 使用统计页（测试 12 条，渲染层不含 harness 2125 通过）。
- [x] 2026-11-08 T11 Harness 页（并行分支写，主线程审过、跑过检查）。
- [x] 2026-11-08 T14 文档同步（11-Harness统计设计、设置页规范、README、FRONTEND_VERIFICATION）。
- [x] 2026-11-08 T12–T13：渲染层 2150 通过、主进程 615 通过；根 `typecheck`、`typecheck:contracts`、`check:repo`、`check:docs`、`check:hot-path-reads`、`check:ipc-channels`、`check:renderer-bridge` 通过；浏览器 mock 两页浅 / 深、1240 / 820 / 600 截图已看。
- [ ] Electron 真实数据走查（待用户）。

## 决策记录

- 2026-11-07：不显示的数据停采并删表（用户：「少存少算」「改表没关系」）。
- 2026-11-07：「缓存被打断」只记 0/1 并对比两组实际命中率，不估算「多花的 token」（不可靠）。
- 2026-11-07：`usage_activity` 不再写工具行，工具相关数全部来自 Harness 表（去掉重复数据）。
- 2026-11-07：工作区筛选不进 rollup，走会话集合 + 明细（避免 rollup 行数按工作区放大）；Harness 页去掉工作区筛选。
- 2026-11-07：两页「30 天」统一为 30 × 24 小时；趋势与热力图按本机时区分桶。

## 执行模式

- **交互模式**。

## 执行文档

`docs/exec-runs/20261107-stats-redesign/execution-process.md`、`execution-summary.md`。
