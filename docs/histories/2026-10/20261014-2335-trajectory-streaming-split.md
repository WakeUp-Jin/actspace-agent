## [2026-10-14 23:35] | Task: 轨迹页流式拆分（定稿层与流式层）

### Execution Context

- Agent ID: /root
- Base Model: Claude Opus 5.5（主智能体，未使用子智能体）
- Runtime: Claude Code CLI，本地开发工作区

### User Query

> 方案 A、表格照 DSH、搜索按建议、加验收指标；E1「加吧，开始执行计划」（计划：docs/exec-plans/active/20261014-trajectory-streaming-split.md）。

### Changes Overview

**Scope:** `apps/desktop`（renderer 轨迹）、`packages/client`（`projectTrajectoryWindow`）

**Key Actions:**

- **拆分**：新增 `live.ts`，正在输出的 chunk 组与定稿节点分开，定稿键不变时 builder、布局、时间轴都不重算。
- **流式层**：累加器每帧只折叠新 chunk；表格和详情按 recordId 把占位 cell 换成流式 cell。
- **搜索**：新增 `TrajectorySearchIndex`，按 recordId 增量，3 秒节流；builder 不再生成搜索文本。
- **E1**：`projectTrajectoryWindow` 按事件对象缓存转换结果。
- **验证**：逐帧等价性测试、重算次数计数、`streaming-long` fixture 与 `TRAJECTORY_PERF=1` 帧耗时测量（p95 24.83ms → 0.25ms）、浏览器帧间隔、Electron 脚本。

### Design Intent (Why)

长会话流式时，每个 chunk 都会让整条轨迹深拷贝、重建、重算布局，2000 chunk 时一帧约 25ms。DSH 用 `finalized` + `streamingCells` 把正在输出的那条助手单独处理。这里照它在视图层拆开，并用 Journal 只追加的性质做定稿键，chunk 到达时完全跳过定稿层。

### Files Modified

- `apps/desktop/src/renderer/trajectory/live.ts`（新）、`node-data.ts`（新）、`search-index.ts`（新）
- `apps/desktop/src/renderer/trajectory/builder.ts`、`contract.ts`、`timeline.ts`、`index.ts`、`fixtures.ts`
- `apps/desktop/src/renderer/components/TrajectoryView.tsx`、`trajectory/TrajectoryTable.tsx`、`trajectory/use-trajectory-selection.ts`、`trajectory/use-trajectory-source.ts`
- `apps/desktop/src/renderer/test/trajectory-live.test.ts`（新）、`trajectory-search-index.test.ts`（新）、`trajectory-streaming-perf.test.ts`（新）、`trajectory-streaming.test.tsx`、`trajectory-builder.test.ts`、`trajectory-layout.test.ts`
- `packages/client/src/sessions/trajectory.ts`、`packages/client/src/test/trajectory-projection.test.ts`（新）
- `docs/design-docs/frontend/front-DSH轨迹能力迁移规范.md`、`docs/FRONTEND_VERIFICATION.md`、`docs/exec-plans/active/20261014-trajectory-streaming-split.md`、`docs/exec-plans/active/20261014-trajectory-dsh-parity.md`、`docs/exec-plans/README.md`、`docs/exec-runs/20261014-trajectory-streaming-split/*`、`docs/exec-runs/20261014-trajectory-dsh-parity/execution-summary.md`
