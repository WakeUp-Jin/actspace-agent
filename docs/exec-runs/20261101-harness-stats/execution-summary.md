# Harness 统计（第一期）— 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261101-harness-stats.md`
- **执行过程**：`docs/exec-runs/20261101-harness-stats/execution-process.md`
- **执行模式**：交互
- **执行结果**：部分完成。T1–T12 代码、自动化验证和本机数据烟测都完成了；Electron 真实 Host 验收还没做；改动未提交

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 共享契约与规则阈值 | `packages/util/shared/src/harness-stats.ts`、`runtime-v2/fixed-renderer.ts`、`desktop-bridge/contract.ts` | 面板和第二期 Agent 查询用同一套类型和阈值 |
| 挂载层观察口 | `packages/composition/cordis-adapter/src/harness-observer.ts`、`cordis-tree.ts` | 所有插件不改代码就能被统计；没有观察者时原样挂载 |
| 运行时统计 Host 插件包 | `packages/harness-evolution/harness-stats/*`、`runtime/src/startup/boot.ts`、`harness-control`、`boot/harness-mount.ts` | 服务 / 监听 / 依赖 / 加载按小时汇总写进 `harness-stats/YYYY-MM.jsonl`；`ACTSPACE_HARNESS_STATS=0` 关闭 |
| 会话日志汇总（Schema v15） | `apps/desktop/src/main/runtime-v2/harness-stats-{schema,projection}.ts`、`read-model-sync.ts` | 与使用统计同一次读取、同一事务；按小时 × 版本 × 模式 × 模型汇总 |
| 统计文件、选择记录、归档 | `harness-stats-runtime-ingest.ts`、`harness-stats-archive.ts` | 按字节游标增量读；会话删除后统计保留 |
| 查询、版本对比、12 条规则 | `harness-stats-query.ts` | 按 tab 的 SQL 聚合，在 Worker 中执行 |
| 主进程服务与 IPC | `usage-read-model{,-worker}.ts`、`fixed-renderer-ipc.ts`、`ipc/guards.ts` | 先返回已有数据再后台同步；`dataVersion` 由汇总库指纹决定 |
| 设置页 | `renderer/components/harness-stats/*`、`SettingsNav.tsx`、`SettingsPage.tsx`、mock | 7 个 tab、筛选、指标卡、图表、按需加载与缓存 |

## 人工验证指引

### 必须验证

1. **Electron 打开统计页**
   - 验证方式：`pnpm dev` 启动，设置 → 活动 →「Harness 统计」，依次切 7 个 tab，切换浅色 / 深色。
   - 预期结果：首屏立即出数据；首次打开时顶部显示补历史进度，结束后当前 tab 自动刷新，之后不会反复刷新。

2. **数字和会话日志一致**
   - 验证方式：跑一轮包含工具调用、审批、子 Agent、后台任务的会话（能触发压缩更好），抽查工具调用次数、失败次数、轮数、子 Agent 次数、压缩次数这 5 项。
   - 预期结果：与会话日志里对应事件的条数一致。

3. **运行时统计文件**
   - 验证方式：会话跑完后等 60 秒或退出 Host，查看 `<dataRoot>/harness-stats/YYYY-MM.jsonl`，再打开插件 tab 和运行 tab。
   - 预期结果：文件里有服务 / 监听 / 加载的小时级汇总，不含参数和内容；插件 tab 显示加载次数和服务调用。

4. **关闭统计**
   - 验证方式：`ACTSPACE_HARNESS_STATS=0 pnpm dev` 跑同样的会话。
   - 预期结果：不生成新的统计文件，会话行为与开启时一致；会话级 tab 照常有数据。

### 建议验证

1. **会话进行中自动刷新**：统计页开着时在另一个窗口发消息，约 2 秒后当前 tab 更新。
2. **筛选**：设置模式 / 模型 / 工作区后，插件 tab 的运行时部分显示“只支持按时间和版本筛选”。
3. **删除会话后统计保留**：删除一个会话，总调用数不变，`archived-sessions.jsonl` 多一行。

## Agent 已完成的验证

- `pnpm typecheck`（全仓）：通过（修复 CLI 后重跑仍通过）。
- `pnpm test`：前 6 步通过；`test:current-docs` 失败，原因与本次改动无关（旧验收文档引用的截图被 `.gitignore` 忽略，新 worktree 里没有这些文件，失败列表里没有本次的文档）。之后的步骤单独跑：见下方。
- 剩余测试链：contract-matrix、renderer-bridge、harness-events、harness-recovery、agent-host:process、ipc-channels 全部通过；`test:frontend-tokens` 有 1 条失败，与本次无关（`PurposePicker.tsx` 原生按钮从 3 降到 2，可以收紧基线；该文件本次没改，来自 main）。
- `pnpm -r --no-bail --if-present test`：全部包通过（合计 3,740 个测试；desktop 267 个文件 / 2,113 个测试）。第一次跑时 `apps/cli` 的 `runtime-v2.test.ts` 失败（临时运行多留了 `harness-stats/`），已修复，见执行过程。
- **合并 main（PR #27 架构优化）之后重跑**：`pnpm typecheck`、`check:packages`、`check-package-readmes` 通过；`pnpm -r --no-bail --if-present test` 全部通过（合计 3,784 个测试；desktop 262 个文件 / 2,133 个测试）；根目录检查链除 `test:current-docs`（同上，截图未入库）外全部通过，`test:frontend-tokens` 在新 main 上也通过了。
- `apps/desktop`：两个 tsconfig 的 `tsc --noEmit` 通过；全量 vitest 通过；Harness 统计相关的 main / renderer 测试 24 个全部通过。
- `@actspace/harness-stats`：16 个测试通过，typecheck 通过。
- `check:ipc-channels`、`test:ipc-channels`、`check:renderer-bridge`、`check:frontend-tokens`、`check:packages`、`check:harness-events`、`test:contract-matrix`：通过。
- 浏览器 mock `?mock=harness-stats`：7 个 tab 浅色 / 深色截图已看，工具表在常见窗口宽度下不再被裁切。
- 本机真实数据烟测：17 个会话 / 147,180 条事件，汇总约 1.07 秒；各 tab 查询 0–8ms，结果 ≤ 15KB。
- 服务调用开销：Proxy 包装每次约 0.56µs，100 次约多 0.06ms。

## 已知风险和遗留事项

- Electron 真实 Host 验收没做（见上方“必须验证”）。
- 统计文件每月大小未测：本机还没有真实 Host 产生的统计文件。
- 本机数据没有压缩、后台任务、`applied` 披露事件和 bash 环境明细，这几项只由单测 fixture 覆盖。
- 页面缺口：插件只显示 ID，没有显示名；「碰到步数上限」只按结束原因统计（运行时契约里没有上限值）；压缩没有摘要 token 平均值；散点图 `harness_inspect` 标签会压到一个点；插件服务列表显示 `service.method` 原文。

## 后续建议

- Electron 验收通过后提交、开 PR，把计划移入 `completed`。
- 第二期：Agent 查询工具，复用 `queryHarnessStats` 和 `HARNESS_FLAG_RULES`。
