# 轨迹页流式拆分 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261014-trajectory-streaming-split.md`
- **执行过程**：`docs/exec-runs/20261014-trajectory-streaming-split/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（E1、T0–T6）。改动未提交，等用户验收。

## 核心变更清单

R = `apps/desktop/src/renderer`。

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 拆分与流式层 | `R/trajectory/live.ts`（新）、`R/trajectory/node-data.ts`（新） | 正在输出的 chunk 组与定稿节点分开；累加器只折叠新 chunk；流式 cell 按 recordId 替换占位 |
| builder 接收占位 | `R/trajectory/builder.ts` | `{ placeholders }` 时正在输出的助手只生成空占位；chunk 分组不再复制数组；搜索文本移出；840 → 747 行 |
| 增量搜索索引 | `R/trajectory/search-index.ts`（新）、`contract.ts` | 照 DSH `TrajectorySearchIndex`，按 recordId 复用文本，3 秒节流 |
| 视图装配 | `R/components/TrajectoryView.tsx`、`trajectory/TrajectoryTable.tsx`、`trajectory/use-trajectory-selection.ts` | 定稿层按 `settledKey` 缓存；表格和详情换成流式 cell；时间轴只跟定稿布局 |
| 删掉时间轴签名 | `R/trajectory/timeline.ts` | 定稿布局流式期间不变，签名不再需要 |
| 按事件缓存转换（E1） | `packages/client/src/sessions/trajectory.ts` | 同一事件对象只深拷贝一次 |
| fixture 与测量 | `R/trajectory/fixtures.ts`、`use-trajectory-source.ts`、`R/test/trajectory-streaming-perf.test.ts` | `streaming-long`（2000 chunk）；`TRAJECTORY_PERF=1` 时测帧耗时 |
| 测试 | `R/test/trajectory-live.test.ts`、`trajectory-search-index.test.ts`（新），`trajectory-streaming.test.tsx`、`trajectory-builder.test.ts`、`trajectory-layout.test.ts`，`packages/client/src/test/trajectory-projection.test.ts`（新） | 等价性、重算次数、详情变长、搜索节流 |
| 文档 | `front-DSH轨迹能力迁移规范.md`、`FRONTEND_VERIFICATION.md`、对齐计划及其摘要、histories | 流式一节与数据流图 |

## 人工验证指引

### 必须验证

1. **真实会话流式**
   - 验证方式：`pnpm dev`，在一个会话里让模型写一段长回复，输出过程中切到轨迹。
   - 预期结果：
     - 最后一行助手文字逐段变长，不闪；
     - 点这一行打开详情的「预览」，文字也跟着变长；
     - 在搜索框输入刚出现的一段字，最多 3 秒内能搜到；
     - 回复结束、工具调用出现后，行和时间轴正常更新。

2. **长会话流式回放**
   - 验证方式：`pnpm --filter @actspace/desktop dev:renderer`，打开 `http://127.0.0.1:5173/?mock=long-session&trajectoryFixture=streaming-long`，点标题栏「查看执行轨迹」。
   - 预期结果：最后一行持续变长约 12 秒，滚动和输出都不卡；对照 `shots/02-light-streaming-long.png`。

### 建议验证

1. **性能数字复测**
   - 验证方式：`TRAJECTORY_PERF=1 pnpm --filter @actspace/desktop exec vitest run src/renderer/test/trajectory-streaming-perf.test.ts`
   - 预期结果：`split` 两行的 `total` p95 小于 2ms（本机 0.25ms）。

## Agent 已完成的验证

- 验收指标：

  | 指标 | 要求 | 结果 |
  | --- | --- | --- |
  | 流式每帧计算耗时（`streaming-long` 2000 chunk，后段） | p95 < 2ms | p95 0.252ms（基线 24.83ms） |
  | 首帧之后 builder、`deriveLayout`、`deriveTimeline` 调用 | 0 次 | 0 次（单测计数；perf 测试 30 帧只建一次） |
  | 累加器 | 每个 chunk 只处理一次 | 处理数等于 chunk 数 |
  | 浏览器帧间隔（`streaming-long`，1440×900） | p95 ≤ 16.8ms | p95 16.8ms（769 帧） |
  | 流式行重挂载 | 0 次 | 0 次，始终同一节点 |
  | 等价性（`streaming` 逐帧） | 与不拆分路径相等 | 全部帧 cells 和请求视图 `toEqual` |

- 搜索：删除旧实现前，4 个 fixture、10 个查询的新旧结果完全相同。
- `pnpm --filter @actspace/desktop typecheck`：通过。
- `pnpm --filter @actspace/desktop test`：1866 条通过，1 条失败（`review-workspace-watcher.test.ts`，单独重跑 3 次都通过，与本次改动无关）。
- `packages/client` 测试 24 条通过，build 通过。
- `check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`、`check:current-docs`：通过。
- Electron：`verify-trajectory-electron.mjs` 11 项全部通过，`shots/03-electron-trajectory.png`。

## 已知风险和遗留事项

- **普通事件仍全量重建**：工具调用、工具结果、请求头到达时，定稿层重建一次。`streaming-long`（4232 个节点）约 10ms，工具调用密集时仍可能偶尔掉帧。要彻底解决需要增量 builder（方案 B），本计划不做。
- **搜索最多滞后 3 秒**：与 DSH 一致，有意保留。
- **没有验证**：真实 Provider 的流式会话没在 Electron 里跑（隔离环境没有模型 key）。
- **全量测试的 watcher 用例**：满载时偶发失败，单独运行通过。
- **共享文件**：`packages/client/src/sessions/trajectory.ts` 只改了一个函数；轨迹相关文件里还有上一轮（DSH 对齐）未提交的改动，本次在其上修改，提交时两轮一起提。

## 后续建议

- 若工具密集的长会话仍有卡顿，再立计划做增量 builder：按 Journal 序号追加，只重建最后一个 Turn。

## 验收后修复（2026-10-15）

验收报告：`acceptance-20261015.md`。处理记录：`docs/histories/2026-10/20261015-2100-trajectory-acceptance-fixes.md`。

| 问题 | 处理 |
|------|------|
| B03 关闭 Thinking 失败 | 适配器删除值为 undefined 的请求选项；运行失败原因在轮次末尾以红色状态行显示 |
| B04 Markdown 列表无标记 | 轨迹 Markdown 恢复编号、圆点、嵌套缩进（照 DSH） |
| I01 watcher 全量偶发失败 | 测试竞态：等探针事件后再断言；实现不变 |
| 思考默认展开 | 照 DSH，带思考的记录默认展开，切换只记最近操作的记录 |
| B01 / B02 | 未定位根因，用户决定不加兜底；待复验 |
| O01 偶发长帧 | 未处理 |

验证：desktop typecheck 通过；desktop 全量测试 1873 条通过（含 watcher）；4 个检查脚本通过；B04 在浏览器浅色、深色下测量通过。真实界面复验说明见 `tmp/codex-acceptance/brief-20261015-recheck.md`，尚未运行。
