# 轨迹页流式拆分 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261014-trajectory-streaming-split.md`
- **执行模式**：交互
- **开始时间**：2026-10-14

## 执行时间线

### 步骤 0：E1 拍板

- 用户选「改」：`projectTrajectoryWindow` 加按事件缓存（T4）。

### 步骤 1：T0 基线测量与 fixture

- **操作**：
  - `fixtures.ts` 新增 `streaming-long`（`long` 去掉各批次的运行中回复，最后一轮补一条最多 2000 chunk 的回复）和 `streamingReplay`，开发态回放每 120ms 加 20 个 chunk；
  - `use-trajectory-source.ts` 改用 `streamingReplay`；
  - 新增 `test/trajectory-streaming-perf.test.ts`，只在 `TRAJECTORY_PERF=1` 时运行。
- **基线**（Node，30 次；一帧 = 窗口多一个 chunk）：

  | 场景 | 节点数 | projectTrajectoryWindow | builder | 布局 + 展平 | 合计 |
  | --- | --- | --- | --- | --- | --- |
  | 回复刚开始（10 chunk） | 2242 | p50 2.59 / p95 4.57ms | p50 12.89 / p95 17.19ms | p50 0.70 / p95 1.17ms | p50 16.24 / p95 18.61ms |
  | 回复后段（2000 chunk） | 4232 | p50 4.17 / p95 7.17ms | p50 16.52 / p95 18.26ms | p50 0.60 / p95 1.02ms | p50 22.50 / p95 24.83ms |

- **结论**：深拷贝每帧 2.6–4.2ms，单靠视图层拆分达不到 2ms，E1 必须做。回复后段合计已超过一帧（16.7ms）。

### 步骤 2：T1 `live.ts` 与 builder 接线

- **操作**：
  - 新增 `trajectory/node-data.ts`：把 `asRecord`、`pick`、`valueText`、`sourceBlocks` 等取值函数从 builder 移出，builder 和 `live.ts` 共用，避免循环引用；
  - 新增 `trajectory/live.ts`：`chunkKey`、`closedKey`（收尾规则，与 builder 共用）、`splitLiveChunks`、`createLiveAccumulator`、`appendChunks`、`liveFields`、`withLiveContent`、`streamingCells`；
  - builder 接收 `{ placeholders }`：正在输出的组只生成空占位；partial 内容改用 `liveFields(appendChunks(...))`；chunk 分组改为 `push`，不再每次复制数组。
- **决定**：
  - builder 只拿到每个流式组的第一个 chunk 和第一个非空 chunk。这两个决定了占位记录的 id、turn/step、开始时间和首 token 时间，其余 chunk 只影响正文。
  - 流式组的 `tool-call-delta` 对上已落盘的 `tool/call` 时算定稿。那个工具行的 `assistantRecordId` 要从助手的工具调用块里找，占位没有这些块。
- **验证**：`trajectory-live.test.ts` 8 条，包括 `streaming` 全部帧、`streaming-long` 1/40/800/2000 chunk 的逐帧等价（cells 和请求视图都 `toEqual`），以及累加器 5 次追加共处理 25 个 chunk、只建一次定稿层。builder 840 → 747 行。

### 步骤 3：T2 搜索索引

- **操作**：新增 `trajectory/search-index.ts`（`TrajectorySearchIndex`）；builder 删掉 `searchIndex` 字段和 `searchTrajectory`。
- **决定**：条目复用条件用「记录对象没变」。定稿层不重建时记录对象不变；重建后对象都是新的，会全部重新生成，最多每 3 秒一次。
- **验证**：
  - 删除前用临时测试比较新旧结果：`errors`、`complete`、`long`、`streaming-long` 四个 fixture，10 个查询，结果完全相同；
  - `trajectory-search-index.test.ts` 3 条：不变时 `update` 返回 false、只换一条时只多生成一次、删除后条目移除、空查询返回 null。

### 步骤 4：T3 视图装配、表格与详情

- **操作**：
  - `TrajectoryView`：`splitLiveChunks` → 按 `settledKey` 缓存 builder 结果 → 布局；累加器放在 ref；`streamingCells` 只含流式组；时间轴依赖 `[layout, mode]`；搜索按 3 秒节流，用 `searchRevision` 驱动结果；
  - `TrajectoryTable` 新增 `streamingCells`，渲染时按 recordId 换 cell（折叠后的摘要行不换）；
  - `use-trajectory-selection`：选中的记录在流式层时详情用流式 cell；所在 section 按定稿 cell 查找，流式时不重复计算；
  - `timeline.ts` 删掉 `timelineSignature`，`trajectory-layout.test.ts` 改为比较两次的时间轴模型相等。
- **问题**：搜索节流测试失败。组件挂载时，搜索 effect 先跑并记下时间，之后换会话的重置 effect 又把时间清掉了，下一次更新就不节流。
  - **应对**：节流状态里记下建立索引的会话 id，换会话时立即重建，不再在重置 effect 里清时间。
- **验证**：`trajectory-streaming.test.tsx` 4 条：
  - 第 1–5 帧 builder、`deriveLayout`、`deriveTimeline` 各 1 次（第 1 帧出现占位），推一条 `tool/call` 后各 2 次，流式行始终是同一个 DOM 节点；
  - 选中流式助手后，「预览」页签的文字随帧变长；
  - 搜索：新出现的文字在 2999ms 时搜不到，3000ms 时搜到。

### 步骤 5：T4 `projectTrajectoryWindow` 缓存

- **操作**：`packages/client/src/sessions/trajectory.ts` 加 `WeakMap<事件, 节点>`，同一事件对象只转换一次；会话 id 不同时重新转换。没有碰 `tool-card.ts`。
- **验证**：新增 `src/test/trajectory-projection.test.ts`；client 测试 6 个文件 24 条通过；`pnpm --filter @actspace/client build` 通过。

### 步骤 6：T5 性能验收与回归

- **测量**（`TRAJECTORY_PERF=1`，Node，30 帧，每帧窗口多一个 chunk）：

  | 场景 | 节点数 | 转换 | 拆分 | 累加 + 流式 cell | 每帧合计 |
  | --- | --- | --- | --- | --- | --- |
  | 40 chunk | 2272 | p95 0.046ms | p95 0.202ms | p95 0.017ms | p50 0.216 / p95 0.265ms |
  | 2000 chunk | 4232 | p95 0.096ms | p95 0.152ms | p95 0.003ms | p50 0.225 / p95 0.252ms |

  - 30 帧里定稿层只在首帧建一次，累加器共处理的 chunk 数等于实际数量。
  - 普通事件触发的定稿层重建（2000 chunk 折成占位后）：p50 9.68 / p95 10.52ms。
  - 旧的全量路径在加了 E1 缓存后：转换从 p50 4.17ms 降到 0.06ms，builder 不变（约 12ms）。
- **浏览器**（dev renderer 5188 端口，playwright-core + 本机 Chrome，1440×900，脚本 `tmp/trajectory-shots/stream-long.mjs`）：

  | fixture | 样本帧 | 同一节点 | 行被移除 | 文字长度 | 帧间隔 |
  | --- | --- | --- | --- | --- | --- |
  | `streaming` | 294 | 是 | 0 次 | 6 → 119，20 种，单调 | p50 16.7 / p95 16.7 / 最大 83.3ms |
  | `streaming-long` | 769 | 是 | 0 次 | 119 → 11750，100 种，单调 | p50 16.7 / p95 16.8 / 最大 83.3ms |

  - 最大值 83.3ms 出现在切到轨迹视图后的首次挂载。
  - 第一次运行记到一条 404 资源错误，单独复查没有复现。
  - 截图 `shots/01-light-streaming.png`、`shots/02-light-streaming-long.png`。
- **Electron**：`pnpm --filter @actspace/desktop build` 后跑 `verify-trajectory-electron.mjs`，11 项全部通过，证据 `shots/03-electron-trajectory.png`。
- **全量检查**：
  - `pnpm --filter @actspace/desktop typecheck` 通过；
  - `pnpm --filter @actspace/desktop test`：234 个文件，1866 条通过，1 条失败：`review-workspace-watcher.test.ts` 的「reports checkout files as ignore candidates…」。单独重跑 3 次都通过，是满载时的文件监听计时问题，与本次改动无关（计划目录 README 记过 watcher 回归门槛）；
  - `check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`、`check:current-docs` 通过。

### 步骤 7：T6 文档

- `front-DSH轨迹能力迁移规范.md`：数据流图、「流式」一节、「不包含」里的增量 builder；
- `FRONTEND_VERIFICATION.md`：fixture 表加 `streaming-long`；
- 对齐计划和它的执行摘要：「长会话流式」风险链接到本计划；
- histories、本文档、执行摘要、计划进度、`docs/exec-plans/README.md`。

## 遇到的问题

- 见步骤 4（搜索节流与会话重置 effect 的顺序）。

## 跳过或推迟的事项

- 真实 Provider 的流式会话没有在 Electron 里跑，需要用户用 `pnpm dev` 看一次。
- 普通事件仍触发定稿层全量重建（约 10ms），增量 builder（方案 B）没做，按计划另议。
