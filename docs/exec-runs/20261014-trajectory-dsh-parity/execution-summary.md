# 轨迹页对齐 DeepSeek Harness — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261014-trajectory-dsh-parity.md`
- **执行过程**：`docs/exec-runs/20261014-trajectory-dsh-parity/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（T1–T12）。改动未提交，等用户验收。

## 核心变更清单

R = `apps/desktop/src/renderer`。

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| DSH 颜色、字号 token 与全局样式 | `R/styles/tokens.css`、`tailwind.css`、`index.css`、`trajectory.css`（新）、`json-tree.css`（新） | K2：浅色和深色都用 DSH 取值，不跟随强调色；颜色只在 tokens.css |
| 语义层：7 种 cell、请求视图、状态、页签、文案、时间轴模型 | `R/trajectory/*`（builder、layout、requests、status、detail-tabs、strings、format、timeline、prompt-diff） | 上下文行（supplement `op=add`、后台任务通知）；审批并入工具行；重试和错误并入请求（K4、D2） |
| 工具栏、表格、行 | `R/components/trajectory/TrajectoryToolbar.tsx`、`TrajectoryTable.tsx`、`TrajectoryRow.tsx` | 只露「时长」（K6）；请求圆点恢复（K5）；双击折叠；虚拟化 |
| 时间轴 | `TrajectoryTimeline.tsx`、`use-timeline-viewport.ts` | 三泳道、拖选、平移、悬停提示 |
| 详情面板 | `R/components/trajectory/details/*`、`R/components/ui/JsonTree.tsx` | DSH 页签与中文文案（K3）；不做代码页签（K8） |
| 流式不闪 | `use-trajectory-source.ts`、`TrajectoryRow.tsx` 比较函数、`timelineSignature` | 每帧最多重建一次；行不重挂载；时间轴不随正文重算 |
| 停止按钮 | `R/components/ConversationView.tsx` | D1：停止移到工具栏最右侧，去掉单独一行；轨迹页无输入框、无底部留白（K7） |
| 删除旧组件 | `TrajectoryDetails.tsx`、`TrajectoryContent.tsx`、`presentation.tsx` | 由 `details/` 取代 |
| fixture | `R/trajectory/fixtures.ts` | 新增 `streaming`；`errors` 加上下文行、审批拒绝、请求失败 |
| 原生按钮基线 | `scripts/native-button-baseline.json` | 轨迹相关合计 18 → 15 |
| Electron 验收脚本 | `apps/desktop/scripts/verify-trajectory-electron.mjs` | 跟上 storage、bridge 分组、分页和中文名称 |
| 文档 | `docs/FRONTEND_VERIFICATION.md`、`docs/design-docs/frontend/front-DSH轨迹能力迁移规范.md`、histories | fixture 入口；「DSH 对齐实现」一节 |

## 人工验证指引

### 必须验证

1. **整体观感是否和 DSH 一致**
   - 验证方式：`pnpm --filter @actspace/desktop dev:renderer`，打开 `http://127.0.0.1:5173/?mock=long-session&trajectoryFixture=errors`，点标题栏「查看执行轨迹」。也可以直接看 `shots/01-light-table.png` 与 `shots/00-dsh-reference.png`。
   - 预期结果：类型标签、轮次标签、请求圆点、工具结果箭头、时间轴颜色与 DSH 相同。

2. **流式时行不闪**
   - 验证方式：同上，把 `trajectoryFixture` 换成 `streaming`。
   - 预期结果：最后一行助手文字逐段变长，行不闪烁，时间轴不跳。

3. **真实会话**
   - 验证方式：`pnpm dev`，在一个会话里发消息，运行中切到轨迹。
   - 预期结果：工具栏右侧出现「停止」，点了能停；上下文行、请求圆点、浅色和深色正常。

### 建议验证

1. **详情面板**：依次点助手行、失败的工具行、请求圆点、「系统提示词已更新」行，对照 `shots/02`–`05`。
2. **480px 窄窗**：对照 `shots/10`、`11`。打开详情后表格只剩一窄条，这是 DSH 容器查询的行为。

## Agent 已完成的验证

- `pnpm --filter @actspace/desktop typecheck`：通过。
- `pnpm --filter @actspace/desktop test`：230 个文件、1854 条通过（2 条原本就跳过）。
- `pnpm check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`、`check:current-docs`：通过。
- 浏览器截图（Chrome headless，1440×900 和 480 宽）：`shots/00`–`13`，浅色、深色、窄窗、四类详情、调用全部收起、流式、长会话。
- 浏览器流式测量：按 `assistant-running` 的行取 274 个动画帧样本，始终是同一个 DOM 节点，文字长度单调从 6 增到 119（20 个不同长度）。
- 长会话（`long`，2280 个节点 → 553 行）：
  - 浏览器连续滚动 1.5 秒，帧间隔 p50 16.7ms、p95 16.8ms、最大 16.8ms，没有掉帧；虚拟化后实际渲染 38 行。
  - 每帧全量重建耗时（Node，30 次）：builder p50 13.1ms / p95 15.8ms；layout 0.6ms；flatten、签名、时间轴都在 0.2ms 以内。
- Electron（`verify-trajectory-electron.mjs`，隔离数据目录，真实 Journal / preload / IPC）：真实 Journal、IPC 版本、历史分页、界面加载更早历史、助手到工具跳转、工具结果、Schema、提交通知、草稿保留、重载，全部通过。证据 `shots/14-electron-trajectory.png`。

## 已知风险和遗留事项

- **长会话流式**：builder 每帧全量重建，2280 个节点时约 13ms，已接近 16.7ms 的帧预算。比这更长的会话流式时可能掉帧。建议另立计划做增量 builder。
  - 2026-10-14 已由[轨迹页流式拆分](../../exec-plans/active/20261014-trajectory-streaming-split.md)处理：chunk 不再触发重建，每帧约 0.25ms；见[执行摘要](../20261014-trajectory-streaming-split/execution-summary.md)。普通事件到达时仍全量重建。
- **与 DSH 的已知差异**（都是有意保留或数据所限）：
  - 时间轴点空白处会选中最近的记录（DSH 只聚焦）。
  - 助手预览按「思考、文本、工具调用」排列，不按原始块交错。
  - 找不到目标的工具调用按钮置灰（DSH 照样可点）。
  - 请求「重试」只显示次数，没有「第几次 / 共几次」，因为没有最大重试数。
  - 工具结果不做分块、附件和图片预览。
  - 请求缺完成时间时，总时长显示「等待中」，与 DSH 一致；旧会话的失败请求也会这样显示。
- **没有验证**：真实 Provider 的流式会话没在 Electron 里跑（隔离环境没有模型 key）。需要用户用 `pnpm dev` 看一次。
- **共享文件**：`tokens.css`、`index.css`、`native-button-baseline.json`、`ConversationView.tsx` 里同时有其他会话未提交的改动。本次只做了增量修改，提交时要分开挑。

## 后续建议

- 增量 builder：按 Journal 序号追加，只重建最后一个 Turn。
- 「实际时间」开关和 `run_code` 代码页签以后要做时，纯函数层已留好 `time`、`actual` 模式。
