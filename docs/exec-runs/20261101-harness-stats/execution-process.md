# Harness 统计（第一期）— 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261101-harness-stats.md`
- **设计文档**：`docs/design-docs/自进化的方案设计/11-Harness统计设计.md`
- **执行模式**：交互
- **开始时间**：2026-11-01
- **结束时间**：2026-11-01（代码与自动化验证完成；Electron 真实 Host 验收未做）
- **工作目录**：worktree `../actspace-agent-harness-stats`，分支 `feat/harness-stats`，未提交

## 执行时间线

### 步骤 1：T1 共享类型与常量

- **操作**：新建 `packages/shared/src/harness-stats.ts`：查询输入（时间、模式、模型、工作区、会话类型、版本）、7 个 tab 的结果类型、直方图档位、12 条规则阈值 `HARNESS_FLAG_RULES`；fixed renderer 契约加 `harnessStats.query / getStatus / cancel`。
- **验证**：`pnpm -s typecheck:contracts` 通过。

### 步骤 2：T2–T4 运行时采集（Sonnet 子智能体并行）

- **操作**：`cordis-tree` 加 `observer` 选项和 `harness-observer.ts`；新包 `@actspace/harness-stats`（recorder / sink / instrument / stats）；在 `boot.ts`、`agent-host-port`、`agent-runtime-plugin`、`harness-control.observeMount`、`HarnessGenerations {observe}` 接线；`harness-mount` 标出插件来源（evolved / builtin / user / unknown）。
- **决定**：做成 Host 插件包而不是 Harness 插件（D13）。
- **验证**：harness-stats 包 16 个测试通过；`harness-stats-boot.test.ts`、`harness-observer.spec.ts` 通过；契约矩阵重新生成，`test:contract-matrix` 通过。

### 步骤 3：T5–T7 Schema v15、会话日志汇总、统计文件汇总

- **操作**：`harness-stats-schema.ts` 定义 16 张会话级表与运行时表，接入 `read-model-sync` 的暂存 / 发布清单；`harness-stats-projection.ts` 在使用统计同一事务里汇总；`harness-stats-runtime-ingest.ts` 按字节游标增量读统计文件与 `selections.jsonl`；`harness-stats-archive.ts` 做删除归档。
- **决定**：汇总粒度从计划的“按天”改为“按小时”，24 小时范围也能精确筛选；行数仍只和活跃小时数相关。
- **验证**：`apps/desktop/src/main/test/harness-stats.test.ts` 5 个测试（富 fixture 全指标、同批重放幂等与分批一致、归档往返、统计文件增量含半行 / 变小重读 / 健康计数、选择记录）。

### 步骤 4：T8–T9 查询、规则、主进程服务与 IPC

- **操作**：`harness-stats-query.ts` 按 tab 查询、版本对比、12 条规则；Worker 加 `harness-query / harness-ingest / harness-fingerprint`；`usage-read-model.ts` 加查询（最多 8 个并发、拒绝重复 requestId）、后台同步与取消；IPC guard 与 handler。
- **决定**：`dataVersion` 由汇总库指纹决定，只有指纹变化才加一，避免“查询触发同步、同步又触发刷新”的循环。
- **验证**：`ipc-guards.test.ts` 补 `harnessStats.query`（合法 / 非法）与 `cancel`；`check:ipc-channels`、`test:ipc-channels` 通过。

### 步骤 5：T10 设置页（Sonnet 子智能体）

- **操作**：`components/harness-stats/*`、`api/harness-stats.ts`、`ui/PlainButton.tsx`、`ui/UnderlineTabs.tsx`；导航项与 SettingsPage 分支；mock `?mock=harness-stats&hsTab=`。
- **验证**：`harness-stats-hook.test.tsx`、`harness-stats-page.test.tsx` 通过；浏览器 mock 7 个 tab 浅色 / 深色截图（`tmp/hs-shots/`）。

### 步骤 6：T11 本机真实数据烟测与修正

- **操作**：对本机真实数据目录跑一遍汇总和每个 tab 的查询（只在本地看脱敏的数字，不保存内容）。
- **结果**：17 个会话、147,180 条事件，汇总约 1.07 秒；每个 tab 查询 0–8ms，结果 ≤ 15KB。本机数据里没有压缩、后台任务、`applied` 事件和 bash 环境明细，相应指标为 0 属实。
- **修正**：见“遇到的问题”。
- **服务调用开销**：Proxy 包装每次约 0.56µs，100 次约多 0.06ms。

## 遇到的问题

- **问题**：`harness_turn` 等按编号存的表没有行（轮数为 0）。
  - **原因**：汇总时只给“主键带 hour 的表”写维度，按编号存的表把维度丢了。
  - **应对**：`add()` 区分两类表，按编号存的表把维度写成普通列。
- **问题**：压缩后重读率恒为 0。
  - **原因**：重读要等 5 步窗口结束才写入，会话在窗口内结束时永远不写。
  - **应对**：读到一个压缩前读过的文件就立即累加（`reread` 列改为 sum）。
- **问题**：健康行如果写累计失败次数，读取时相加会重复计数。
  - **应对**：sink 改为写“上次成功写入以来新增的失败次数”，读取端相加；文件变小时归零重读。
- **问题**：read_file 的 `[Showing lines` 被大量误算为截断。
  - **原因**：主动带 `offset / limit` 的分段读取也会输出这个标记。
  - **应对**：调用参数带 `offset` 或 `limit` 的不算截断。
- **问题**：本机有 26 个 Skill 从未被读取，「值得关注」被刷屏。
  - **应对**：超过 3 个时合并成一条「N 个 Skill 从未被读取」，跳到上下文 tab。
- **问题**：工具表在约 830px 宽时被裁切。
  - **应对**：名称列 160px、去掉「最后使用」列、输出只显示平均、耗时只显示 P50；P95 和最后使用移到展开行。
- **问题**：全量测试里 `apps/cli` 的 `runtime-v2.test.ts` 失败：CLI 默认的临时运行在数据目录里多留了 `harness-stats/`，违反“临时运行只保留 Harness 代码和选择记录”。
  - **应对**：`bootProfileRuntime` 新增 `harnessStats?: boolean`（默认开）；CLI 在 `persistentArtifacts === false` 时传 `false`。`harness-stats-boot.test.ts` 补一条用例。
- **问题**：worktree 守卫拒绝复合命令和带空格的引号路径。
  - **应对**：用单条命令、Edit / Write 工具和 `tmp/hs-probe/shot.py` 截图脚本。

## 跳过或推迟的事项

- Electron 真实 Host 验收：页面打开、切 tab、改筛选、会话进行中自动刷新、抽查 5 个指标与日志一致、开 / 关 `ACTSPACE_HARNESS_STATS` 对比。计划写明交给后续统一验收。
- 统计文件月大小：本机还没有真实 Host 产生的统计文件，未测。
- 已知缺口（不影响本期指标）：
  - 插件没有显示名，只显示插件 ID。
  - 运行时契约里没有步数上限的具体值，「碰到步数上限」只按结束原因统计。
  - 压缩没有“摘要 token 平均值”。
  - 工具散点图里 `harness_inspect` 的标签会压到一个点。
  - 插件服务列表显示为 `service.method` 原文。
- Agent 查询工具：第二期。
