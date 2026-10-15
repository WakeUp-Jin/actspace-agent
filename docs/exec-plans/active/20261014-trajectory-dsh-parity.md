# 轨迹页对齐 DeepSeek Harness

> 状态：执行中（2026-10-14 用户批准全部实施）。

## 目标

ActSpace 会话的「轨迹」视图在布局、尺寸、颜色、文案和交互上与 DeepSeek Harness（下称 DSH）的轨迹页一致，包括：

- 顶部工具栏；
- 输入、模型、工具三条泳道的时间轴；
- 轨迹表格：第 N 轮标签、轮次竖线、请求圆点、类型标签；
- 右侧详情面板：按记录类型给出不同页签，JSON 可以逐层折叠；
- 助手生成时，正文在原来那一行里流式变长，行不闪、不重挂载。

做法是改 ActSpace 现有的轨迹代码：保留 Journal → record 的 builder，在它后面新增布局层，重写渲染层。不引入 DSH 源码，也不做 HTML demo。

## 已拍板的决定（2026-10-14 用户确认）

| 编号 | 决定 |
| --- | --- |
| K1 | 直接改现有轨迹代码，不做 HTML demo。 |
| K2 | 颜色完全照 DSH 的浅色、深色取值，包括背景和文字层级。轨迹页不跟随 ActSpace 的强调色（accent）切换。 |
| K3 | 文案照 DSH 中文 locale（第 N 轮、请求 #N、等待中、概述、参数……）。 |
| K4 | ActSpace 比 DSH 多出的事件类型这样处理：<br>• 审批：并入工具行的状态和详情；<br>• 重试、错误：放进请求详情；<br>• 其余原始事件：不进主表，只能在详情里追溯。 |
| K5 | 恢复请求圆点。 |
| K6 | 工具栏只露出「时长」开关。「实际时间」开关隐藏；`time`、`actual` 两种模式只保留在纯函数里。 |
| K7 | 轨迹视图不显示输入框（ActSpace 自己的设计，与 DSH 不同）。DSH 为浮动输入框预留的底部空白（152px + 16px）不搬。 |
| K8 | 不做 `run_code` 的「代码」页签。ActSpace 没有 PTC 工具。 |

## 执行前确认项（已按建议定案）

- **D1 停止按钮位置**：现在运行中会在轨迹顶部单独占一行放「停止」。DSH 的工具栏只有 32px 高。
  - 建议：「停止」放进工具栏最右侧（搜索框右边），去掉单独那一行。
  - 另一种：保持现状。
- **D2 「上下文」行显示哪些事件**：ActSpace 的运行环境说明、执行预算提示不是 `user/message`，而是 `plugin/actspace.context/supplement` 事件。请求发出时，它们才被拼成 user 消息。
  - 建议：`op=add` 的补充显示为「上下文」行；`remove`、`bind` 只保留在原始事件里。
  - 另一种：都不显示，只在请求详情里看。

## 范围

### 包含

- **数据修补**（`R/trajectory/`）：
  - 「上下文」分类；
  - 子工具（`parentCallId`）映射为「子工具」类型；
  - 流式时工具参数的增量不再混进正文；
  - `runtime-context` 内容块不进入预览。
- **新增纯函数模块**：布局层（Turn → Group → Cell）、请求视图与编号、时间轴派生、状态推导、数字和时间格式、页签选择、中文文案表。
- **重写组件**：工具栏、时间轴、表格（带虚拟化）、类型标签、请求圆点、详情面板（头部、页签、宽度拖拽）及各类详情内容。
- **新增通用组件**：`JsonTree`。
- **主题**：在 `tokens.css` 新增 `--act-trajectory-*` 颜色变量，浅色、深色、跟随系统三处都写；`tailwind.css` 暴露成语义类；补 3 个小字号 token。
- **流式性能**：按动画帧合并 projection 更新；时间轴只在结构签名变化时重算；行组件按稳定 key 复用。
- **开发态数据**：
  - fixture 补上下文、子工具、审批、失败请求等形态；
  - 新增 `?trajectoryFixture=streaming`，在浏览器里回放流式过程。
- **测试**：更新现有 6 个轨迹测试，补新模块的单测。
- **文档**：
  - `front-DSH轨迹能力迁移规范.md` 的「当前实现」各节；
  - `FRONTEND_VERIFICATION.md` 补 `trajectoryFixture` 入口；
  - histories；
  - 本计划的执行文档。

### 不包含

- 后端事件格式、Journal、IPC 契约改动。
- builder 改成真正的增量构建：本次只做动画帧合并，见「风险」。
- `run_code` 代码页签、shiki 语法高亮。
- DSH 的独立轨迹标签页、路由、标签状态持久化。
- 轮尾交付卡（另有计划）。
- 图片、文件附件的专门预览：详情里只列名称，沿用现有数据。

## 背景

### 必读

- `AGENTS.md`
- `docs/design-docs/frontend/front-新功能开发清单.md`
- `front-主题与配色规范.md`
- `front-DSH轨迹能力迁移规范.md`
- `docs/FRONTEND_VERIFICATION.md`

### DSH 行为说明（用户提供，2026-10-14 核对源码）

位于 `~/Downloads/轨迹功能讨论/` 的 6 篇：

- 《轨迹渲染与时间轴数据流》
- 《轨迹动态更新与助手流式显示》
- 《时间轴渲染与交互实现》
- 《消息与上下文类型及右侧详情视图》
- 《轨迹表格的轮次请求与选择交互》
- 《轨迹详情中的折叠与代码显示》

### DSH 源码（只读参考）

`tmp/deepseek-harness/packages/client/ui-trajectory/src/client/`，重点：

- `TrajectoryTable.tsx`、`TrajectoryTable.module.css`
- `TrajectoryTimeline.tsx`、`TrajectoryTimeline.module.css`、`timeline.ts`
- `TrajectoryToolbar.*`、`layout.ts`、`trajectory-record.ts`、`locales.ts`

JSON 树在 `ui-primitives/src/JsonTree.*`。颜色 token 在 `ui-theme/src/styles/design-platform.css`。

DSH 的 `TrajectoryCell/Turn/TurnHeader/GroupHeader.module.css` 是遗留文件，TrajectoryTable 不引用，不参考。

### 现有代码（`R/` = `apps/desktop/src/renderer/`）

**数据层**

- `R/trajectory/builder.ts`（915 行，已超 500 行，见技术债）：`buildTrajectorySnapshot`、`groupVirtualRows`、`searchTrajectory`、`buildTrajectoryDetail`。
- `R/trajectory/contract.ts`、`reveal.ts`、`fixtures.ts`。
- `R/fixtures/trajectory-complete.json`：96 个节点。

**组件**

- `R/components/TrajectoryView.tsx`（199 行）。
- `R/components/trajectory/TrajectoryTimeline.tsx`、`TrajectoryDetails.tsx`、`TrajectoryContent.tsx`、`TrajectoryNavigation.tsx`、`presentation.tsx`。

**挂载与输入框**

- `R/components/ConversationView.tsx:363-372`：轨迹挂载点、停止栏；输入框在轨迹模式下用 `display:none` 隐藏。

**数据来源**

- `packages/client/src/sessions/selectors.ts:20-25`：`selectTrajectory`，按 `cell.window` 用 WeakMap 缓存。
- `R/session/SessionProjectionContext.tsx`：每个 journal-update 触发一次版本号自增。

**检查脚本**

- `scripts/check-frontend-theme-colors.mjs`：只有 `styles/tokens.css`、`styles/markdown.css` 允许写颜色字面量。
- `scripts/check-frontend-design-tokens.mjs`：禁止 `text-[Npx]`、`rounded-[..]`；原生 `<button>` 数按 `scripts/native-button-baseline.json` 只许减少。

### 已查明的数据事实

- **用户消息**：`user/message` 的 `data` 不带正文，正文在 `surface.node.content`，`source` 只有 `{ownerPluginId}`。用户手打的消息和程序写入的消息在事件上分不出来，两者都显示为「用户」。
- **后台任务通知**：`agent/inbox/spliced` 里 `operation=claim` 且 `data.source="task_notification"` 的是后台任务通知，应显示为「上下文」。`data.source="steer"`（旧数据）显示为「用户」，与 DSH 把中途输入显示成用户一致。
- **系统提示词**：AGENTS.md、Skill 都在系统提示词里，经 `request/header`、`request/context` 生成「系统」行。现有逻辑保留。
- **运行环境说明**：在 `plugin/actspace.context/supplement` 里，`owner` 是 `actspace.context-runtime`，`id` 是 `runtime-state`。现在被当成原始事件显示为「EVENT」行。
- **压缩**：`surface/replaced`（带 `compactionId`）和 `compaction/*` 已合并成一条压缩记录。
- **流式**：每个 `assistant/chunk` 都会产生新的 window。随后 `projectTrajectoryWindow` 全量克隆节点，`buildTrajectorySnapshot` 全量重建，整条路径没有任何节流。
- **流式记录身份**：流式记录的 id 是 `${sessionId}:record:assistant:${messageId}`，最终消息到来后不变。缺 `messageId` 时退回 `${sessionId}:partial`，与最终 id 不一致。

## 设计要点

### 1. 七种展示类型

布局层把 builder 的 `TrajectoryRecord.kind` 映射成 DSH 的 `cell.kind`：

| builder 记录 | cell.kind | 标签 |
| --- | --- | --- |
| `system` | `system` | 系统 |
| `user`：`user/message`，或 inbox claim 且 source 为 steer、或没有 source | `user` | 用户 |
| inbox claim 且 `source=task_notification`；supplement `op=add`（以 D2 结论为准） | `context` | 上下文 |
| `assistant`，包括 partial | `message` | 助手 |
| `tool`，且没有 `parentCallId` | `tool` | 工具 |
| `tool`，有 `parentCallId` | `subtool` | 子工具 |
| `compaction` | `compacted` | 已压缩 |
| `approval` | 不单独成行，并入对应工具 cell 的 `approval` 字段 | — |
| `retry`、`error` | 不单独成行，并入对应请求视图的 `retries`、`error` | — |
| `raw`（`delegation/*` 等） | 不进主表 | — |

「上下文」行的 `messageSource`：

- inbox claim：`{ kind: "task-notification", form: "notice", …原 data }`
- supplement：`{ kind: owner, id, lifetime }`

「来源」页签用 JsonTree 展示它。

### 2. 布局与表格行

`R/trajectory/layout.ts` 输出 `TrajectoryLayout`，结构是 `turns[] → groups[] → cells[]`：

- group 是「消息」或「第 N 步」；
- cell 带 `index`、`recordId`、`kind`、`turn`、`requestNumber`。

展平后每行带 `turnStart`、`turnEnd`、`groupStart`、`requestBoundary` 标记，规则照 DSH 的 `layout.ts` 和 `TrajectoryTable` 的展平逻辑：

- 第 N 轮标签贴在本轮第一条适合展示的记录上，跳过系统行和请求占位。
- 请求圆点贴在该请求组里第一条非输入记录上。

折叠：

- 双击一轮的起始行，或点工具栏「轮次」，收起整轮。摘要行显示「N 个步骤，N 个工具调用」。
- 双击带工具调用的助手行，或点工具栏「调用」，收起它的工具行。

### 3. 视觉规格

全部取自 DSH 源码，执行时以 DSH CSS 为准，下面是关键值。

**工具栏**

- 高 32px，底边 0.5px。
- 「时长」按钮高 20px，图标是 12px 的时钟。
- 「轮次」「调用」用 ⊞/⊟ 字形。
- 搜索框宽 164px、高 22px。

**时间轴**

- 标签栏 44px，轨道高 50px。
- 记录块高 8px、圆角 1px、最小宽 2px。
- 泳道距顶 7/21/35px；块间距 `min(宽度% × 0.08, 1px)`。
- 轮次分界线 0.5px。
- tooltip 延迟 500ms，内容为「开始 → 结束 / 总计 · 首 token · 解码」，字号 11px。
- 助手块用渐变分出首 token 等待段。
- 拖选、点击空白、滚轮缩放、放大后右键平移、Esc 清除，都按文档实现。

**表格**

- `<table>` 固定列宽：事件列中文 84px（窄于 620px 时 50px），内容列自适应。
- 行高 30px，底边 0.5px，字号 12/18。
- 第 N 轮标签是 8px 等宽字体，左上角，右下圆角 2px；完整文案「第 N 轮」和紧凑文案「#N」交叉淡变。
- 当前轮淡色竖线 2px，选中行深色竖线 3px。
- 请求圆点 5px，点击区 16px，跨在行的上边缘；悬停时显示「请求 #N」小标签。
- 类型标签高 19px、圆角 4px、10px 字、字重 650；窄宽度下只显示 13px 图标。
- 工具行内容是「请求 → 结果」两列网格。
- 行背景、透明度过渡 120ms。
- 搜索：不匹配的行直接过滤，时间轴上对应块降到 0.14 透明度。
- 时间轴范围选择：范围外的行透明度降到 0.24。

**详情面板**

- 宽度 `clamp(320px, 38%, 440px)`，拖拽范围 320–720px，双击恢复默认，键盘每步 16px。
- 头部高 42px，页签栏高 34px，选中页签有 2px 下划线。
- 概述是 94px 标签列的 `<dl>`，下面跟「参数 ›」这类可跳转的小节，小节内容溢出时底部渐隐。
- 小于 760px 时面板浮在表格上方。

**图标**

类型标签图标照抄 DSH：

| 类型 | 图标 |
| --- | --- |
| 系统 | 设置 |
| 用户 | 人像 |
| 上下文 | 信息 |
| 助手 | 闪光 |
| 工具、子工具 | 扳手 |
| 已压缩 | 四角箭头 |

DSH 的 SVG 路径放进 `R/components/trajectory/kind-icons.tsx`，不引入新图标库。

**颜色**

在 `tokens.css` 新增 `--act-trajectory-*` 变量，取 DSH 解析后的浅色、深色值。`color-mix` 的结果写成算好的 rgb。覆盖：

- 背景层、边框；
- 文字层级；
- 悬停、选中背景；
- 主色蓝；
- 7 种类型标签的文字色和底色；
- 时间轴块颜色、首 token 等待段颜色；
- 轮次竖线、选中竖线、请求圆点；
- tooltip；
- 差异视图的增删色；
- JsonTree 的键、字符串、数字、关键字、标点颜色。

**字号**

现有的 11/12/13px 用 `text-act-xxs/xs/sm`。新增：

- `--text-act-3xs: 10px`：类型标签、泳道标签；
- `--text-act-4xs: 9px`：请求圆点标签；
- `--text-act-5xs: 8px`：轮次标签。

### 4. 详情页签

`R/trajectory/detail-tabs.ts` 按类型和字段是否存在决定页签：

| 选中对象 | 页签 |
| --- | --- |
| 系统 | 差异（有前一版时）/ 系统提示词 / 工具 |
| 用户、上下文 | 概述 / 预览 / 原始内容 / 来源（有来源时） |
| 助手 | 概述 / 预览 / 原始内容 |
| 工具、子工具 | 概述 / 参数（有参数时）/ 结果（有结果时）/ Schema / 计时 |
| 已压缩 | 概述 / 原始输出 |
| 请求 #N | 概述 / 选项 / 用量 / 计时 |

请求概述包括：状态、提供方、模型、工具调用数，以及子工具调用数、错误、重试（有数据时）。

状态按 DSH 的 5 条规则推导，显示为「已完成」「等待中」「失败」：

1. `isError` 为真：失败；
2. 压缩记录没有时长：等待中；
3. 助手没有完成时间：等待中；
4. 工具没有结果：等待中；
5. 其他：已完成。

工具行有审批时，概述多一行「审批」，显示「等待批准」「已允许」「已拒绝」。

### 5. JsonTree

新增 `R/components/ui/JsonTree.tsx`，照 DSH 的 `JsonTree`：

- 顶层固定展开，子节点默认收起；
- 收起的节点显示简短预览；
- 长字符串按行数截断：来源页签 12 行，小节预览 3 行；
- 每层缩进 10px，展开三角 8×16。

用在：来源、参数、结果、选项、用量、Schema、工具目录参数。

工具目录每个工具是一个 `<details>`，展开后显示完整描述和参数 JsonTree。

### 6. 流式稳定

- **`use-trajectory-source.ts`**：组件仍跟随 context 渲染，但交给 `selectTrajectory` 的 cell 引用最多每个动画帧更新一次。WeakMap 缓存因此在同一帧内复用，builder 也最多每帧跑一次。
- **行身份**：行 key 用 `recordId`。builder 缺 `messageId` 的退回 id 改为按 `requestId` 生成，与失败的最终消息使用同一个 id。
- **行内容**：流式中的助手行显示累积的正文和思考摘要，不再显示 "Assistant responding…"；行组件用 `memo`，按记录内容比较。
- **时间轴**：时间轴模型的输入是去掉文本的结构签名。签名只包含 cell 的 id、kind、计时、isError，正文变化不触发重算。
- **运行中记录**：未知时长按 0 处理，不随时钟增长。

验收：在 streaming fixture 回放中，用 MutationObserver 统计流式行被重挂载的次数，结果必须是 0。

## 文件改动

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `R/styles/tokens.css` | 改 | 新增 `--act-trajectory-*`，浅色、深色、跟随系统三处都写 |
| `R/styles/tailwind.css` | 改 | 暴露 `--color-trajectory-*`；新增 3 个字号 token |
| `R/trajectory/builder.ts` | 改 | 只修数据：<br>• 上下文来源；<br>• supplement 和 inbox 分类；<br>• `tool-call-delta` 不进正文；<br>• 退回 id；<br>• 去掉 `runtime-context` 块。<br>`timeline()` 和 `groupVirtualRows` 移出。不新增功能代码，行数只减不增 |
| `R/trajectory/layout.ts` | 新 | 生成 Turn → Group → Cell；展平行；折叠摘要 |
| `R/trajectory/requests.ts` | 新 | 请求视图、编号（含历史偏移）、状态、重试和错误归并 |
| `R/trajectory/timeline.ts` | 新 | 从 builder 迁出：cell → span；四种模式；空闲压缩；结构签名 |
| `R/trajectory/status.ts` | 新 | 5 条状态规则 |
| `R/trajectory/format.ts` | 新 | DSH 的毫秒/秒、tok、tok/s、本地时间 `HH:MM:SS.mmm` 格式 |
| `R/trajectory/detail-tabs.ts` | 新 | 页签选择 |
| `R/trajectory/strings.ts` | 新 | DSH 中文文案常量 |
| `R/trajectory/contract.ts` | 改 | 新增 `TrajectoryCell`、`TrajectoryLayout`、`TrajectoryRequestView`、`TrajectoryRow` 类型 |
| `R/components/TrajectoryView.tsx` | 改 | 只做装配：数据源、选择状态、搜索、折叠、联动。不超过 400 行 |
| `R/components/trajectory/use-trajectory-source.ts` | 新 | fixture、projection 数据源，按动画帧合并 |
| `R/components/trajectory/use-trajectory-selection.ts` | 新 | 记录和请求选择、定位、展开祖先、从 Context 面板跳转 |
| `R/components/trajectory/TrajectoryToolbar.tsx` | 新 | 时长、轮次、调用、搜索、停止（以 D1 为准） |
| `R/components/trajectory/TrajectoryTimeline.tsx` | 重写 | 绘制和 Pointer 交互 |
| `R/components/trajectory/use-timeline-viewport.ts` | 新 | 视窗、缩放、平移、选中记录跟随 |
| `R/components/trajectory/TrajectoryTable.tsx` | 新 | `<table>`、虚拟化、加载更早历史 |
| `R/components/trajectory/TrajectoryRow.tsx` | 新 | 事件单元格（轮次标签、竖线、圆点、类型标签）和内容单元格 |
| `R/components/trajectory/kind-icons.tsx` | 新 | 7 种类型图标、时钟图标 |
| `R/components/trajectory/details/DetailPanel.tsx` | 新 | 头部、页签、宽度拖拽、关闭 |
| `R/components/trajectory/details/RecordOverview.tsx` | 新 | 概述字段和可跳转小节 |
| `R/components/trajectory/details/MessageBody.tsx` | 新 | 预览、原始内容；思考折叠；助手中的工具调用链接 |
| `R/components/trajectory/details/ToolBody.tsx` | 新 | 参数、结果、Schema |
| `R/components/trajectory/details/SystemBody.tsx` | 新 | 系统提示词、工具目录、差异 |
| `R/components/trajectory/details/RequestBody.tsx` | 新 | 请求概述、选项、用量 |
| `R/components/trajectory/details/TimingFields.tsx` | 新 | 计时 |
| `R/components/ui/JsonTree.tsx` | 新 | 通用 JSON 树 |
| `R/components/trajectory/TrajectoryDetails.tsx`、`TrajectoryContent.tsx`、`presentation.tsx` | 删 | 由 `details/*` 替代 |
| `R/components/ConversationView.tsx` | 改（D1 选工具栏时） | 去掉单独的停止栏，把 `onAbort`、`isAborting` 传给轨迹 |
| `R/trajectory/fixtures.ts`、`R/fixtures/trajectory-complete.json` | 改 | 补 inbox claim、supplement、子工具、审批拒绝、失败请求和重试；新增 `streaming` 回放 |
| `scripts/native-button-baseline.json` | 改 | 轨迹文件的原生按钮总数不超过现有合计，按新文件重分 |
| `R/test/trajectory-*.test.ts(x)` 等 | 改、新 | 见验证方式 |

每个新文件不超过 500 行。DSH 的 `TrajectoryTable.tsx` 很大，按上表拆成表格、行、详情三部分。

## 执行步骤

### T1 颜色与字号 token

- **改动**：
  - `tokens.css` 新增 `--act-trajectory-*`，浅色在 `:root`，深色在 `:root[data-theme="dark"]` 和 `@media (prefers-color-scheme: dark) :root[data-theme="system"]` 两处；
  - `tailwind.css` 新增语义色和 3 个字号。
- **验证**：`pnpm check:frontend-theme`、`pnpm check:frontend-tokens` 通过。

### T2 builder 数据修补

- **改动**：
  - supplement（`op=add`）和 inbox claim（`task_notification`）产出带 `messageSource` 的记录；
  - `tool-call-delta` 进入工具调用块，不进正文；
  - 退回 id 改为 requestId；
  - 预览里剥掉 `runtime-context` 块。
- **验证**：`trajectory-builder.test.ts`、`trajectory-real-journal.test.ts` 新增用例：
  - task_notification 记录的 `messageSource.kind` 为 `task-notification`；
  - 含 `tool-call-delta` 的流式记录 summary 不含参数片段；
  - 缺 `messageId` 的 chunk 与最终消息 id 相同。

### T3 布局、请求、时间轴、状态、格式、页签纯函数

- **改动**：新增 `layout.ts`、`requests.ts`、`timeline.ts`、`status.ts`、`format.ts`、`detail-tabs.ts`、`strings.ts`；`timeline()`、`groupVirtualRows` 从 builder 迁出。
- **验证**：新增 `trajectory-layout.test.ts`、`trajectory-timeline.test.ts`、`trajectory-format.test.ts`：
  - 7 种类型映射；
  - 轮起点跳过系统行；
  - 请求圆点在第一条非输入行；
  - 折叠摘要「2 个步骤，3 个工具调用」；
  - 泳道 0/1/2；
  - duration 模式压缩空闲；
  - 结构签名不受正文变化影响；
  - 5 条状态规则；
  - 格式：`850 毫秒`、`2.35 秒`、`12.4 秒`、`—`。

### T4 JsonTree

- **改动**：新增 `R/components/ui/JsonTree.tsx`。
- **验证**：新增 `json-tree.test.tsx`：
  - 顶层展开、子节点收起；
  - 点击展开；
  - 长字符串超过 12 行时出现「展开」；
  - 收起节点显示预览。

### T5 工具栏、表格与行

- **改动**：新增 `TrajectoryToolbar`、`TrajectoryTable`、`TrajectoryRow`、`kind-icons`，`TrajectoryView` 改成只做装配。
- **验证**：更新 `trajectory-render-view.test.tsx`：
  - 文案改中文：轨迹工具栏、搜索轨迹、第 1 轮、请求 #2、加载更早的历史；
  - 行的可访问名称改为「{请求前缀}{类型}，{内容}」；
  - 双击折叠和摘要行；
  - 点请求圆点打开请求详情，且不选中所在行。

### T6 时间轴

- **改动**：重写 `TrajectoryTimeline` 和 `use-timeline-viewport`。
- **验证**：
  - 渲染测试：块的 `--trajectory-span-left/width/lane` 变量值；
  - 点块选中对应行；
  - 拖选后范围外的行带 `data-timeline-focus=outside`；
  - Esc 清除。

### T7 详情面板

- **改动**：新增 `details/*`，删除旧的 Details、Content、presentation。
- **验证**：更新 `trajectory-relations.test.tsx`：
  - 页签名改中文；
  - 助手预览里的工具调用链接跳到工具行；
  - 子工具的层级链接跳到父工具；
  - 来源页签是 JsonTree；
  - 系统行的差异页签；
  - 工具目录展开。

### T8 流式稳定

- **改动**：`use-trajectory-source.ts` 按动画帧合并；行 `memo`；时间轴吃结构签名；新增 streaming fixture。
- **验证**：新增 `trajectory-streaming.test.tsx`：
  - 连续推送 5 个 chunk，助手行的 DOM 节点保持同一个；
  - 文本逐步变长；
  - 时间轴模型的派生函数只被调用 1 次。

### T9 停止按钮（以 D1 为准）

- **验证**：
  - `conversation-view-tooltip.test.tsx` 中「停止」调用 abort 的断言仍通过；
  - 输入框在轨迹模式下仍然 `display:none` 且草稿保留。

### T10 fixture 与文档

- **改动**：
  - 补 fixture 形态；
  - `FRONTEND_VERIFICATION.md` 加入口：`pnpm --filter @actspace/desktop dev:renderer`，打开 `http://127.0.0.1:5173/?mock=long-session&trajectoryFixture=complete`，另有 `&trajectoryTheme=dark` 和 `trajectoryFixture=streaming`；
  - 更新 `front-DSH轨迹能力迁移规范.md`；
  - 写 histories。
- **验证**：`pnpm check:current-docs`。

### T11 浏览器对照验收

- **做法**：
  - 用浏览器 mock 截图：浅色、深色、480px 窄窗，各打开一次助手、工具失败、请求、系统差异详情，再截一次 streaming 回放中的画面；
  - 和 DSH 参考页同尺寸截图逐项对比。DSH 参考页是第 2 版编译 demo，移到 `tmp/` 只作对照，不进仓库；
  - 结果记录到执行摘要。
- **验证**：截图存 `docs/exec-runs/20261014-trajectory-dsh-parity/shots/`；差异逐条列出，并标明已修或保留原因。

### T12 Electron 实机

- **做法**：先跑 `apps/desktop/scripts/verify-trajectory-electron.mjs`；再用真实会话检查：流式时行不闪、上下文行、请求圆点、浅色和深色。
- **验证**：执行摘要写清跑过哪些、没跑哪些。

顺序：T1、T2、T4 互不依赖，可以并行；T3 依赖 T2；T5–T7 依赖 T1、T3、T4；T8 依赖 T5、T6；T9 依赖 T5；T10–T12 最后做。

## 验证方式

### 命令（仓库根）

```bash
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop test
pnpm check:frontend-tokens
pnpm check:frontend-theme
pnpm check:renderer-bridge
pnpm check:current-docs
```

### 手工

- T11 的浏览器截图对照：浅色、深色、480px、流式回放。
- T12 的 Electron 实机检查。

### 观测

- streaming fixture 回放中，流式行重挂载次数为 0。
- 长会话（`trajectoryFixture=long`）回放时，主线程单帧不超过 16ms 的比例，以 Performance 面板抽查为准，记入执行摘要。

## 风险

- **builder 每帧全量重建**：长会话流式时仍可能卡。已由[轨迹页流式拆分](20261014-trajectory-streaming-split.md)处理（2026-10-14）。
  - 缓解：本次先按动画帧合并，并在执行摘要记录 long fixture 的帧耗时；超出预算就把增量 builder 记入技术债，另立计划。
- **DSH 颜色与周边不一致**：DSH 深色背景 `rgb(35,35,36)` 与 ActSpace 深色界面不同，轨迹页和周边标题栏可能有色差。
  - 缓解：T11 截图时专门检查交界处；有明显断层再与用户商量是否只调背景。
- **测试文案批量改动**：现有测试大量断言英文 aria-label，改中文会改到多个文件。
  - 缓解：T5–T7 每步只改对应测试，并在提交说明里写明原因。
- **原生按钮数限制**：新文件有不少按钮。
  - 缓解：能用 `Button`、`IconButton` 的就用；表格行用 `<tr>` 加 `onClick` 和键盘处理，不包按钮；请求圆点、页签、折叠摘要保留原生按钮，总数不超过现有合计。

## 回退

- 改动集中在 `R/trajectory/`、`R/components/trajectory/`、`R/components/TrajectoryView.tsx`、`tokens.css`、`tailwind.css`，不改 IPC 和后端。
- 回退时还原这些文件即可，旧的 Details、Content 组件可以从 git 恢复。

## 清理

| 对象 | 状态 | 处理 |
| --- | --- | --- |
| `docs/design-docs/frontend/trajectory-dsh-parity-demo.html` | 未跟踪，982 KiB，编译版 | 移到 `tmp/trajectory-demo-old/dsh-reference.html`，只作 T11 对照，不进仓库 |
| `docs/design-docs/frontend/trajectory-dsh-parity-handoff.md` | 未跟踪，描述的是已否决的编译方案 | 删除，内容由本计划取代 |
| `tmp/trajectory-demo-old/trajectory-dsh-parity-demo.v1.html` | 第 1 版手写 demo 备份 | 删除 |
| `tmp/trajectory-demo-old/check.mjs` | playwright 截图脚本 | 保留到 T11 结束，再删 |
| `tmp/deepseek-harness/.traj-demo/` | 编译脚手架，2.4 MB | 参考页移走后删除 |
| 旧组件和英文文案 | 现有代码 | 在 T5–T7 中删除 |

`tmp/` 被 git 忽略，上面的 tmp 文件删除后不可恢复，但都可以重新生成。

## 进度记录

- [x] 2026-10-14 读完 6 篇 DSH 说明，调研 ActSpace 数据与流式链路、DSH 视觉规格。
- [x] 2026-10-14 用户确认 K1–K8。
- [x] 2026-10-14 用户批准计划并要求全部实施；D1、D2 按建议执行。
- [x] 2026-10-14 T1–T12 全部完成（未提交）。执行记录：`docs/exec-runs/20261014-trajectory-dsh-parity/`。
- [ ] 用户验收：浏览器观感、`pnpm dev` 真实会话流式。

## 决策记录

- 2026-10-14：放弃 HTML demo（包括编译 DSH 源码的第 2 版），直接改现有代码。用户需要的是 ActSpace 自己的实现，DSH 只作为行为和视觉的标准。
- 2026-10-14：颜色用 DSH 取值，但写成 `tokens.css` 里的主题变量，组件只用语义类。这样既满足「照 DSH」，也满足主题检查的约束。
- 2026-10-14：用户回复「开始实现吧，把这个计划全部实现完成」，没有单独回答 D1、D2，按计划中的建议执行：D1「停止」放进工具栏最右侧，去掉单独一行；D2 supplement `op=add` 显示为「上下文」行，`remove`、`bind` 不进主表。用户验收时可改。
- 2026-10-14：DSH 的 CSS module 移植成全局 `styles/trajectory.css`，不改写成 Tailwind 类。DSH 依赖伪元素、容器查询和属性选择器，用类无法一比一还原；颜色仍只在 `tokens.css`。
- 2026-10-14：已收起的轮次摘要用 DSH 原文「N 个步骤 · N 个工具调用」，不用正文里写的逗号。
- 2026-10-14：隐藏的「实际时间」开关不渲染，省一个原生按钮；`time`、`actual` 模式留在纯函数里。
- 2026-10-14：系统提示词差异自写按行 LCS（`prompt-diff.ts`），不引入 `diff` 依赖。
- 2026-10-14：时间轴点空白处建最小范围并选中最近记录（DSH 只聚焦）。保留，便于从时间轴跳到表格。
- 2026-10-14：请求没有记录选项时不显示「选项」页签。
- 2026-10-14：Electron 验收脚本已过时（storage 注入、bridge 分组、分页 20 轮），一并修正；轨迹页隐藏输入框，草稿检查改在对话视图里做。

## 执行模式

交互模式：界面改动，需要用户看截图验收。

## 执行文档

执行开始时创建 `docs/exec-runs/20261014-trajectory-dsh-parity/execution-process.md` 和 `execution-summary.md`。
