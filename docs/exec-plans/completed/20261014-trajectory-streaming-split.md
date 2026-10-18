# 轨迹页流式拆分：定稿层与流式层

> 2026-10-18 状态校准：定稿/流式拆分实现已合入；原记录中的基准只代表当时 fixture，不等于所有原生性能通过。 下文保留原始实施决策与过程；最新分项证据见 [近期验收](../../exec-runs/20261018-recent-features-acceptance/acceptance.md)。
> 原实施阶段记录：状态：实现完成，等用户验收（2026-10-14）。执行摘要：`docs/exec-runs/20261014-trajectory-streaming-split/execution-summary.md`。

## 目标

助手流式输出时，轨迹页只处理新到的 chunk。已定稿的部分（builder、布局、表格行、时间轴）在两条普通事件之间不重算。做法照 DeepSeek Harness（DSH）`TrajectoryView.tsx` 的 `finalized` + `streamingCells`：

- **定稿层**：正在输出的助手只保留一个空占位，正文为空。正文变长时，定稿层不变。
- **流式层**：只针对正在输出的那一条助手。累加器记住已经处理到第几个 chunk，每帧只追加新增的部分，再生成一个流式 cell。
- **表格和详情**：渲染时，按 recordId 用流式 cell 替换占位 cell。

## 已拍板的决定（2026-10-14 用户确认）

| 编号 | 决定 |
| --- | --- |
| S1 | 选方案 A：只在视图层拆分。不改 builder 的整体算法（增量 builder 即方案 B，以后再议），不改数据源通道（方案 C）。 |
| S2 | 表格照 DSH：<br>• 行列表只来自定稿层；<br>• 正在输出的助手在定稿层里有一个占位行；<br>• 表格渲染这一行时换成流式 cell（DSH `TrajectoryTable.tsx:2117-2124` 的 `currentRecord`）。<br>流式 cell 不是追加在表格末尾的另一块。 |
| S3 | 搜索照 DSH 的 `TrajectorySearchIndex`：<br>• 索引覆盖定稿 cell 和流式 cell 两部分；<br>• 按 recordId 增量更新，记录没变就不重新生成文本；<br>• 索引更新按 3 秒节流（DSH 的 `SEARCH_INDEX_THROTTLE_MS`），首次立即生成；<br>• 输入查询时立即用当前索引搜索。 |
| S4 | 加验收指标和对应的 fixture，见「验证方式」。 |

## 已确认（原待确认）

- **E1 `projectTrajectoryWindow` 要不要一起改**：2026-10-14 用户选「改」。（`packages/client/src/sessions/trajectory.ts:3`）
  - 现状：每来一个 chunk，窗口都会变成新对象。这个函数会对窗口里每条事件的 `data`、`surface`、`source` 做 `JSON.parse(JSON.stringify(...))` 深拷贝。这一步不在之前测的 13ms 里，事件越多越慢。
  - 建议：在这个函数里按事件对象加一个 `WeakMap` 缓存，同一条事件只转换一次（约 5 行）。`packages/client` 是共享包，但这个函数只有轨迹在用。
  - 另一种：不改，只在 T0 里测出它的耗时并记录。如果超过 1ms，验收指标就达不到。

## 范围

### 包含

- 新增 `R/trajectory/live.ts`：
  - chunk 归属键（与 builder 共用）；
  - 拆分定稿节点和流式 chunk；
  - 增量累加器；
  - 生成助手 partial 记录；
  - 把流式内容合进占位 cell。
- `R/trajectory/builder.ts`：
  - 可以接收拆分结果：正在输出的助手只生成空占位；
  - partial 记录的生成逻辑移到 `live.ts`；
  - 搜索文本移出 builder。
- 新增 `R/trajectory/search-index.ts`：增量搜索索引。
- `R/components/TrajectoryView.tsx`：
  - 定稿层按「定稿键」缓存；
  - 新增流式层；
  - 时间轴改用定稿布局，删掉 `timelineSignature`。
- `TrajectoryTable.tsx`、`use-trajectory-selection.ts`：表格和详情按 recordId 换成流式 cell。
- 新增 fixture `streaming-long`：`long` 加上一条正在输出、共 2000 个 chunk 的回复。
- 测试、性能测量、文档。
- E1 选「改」时：`packages/client/src/sessions/trajectory.ts` 加按事件的缓存。

### 不包含

- 增量 builder（方案 B）：普通事件（工具调用、工具结果、请求头）到达时，定稿层仍然全量重建。
- 把 chunk 移出 Journal 和事件窗口，改走单独的流式通道（方案 C）。
- 主进程、IPC、`packages/client` 的会话存储（E1 只涉及上面那一个函数）。
- 聊天视图的流式路径。
- 时间轴、表格、详情的外观和交互（沿用 `20261014-trajectory-dsh-parity.md` 的结果）。

## 背景

### 必读

- `docs/exec-plans/completed/20261014-trajectory-dsh-parity.md`，以及它的执行摘要 `docs/exec-runs/20261014-trajectory-dsh-parity/execution-summary.md`：帧耗时记录和遗留风险。
- `docs/design-docs/frontend/front-DSH轨迹能力迁移规范.md` 的「DSH 对齐实现 → 流式」一节。
- 用户文档 `~/Downloads/轨迹功能讨论/`：
  - 《轨迹动态更新与助手流式显示》五–八节；
  - 《时间轴渲染与交互实现》的「动态更新和显示范围」。

### DSH 的做法（只读参考，2026-10-14 核对源码）

源码在 `tmp/deepseek-harness/packages/client/`。

- **三路数据**：`session.follow` 上有三种帧：
  - `snapshot`：基线；
  - `event`：已落盘的事实；
  - `assistant-stream`：流式片段，临时、不落盘。

  客户端把流式片段转成 `assistant/live-chunk`。
- **增量组装**（`ui-conversation/src/client/conversation/assembler.ts`）：
  - 每条事件先找到它所属的 Definition 实例。助手实例的 id 是 `turn:step`（`ui-trajectory/src/client/trajectory-assistant-definition.ts:331-345`）。
  - 来一个 chunk，只对这一个实例调用 `update`，在已有状态上追加。
  - 然后调用 `builder.apply({ upserts })`，只替换这一个位置（`trajectory-snapshot-builder.ts:169-185`）。
  - chunk 的发布频率是 `animation-frame`。
- **视图拆分**（`ui-trajectory/src/client/TrajectoryView.tsx:316-388`）：
  - `finalized` 用正文为空的 partial 算布局；
  - `timelinePartial` 去掉了文本增量；
  - `partialSearchTurns` 和 `streamingCells` 只针对正在输出的那一个助手。
- **表格**（`TrajectoryTable.tsx:2117-2124`）：`streamingCellsByIndex` 在渲染时把占位 cell 换掉。
- **搜索**（`trajectory-search-index.ts:76-130`）：
  - 按 recordId 保存条目；
  - 来源字段没变就复用旧文本；
  - 索引更新按 3 秒节流。
- **说明**：DSH 的 `snapshot()` 每次都返回新的 `eventNodes`，所以 `finalized` 在流式发布时其实也会重算。但它的输入是已经组装好的语义节点，chunk 不在里面，所以很便宜。我们用「定稿键」直接跳过重算，效果不低于 DSH。

### ActSpace 现状（`R/` = `apps/desktop/src/renderer/`）

每来一个 chunk：

1. journal-update 把 `assistant/chunk` 追加进事件窗口，窗口变成新对象；
2. `selectTrajectory` → `projectTrajectoryWindow` 把**全部**事件转一遍，并做深拷贝（E1）；
3. `useFrameCoalesced` 把更新合并到每帧一次（`R/components/trajectory/use-trajectory-source.ts:13`）；
4. `buildTrajectorySnapshot` 扫描全部节点（`R/components/TrajectoryView.tsx:51`）：
   - `mergeNodes` 里 `chunks.set(key, [...old, node])` 每次都复制整个数组，一条回复内部的开销与 chunk 数的平方成正比（`builder.ts:450-452`）；
   - partial 记录要把所有 chunk 重新拼接（`builder.ts:629-650`）；
   - 每条记录都要 `JSON.stringify` 生成搜索文本（`builder.ts:799-802`）；
5. `deriveLayout`、`flattenLayout`、折叠、搜索全部重算。

此外：

- 行组件的比较函数和时间轴签名只避免了重渲染，前面的计算一步都没少。
- 已测数据：`long` fixture（2280 个节点）下，builder 每帧 p50 13.1ms、p95 15.8ms。

## 设计要点

### 1. 拆分规则（`live.ts`）

- **chunk 归属键 `chunkKey(node)`**：从 builder 原样搬出，builder 和拆分共用。
  - 有 `messageId` 用 `messageId`；
  - 否则有 `requestId` 用 `request:<requestId>`；
  - 都没有时用 `<sessionId>:partial`。
- **流式 chunk 的条件**：两条同时满足的 `assistant/chunk` 算流式 chunk，其余节点都是定稿节点。
  - 窗口里没有用同一个键收尾的 `assistant/message`；
  - 所在轮次没有 `turn/end`。

  已经结束但没有最终消息的回复（例如中止）留在定稿层，由 builder 照旧生成完整的 partial 记录。
- **定稿键 `settledKey`**：由以下几项拼成：
  - `sessionId`、窗口 `fromSeq`；
  - 定稿节点数，以及第一条、最后一条定稿节点的 `eventSeq`；
  - 每个流式组的结构签名：键、第一个 chunk 的 seq、第一个非空 chunk 的 seq。

  Journal 只追加、不改写，所以键不变就说明定稿内容没变。流式期间只有流式组在增长，结构签名在出现首 token 后也不再变化，定稿键保持不变。
- **拆分只做一次线性扫描**，不复制节点数组。只有定稿键变化时，才生成定稿节点数组交给 builder。

### 2. 定稿层

- `buildTrajectorySnapshot(snapshot, { live })`：
  - 定稿节点照旧处理；
  - 每个流式组只用结构信息生成一个空占位记录。
- **占位记录**：
  - id 与现在相同：`<sessionId>:record:assistant:<key>`；
  - turn、step、requestId、开始时间、首 token 时间都从第一个 chunk 和第一个非空 chunk 取，与现在的计算一致；
  - 正文、思考、工具调用块为空；
  - `sourceSequences` 只放第一个 chunk。
- 不传 `live` 时，结果和现在完全一样。这条路径同时作为等价测试的对照。
- `deriveLayout`、`flattenLayout`、折叠、`foldableTurns`、`foldableAssistants`、历史分页都只依赖定稿层。流式期间它们的引用保持不变。
- 时间轴模型改用 `[定稿布局, 模式]` 缓存，删掉 `timelineSignature`。占位记录已经带着首 token 时间，时间轴的渲染结果和现在一致。

### 3. 流式层

- **累加器 `createLiveAccumulator()`**：放在 `TrajectoryView` 的 ref 里，换会话时重置。
  - 按键保存 `{ 已处理 chunk 数, 正文, 思考, 工具调用块, sourceSequences, 原始 chunk 数据 }`；
  - 每帧只处理新增的 chunk；
  - 工具调用增量按 `callId` 合并，与现在的 `streamingToolCalls` 一致；
  - 某个键不再是流式组时（已收尾），删掉它的状态。
- **`withLiveContent(placeholder, content)`**：把正文、思考、工具调用块、summary、preview、`outputDetail`、`thinkingDetail`、`sourceSequences`、`raw` 合进占位 cell，生成新的流式 cell。
- **`streamingCells: ReadonlyMap<recordId, TrajectoryCell>`**：每帧最多生成一次，只含流式组，通常只有 1 个。
- **等价性要求**：拆分路径得到的流式 cell，必须和不拆分时 builder 加 `deriveLayout` 得到的同一个 cell 完全相等（`toEqual`）。拿 `streaming` fixture 的每一帧逐帧比较。

### 4. 表格与详情

- `TrajectoryTable` 新增 `streamingCells` 属性。渲染每一行时，取 `streamingCells.get(row.cell.recordId) ?? row.cell`。
- `TrajectoryRow` 的比较函数不变：只有被换掉的那一行内容变了，其他行不重渲染。
- `use-trajectory-selection`：选中的记录在 `streamingCells` 里时，详情使用流式 cell。正文在详情里也会实时变长（DSH 文档：「助手流式正文通过单独的 streamingCells 更新表格和详情」）。
- 在流式中触发的「跳到记录」、上下文面板跳转，仍然用定稿层里的 id 和位置，占位行与之对应。

### 5. 搜索

- 新增 `search-index.ts`：
  - `class TrajectorySearchIndex { update(cells): boolean; search(query) }`；
  - 条目按 recordId 保存，cell 对象没变就复用旧文本；
  - 文本字段与现在 builder 的 `JSON.stringify` 字段相同，搜索结果不变。
- `TrajectoryView`：
  - 首次立即建立索引；
  - 之后对 `[定稿 cells, 流式 cells]` 的更新按 3 秒节流；
  - 每次更新递增一个 `revision`，搜索结果依赖 `[revision, query]`。
- builder 删掉 `searchIndex` 字段和 `searchTrajectory`。

## 文件改动

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `R/trajectory/live.ts` | 新 | `chunkKey`、`splitLiveChunks`、`createLiveAccumulator`、`partialRecord`、`withLiveContent`；不超过 300 行 |
| `R/trajectory/builder.ts` | 改 | 接收 `{ live }`；partial 生成改用 `live.ts`；修掉 chunk 数组反复复制；删掉搜索文本。行数只减不增（现在 840 行） |
| `R/trajectory/search-index.ts` | 新 | 增量索引 |
| `R/trajectory/timeline.ts` | 改 | 删掉 `timelineSignature` |
| `R/trajectory/index.ts`、`contract.ts` | 改 | 导出新模块和类型；`TrajectoryRuntimeSnapshot` 去掉 `searchIndex` |
| `R/components/TrajectoryView.tsx` | 改 | 定稿层和流式层装配、搜索节流；保持在 400 行以内（现在 233 行） |
| `R/components/trajectory/TrajectoryTable.tsx` | 改 | `streamingCells` 属性，渲染时替换 |
| `R/components/trajectory/use-trajectory-selection.ts` | 改 | 详情优先使用流式 cell |
| `R/trajectory/fixtures.ts` | 改 | 新增 `streaming-long` |
| `packages/client/src/sessions/trajectory.ts` | 改（E1 选「改」时） | 按事件 `WeakMap` 缓存 |
| `R/test/trajectory-live.test.ts` | 新 | 拆分、累加、等价性 |
| `R/test/trajectory-search-index.test.ts` | 新 | 增量和复用 |
| `R/test/trajectory-streaming.test.tsx` | 改 | 流式期间不调用 builder；详情实时变长；搜索节流 |
| `R/test/trajectory-streaming-perf.test.ts` | 新 | 帧耗时测量。只在 `TRAJECTORY_PERF=1` 时运行，平时跳过，避免 CI 抖动 |
| 其他已有的轨迹测试 | 改 | 跟上 `searchTrajectory`、`timelineSignature` 的删除 |
| 文档 | 改 | 见 T6 |

## 执行步骤

### T0 基线测量与 fixture

- **改动**：
  - 新增 `streaming-long` fixture：`long` 加一条回复，回放到第 N 帧时带 N 个 chunk，最多 2000 个；
  - 新增 `trajectory-streaming-perf.test.ts`，先测现状。
- **测量项**（Node，每项 30 次，取 p50 和 p95）：
  - `projectTrajectoryWindow`；
  - `buildTrajectorySnapshot`；
  - `deriveLayout` 加 `flattenLayout`；
  - 搜索文本生成；
  - 整条链路合计。

  测两个时间点：回复刚开始（10 个 chunk）、回复后段（2000 个 chunk）。
- **结果**：写进执行过程文档。E1 的最终取舍以这个数据为准，向用户报告。

### T1 `live.ts` 与 builder 接线

- **改动**：
  - 新增 `live.ts`；
  - builder 接收 `{ live }`，partial 生成改用 `partialRecord`，chunk 分组改为追加，不再复制数组。
- **验证**（`trajectory-live.test.ts`）：
  - 已收尾的回复、已结束的轮次、缺 `messageId` 的 chunk，都归到正确的一侧；
  - 定稿键：流式期间追加 chunk 时不变；新增普通事件、出现首 token、加载更早的历史时会变；
  - 累加器追加 5 次后，处理过的 chunk 总数等于实际 chunk 总数，不会重复处理；
  - 等价性：`streaming` fixture 每一帧，拆分路径的流式 cell 都与不拆分路径的 cell 相等；
  - 已有的 `trajectory-builder`、`trajectory-real-journal` 测试全部通过。

### T2 搜索索引

- **改动**：新增 `search-index.ts`；builder 删掉搜索文本。
- **验证**（`trajectory-search-index.test.ts`）：
  - 同一组 cell 再次 `update` 返回 `false`；
  - 只换掉一个 cell 时，只有这一条重新生成文本（用计数验证）；
  - 删除记录后，条目也被移除；
  - 查询结果与旧的 `searchTrajectory` 相同：拿 `errors` fixture 跑同一组查询比较。

### T3 视图装配、表格与详情

- **改动**：
  - `TrajectoryView` 加入定稿层缓存、流式层、搜索节流；
  - 删掉 `timelineSignature`；
  - `TrajectoryTable` 和 `use-trajectory-selection` 改为使用流式 cell。
- **验证**（`trajectory-streaming.test.tsx`，用 `vi.spyOn` 统计调用次数）：
  - 连续推送 5 个 chunk：builder、`deriveLayout`、`deriveTimeline` 的调用次数都不增加；
  - 助手行始终是同一个 DOM 节点，文字逐步变长；
  - 选中正在输出的助手，详情「预览」里的文字也跟着变长；
  - 推送一条 `tool/call` 事件后，定稿层重算一次；
  - 用假计时器测搜索：新出现的流式文本在 3 秒节流之后可以被搜到，之前搜不到；
  - 已有的 `trajectory-render-view`、`trajectory-relations`、`trajectory-details` 测试全部通过。

### T4 `projectTrajectoryWindow` 缓存（E1 选「改」时）

- **改动**：在 `packages/client/src/sessions/trajectory.ts` 里按事件对象加 `WeakMap<event, node>` 缓存。
- **验证**：
  - `packages/client` 现有测试通过；
  - 新增用例：同一个事件对象出现在两个不同窗口里时，转换出的是同一个节点。

### T5 性能验收与回归

- **验证**：
  - `TRAJECTORY_PERF=1` 跑 `trajectory-streaming-perf.test.ts`，与 T0 对比，结果写进执行摘要；
  - 浏览器打开 `?mock=long-session&trajectoryFixture=streaming-long`：
    - 采集帧间隔；
    - 用 MutationObserver 确认流式行没有被重挂载；
    - 截图对照之前的 `shots/12`、`13`；
  - 重跑 `apps/desktop/scripts/verify-trajectory-electron.mjs`；
  - 全量检查：
    - `pnpm --filter @actspace/desktop typecheck`、`pnpm --filter @actspace/desktop test`；
    - `check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`、`check:current-docs`；
    - E1 选「改」时，再跑 `packages/client` 的测试。

### T6 文档

- `front-DSH轨迹能力迁移规范.md`：
  - 重写「DSH 对齐实现 → 流式」一节，并更新数据流图；
  - 「不包含」里的「增量 builder」改成「普通事件到达时定稿层仍全量重建」。
- `FRONTEND_VERIFICATION.md`：fixture 表加上 `streaming-long`。
- `20261014-trajectory-dsh-parity.md`：在执行摘要的「已知风险」里链接到本计划。
- 写 histories，以及 `docs/exec-runs/20261014-trajectory-streaming-split/` 的执行过程和执行摘要。
- `docs/exec-plans/README.md`：更新状态。

## 风险

- **定稿键漏变，定稿层停在旧数据上**：
  - 原因：比如窗口被整个替换，但节点数和首尾 seq 恰好不变。
  - 缓解：键里带 `fromSeq` 和首尾 seq；Journal 只追加。T1 的测试覆盖加载更早历史、换会话两种情况。
- **流式 cell 和不拆分时的结果不一致**：
  - 涉及 id、计时、工具调用块、来源序号这些字段。
  - 缓解：T1 逐帧做等价性测试，用不拆分的 builder 作对照。
- **搜索最多滞后 3 秒**：新流式出来的文字最晚 3 秒后才能搜到。这是 DSH 的行为，有意保留。
- **普通事件仍然全量重建**：工具调用密集时（每秒好几条事件），每条事件仍要跑 13ms 以上的 builder。本计划只消除了 chunk 带来的重建。T5 会记录这种情况下的耗时，供以后决定要不要做方案 B。
- **共享文件**：`packages/client` 只在 E1 选「改」时动一个函数。`TrajectoryView.tsx` 等轨迹文件里还有上一轮未提交的改动，本计划在它们之上继续修改，不另起分支。

## 验证方式

验收指标（S4）：

| 指标 | 场景 | 要求 |
| --- | --- | --- |
| 流式每帧计算耗时 | `streaming-long`：2280 个节点，加一条 2000 chunk 的回复，取后段 | 从窗口变化到流式 cell 生成，p95 < 2ms（Node 测量，不含 React 渲染） |
| 流式期间的重算次数 | `streaming` 和 `streaming-long` | 首帧之后，builder、`deriveLayout`、`deriveTimeline` 都是 0 次 |
| 累加器 | 同上 | 每个 chunk 只处理一次 |
| 帧间隔 | 浏览器 `streaming-long`，1440×900 | 流式期间 p95 ≤ 16.8ms |
| 行稳定 | 同上 | 流式行重挂载 0 次 |
| 等价性 | `streaming` 逐帧 | 流式 cell 与不拆分路径的结果相等 |

其他：

- 命令：见 T5。
- 手工检查：用户用 `pnpm dev` 在真实会话里流式输出时切到轨迹，确认正文逐段变长、选中后详情同步变长、搜索在几秒内能搜到新文字。

## 进度记录

- [x] E1 拍板：改（2026-10-14）
- [x] T0 基线测量与 fixture
- [x] T1 `live.ts` 与 builder 接线
- [x] T2 搜索索引
- [x] T3 视图装配、表格与详情
- [x] T4 `projectTrajectoryWindow` 缓存（E1 选「改」时）
- [x] T5 性能验收与回归
- [x] T6 文档

## 决策记录

- 2026-10-14：用户确认 S1–S4。
  - 不做方案 B，是因为方案 A 已经能让 chunk 不再触发重建，而改动只在视图层。
  - 不做方案 C，是因为它要改 main、IPC 和 client 的会话存储，聊天视图也在用同一个事件窗口。
- 2026-10-14：用户选 E1「改」。T0 基线显示深拷贝每帧 2.6–4.2ms，不改达不到 2ms。
- 2026-10-14 执行中的取舍：
  - builder 只拿每个流式组的第一个 chunk 和第一个非空 chunk，生成占位；流式组的 `tool-call-delta` 对上已落盘的 `tool/call` 时按定稿处理（工具行要靠它的内容关联助手）。
  - 搜索条目复用条件用「记录对象没变」，没有逐字段比较；定稿层重建后会全部重新生成，最多每 3 秒一次。
  - 共用取值函数移到 `node-data.ts`，避免 builder 与 `live.ts` 循环引用。
- 2026-10-14：起草时更正一处说法。之前讨论里说「流式 cell 作为单独一块追加在表格末尾」，但 DSH 源码的实际做法是：定稿层留一个占位行，渲染时替换 cell。S2 以源码为准。

## 执行模式

交互模式。

## 执行文档

执行开始时，在 `docs/exec-runs/20261014-trajectory-streaming-split/` 下创建 `execution-process.md` 和 `execution-summary.md`，模板在 `docs/exec-runs/templates/`。
