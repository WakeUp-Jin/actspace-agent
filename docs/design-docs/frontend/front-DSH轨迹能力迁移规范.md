# DSH 轨迹能力迁移规范

## 定位

ActSpace 的 Trajectory 是会话主视图中的一种工作模式，由标题栏单按钮在 Chat 与 Trajectory 间切换。它复用 DeepSeek Harness 的轨迹运行模型和页面能力，但不引入 DSH 的独立 tab、路由或会话 tab 状态。

## 数据层级

```text
Session Journal
  -> raw trajectory nodes
  -> trajectory definitions / snapshot builder
  -> layout turns and cells
  -> timeline spans, search index, virtual rows
  -> React renderer
```

`RuntimeV2TrajectorySnapshot` 只保存 ActSpace Journal 的 JSON-safe 原始节点。Trajectory runtime 层负责把节点关联成 DSH 语义模型：request、assistant、partial assistant、tool tree、compaction、turn/step location 和 source references。React 组件不直接猜测 Journal 事件关系，只消费 runtime builder 的结果。

## DSH 语义对照与迁移目标

- `ConversationNode`、`AssistantMessageNode`、`ToolResultNode`、`ToolCallBlock`、`RunningToolCall`、`PartialAssistant`、`RequestView`、`ConversationLocation` 等完整语义类型。
- 独立的 assistant、tool、request header、message、compaction Definitions 和 snapshot builder。
- Turn / Step / Message / Tool / Subtool / Context / Compacted cell layout。
- `sequence`、`duration`、`time`、`actual` 四种时间线模式，含 idle gap、missing timing fallback 和 range focus。
- 基于 stable record id 的增量搜索索引。
- 基于 row height、overscan、history sentinel 的虚拟化 ledger。
- 详情 inspector 的 Summary、Preview、Raw、Source、Input、Output、Schema、Options、Usage、Timing、Diff 等语义。
- 原始 event source sequence 和 raw reference，支持从可读记录追溯 Journal。

## ActSpace 适配

- DSH 的 `Context` / `SessionEvent` / `Conversation assembler` 适配 ActSpace Journal event envelope 和 `RuntimeV2TrajectorySnapshot`。
- DSH 运行时的 `Map`、类实例和回调不跨 IPC；IPC/preload 只传 JSON-safe DTO，renderer 内再恢复索引结构。
- 保留 `ConversationLocation` 的 session / turn / step / unresolved 层级，以便 request inheritance、timeline 和详情定位。
- 保留 `eventSeq`、`throughJournalSeq`、`sessionId`，并在 cell 上记录 `sourceSeq` / `sourceSequences` / `rawRef`。
- 颜色取 DSH 的浅色、深色值，但写成 `tokens.css` 的 `--act-trajectory-*` 变量，组件和 `styles/trajectory.css` 只引用变量；轨迹页不跟随强调色（2026-10-14 起）。
- Composer 继续由 ActSpace Conversation Shell 持有，Trajectory 只作为中心 viewport 内容，不卸载 Shell。

## 事件显示规则

- `assistant/chunk` 进入 AssistantState accumulator，保留在 raw source；不逐 chunk 生成普通 ledger 行。
- 已完成 assistant 显示最终 message 及其 blocks、timing、usage。
- 运行中的 assistant 最多显示一个 partial record，供 timeline、搜索和状态表达。
- tool call 与 tool result 按 callId 配对；子工具形成递归 subtool tree，异常或中断生成可追溯的 error result。
- request header/context 作为 request metadata 或 request-only cell，不丢失 prompt、model、provider、usage 和 timing。
- approval、retry、error、aborted、compaction 保留独立语义和详情信息。

## 组件边界

- runtime modules：纯类型、Definitions、snapshot builder、layout、timeline、search、virtual row grouping。
- React components：toolbar、timeline、table、turn、cell、details；只负责渲染和交互状态。
- session adapter：默认通过 SessionProjectionProvider / DesktopSessionBridge 读取真实 Session Projection；显式开发 query 继续提供 fixture source。

## 排除项

- DSH 独立 Trajectory tab 系统、tab routing、tab persistence。
- Journal 存储格式迁移。
- 通过隐藏原始事件来替代 runtime 关联；原始事件仍可作为行或详情 source 展示。

## 当前 renderer 实现（2026-09-06）

- 实现使用 `trajectory/contract.ts` 和纯函数 builder 适配上述 DSH 语义，不原样导入 Cordis 类或注册机制。
- toolbar 只展示 Duration/Turns/Calls/Search；Duration 在 sequence 和移除 idle gap 的 duration 间切换。time/actual 保留为纯函数模式。
- rawRecords 保存所有节点；主列表只展示语义记录。Initial System Prompt 在 Turn 外，未改变的 header/context 不重复形成 SYSTEM。
- User 标题为 Turn N · Message，按是否存在来源显示 Source；Assistant 为 Turn N · Step N，Summary 包含 Request Timing；Tool 为 Summary/Payload/Result/Schema/Timing，支持父工具关系。Prompt 更新显示逐行 Diff。
- 请求边界按钮附着到消息行，不让虚拟化器承担零高度节点。真实请求没有对应展示消息的分页/增量行为，在 Phase 5 的 adapter 联调中验证。
- 本地历史窗口默认约 120 条语义记录，按完整 Turn 对齐；Load earlier history 扩展窗口，timeline 聚焦早期记录会自动展开。这里不发起真实网络请求。
- fixture 为开发态显式 query，`trajectoryTheme` 只临时覆盖样例主题并在卸载时恢复，不修改应用偏好。
- Electron 启动与构建不等同于实机验收；当前临时应用未被 Computer Use 识别，Phase 5 仍需完成实机门禁。

## 消息内容与工具导航（2026-09-06）

- `sourceBlocks` 按消息原始顺序保留 thinking / text / tool-call；工具块存储 `callId`、工具名和未截断的参数。文本摘要不混入工具参数 JSON。
- `assistantRecordId` 在 builder 中从消息工具块的 `callId` 或工具事件的 `assistantMessageId` 解析；多个归属冲突或身份缺失时留空，不按相邻行、工具名称或同一步猜测。嵌套工具经 `parentCallId` 继承归属。
- Assistant Summary / Preview / Raw 共用工具记录导航；Raw 显示原始内容块，完整事件 JSON 仍在 Source events。缺失调用显示不可用入口。Tool Hierarchy 返回父工具或所属 Assistant。仅有工具侧明确归属、没有模型内容块的旧数据，可以在 Preview 展示引用，但不虚构 Raw 块。
- 关联跳转恢复目标所在 Turn、工具组与父工具折叠，扩展本地历史窗口；只有搜索或时间范围排除目标时才解除对应条件。时间轴随选中记录定位。
- Schema 从工具事件携带定义或该调用所属请求的 tools 快照读取，展示名称、描述和完整参数定义；不读取当前全局工具注册表。缺失明确请求/归属时不把后来同名工具定义套到旧调用上。Payload 是本次实参，与 Schema 分离。
- ~~ledger 移除请求编号小标记~~：2026-10-14 恢复 DSH 的请求圆点，见下文「DSH 对齐实现」。
- 以上仍属于 renderer fixture / 关联适配阶段；Phase 5 需独立核对真实 Journal 字段与 IPC 契约。

## Phase 5 真实接入（2026-09-06）

- 原始 node 除 `data` 外保留 `surface`、`source`。用户正文可来自 surface；Inbox enqueue/claim/discard 只将 materialized claim 显示为 USER，避免重复。
- request/context.snapshot 提供 renderedSystemPrompt、systemSections、tools、requestOptions 和 prepared 模型事实。工具 Schema 支持真实 inputSchema；Result 读取 modelOutput，保留 resultRaw 与来源序列。
- 主进程先读取 Session snapshot，再将 Journal 截取到 snapshot.throughJournalSeq，所有投影共享同一版本；缺失版本范围直接报错，不拼接混合版本。
- `getSessionProjectionSnapshot` 的 `beforeSeq` / `afterSeq` 驱动同一 Journal 的事件窗口：初始返回最近 20 个完整 Turn（历史页不携带已定稿消息的 chunk，旧的大 request/context 只保留模型/路由等身份字段，Trajectory 对这些请求不再展示完整提示词），向前读取时按 `beforeSeq` 继续；绝对序列、Turn 与 Request 编号保留。Chat、Trajectory、Tool Card 分别解释窗口中的原始事件，窗口纳入 turn/start 前已入 Surface 的 Inbox claim。
- 2026-09-21：Host Registry facts 反映全 Session；窗口传输仅含对应 raw events、Surface 和 tools。当前 projection-cache 从 storage 读取完整快照，按后端 identity、revision、codec 和 projection 版本复用；Turn/Request/call 索引只在内存派生，不读取磁盘 checkpoint 或 Journal 字节偏移缓存。展示分页不代表后端增量读取。
- 2026-09-21：Desktop 传递 journal-update 的事件与 changed values；accepted 与 durable 水位分离，客户端遇到缺口再读窗口，不把 live 通知当作 fsync 证明。
- Bridge 在刷新时保留已加载窗口，校验会话身份和版本，拒绝失效加载结果。运行中 Assistant 与最终消息维持稳定选择；异常流使用同 requestId 关联终止消息。
- TTFT 优先从对应 request/header 计时，避免重试时包含前次请求等待；缺失首 token 或 usage 不估造。
- Electron 隔离实测使用真实临时 Journal、生产 renderer、main/preload/IPC；已覆盖历史加载、内容关联、Schema、提交通知、草稿切换和重载。真实 Provider 连续会话与超大 Journal 性能未在本轮验证。

## 输入区可见性（2026-09-06）

轨迹视图隐藏整个底部输入区，包括 Review、输入框、模型选择与底部状态；使用隐藏布局而非卸载 Composer，切回会话保留草稿、附件和模型。运行中在轨迹工具栏最右侧（搜索框右边）提供「停止」，调用原有 abort；切换视图不影响运行。DSH 为浮动输入框预留的底部空白不搬（2026-10-14）。

## DSH 对齐实现（2026-10-14）

计划：`docs/exec-plans/completed/20261014-trajectory-dsh-parity.md`。本节取代上文 2026-09-06 各节里与之冲突的描述（英文文案、`Summary/Payload` 页签名、单独的 Stop 行、去掉请求标记）。

**数据流**

```text
RuntimeV2TrajectorySnapshot（projectTrajectoryWindow，同一事件对象只转换一次）
  -> splitLiveChunks（live.ts：定稿节点 / 正在输出的 chunk 组，定稿键 settledKey）
  定稿层（settledKey 不变就不重算）：
    -> buildTrajectorySnapshot（builder.ts：Journal 节点 -> 语义记录；正在输出的助手只留空占位）
    -> deriveLayout（layout.ts + requests.ts：Turn -> Group -> Cell，请求视图与编号）
    -> flattenLayout / filterRows / collapseTurns / collapseAssistants（表格行）
    -> deriveTimeline（timeline.ts，按 [定稿布局, 模式] 缓存）
  流式层（每帧）：
    -> createLiveAccumulator（只折叠新到的 chunk）-> streamingCells（按 recordId 的流式 cell）
  搜索：TrajectorySearchIndex（search-index.ts，按 recordId 增量，3 秒节流）
  -> TrajectoryToolbar / TrajectoryTimeline / TrajectoryTable / details/*（表格和详情按 recordId 把占位换成流式 cell）
```

**类型映射**：builder 记录映射成 DSH 的 7 种 cell：系统、用户、上下文、助手、工具、子工具（有 `parentCallId`）、已压缩。

**子智能体**（2026-10-21，对齐 DSH「轨迹只显示当前会话」）：

- 父轨迹里，一次委派只占 `agent` 工具调用那一行，不把子会话的记录并进来。「子工具」只指同一会话里带 `parentCallId` 的嵌套调用。
- `trajectoryDelegations(snapshot)`（`trajectory/subagents.ts`）从 `delegation/requested` 取出 `parentCallId → childSessionId`。`agent` 行详情的「概述」据此显示「子智能体」一栏和「查看轨迹」按钮。
- 点「查看轨迹」会在右侧「子 Agent」面板打开这个子会话，并停在轨迹页。面板标题前用和主会话一样的 `SessionViewToggle` 切换对话 / 轨迹。
- 子轨迹由 `<TrajectoryView sessionId={child} variant="panel" />` 渲染：
  - 只在挂载时 `bridge.watch` 子会话。
  - 不处理 Context 面板跳转。
  - 详情从下半部分弹出，不能拖宽。

- 上下文行有两种来源：`plugin/actspace.context/supplement` 的 `op=add`，以及 `source=task_notification` 的 inbox claim。`remove`、`bind` 不进主表。
- 上下文分类按 owner 映射（`contextCategory`）：owner `actspace.context-background-tasks` 显示为「后台任务」，标题「后台任务清单」；任务全部结束后的收尾文本同样显示为「已更新」。后台任务完成通知仍是 inbox claim，分类「通知」。
- 审批并入工具行（概述里的「审批」字段）。
- 重试、错误并入请求视图（「重试」「上次尝试错误」「错误」）。
- 其余原始事件不进主表。

**请求**：每个步骤一个请求视图，key 是 `turnId\u0000stepId`。同一步骤的重试会换新的 requestId，它们折进同一个视图。压缩也算一次请求。编号按 Journal 顺序，加历史偏移。

- 请求圆点贴在每个请求组里第一条非输入行上。
- 还没有可见记录的请求显示为占位行（零高度，只有圆点）。

**状态**：按 DSH 的 5 条规则（`status.ts`），显示为「已完成」「等待中」「失败」。

**详情页签**（`detail-tabs.ts`）：

| 选中 | 页签 |
| --- | --- |
| 系统 | 差异（有前一版）/ 系统提示词 / 工具 |
| 用户、上下文、助手 | 概述 / 预览 / 原始内容 / 来源（有来源时） |
| 工具 | 概述 / 参数 / 结果 / Schema / 计时 |
| 已压缩 | 概述 / 原始输出 |
| 请求 | 概述 / 选项（有选项时）/ 用量 / 计时 |

换选中对象时，回到最近用过且新对象也有的页签。不做 `run_code` 代码页签。

**已压缩的概述**：状态、触发方式（手动 / 自动）、时长、压缩消息数、Token（`182400 tok → 约 9100 tok`），下面是摘要正文。builder 把 `compaction/start` 的区间和 `compaction/end` 的 `trigger` / `beforeTokens` / `afterTokens` 合进记录的 `compaction` 字段；旧 journal 没有触发方式时不显示那一行，没有 token 时 Token 显示「—」。对话里压缩分隔线的「在轨迹中查看」按 `compactionId` 选中这一行。

**样式**：DSH 的 CSS module 移植成全局的 `styles/trajectory.css`（前缀 `tjv-`、`tjb-`、`tjl-`、`tj-`）和 `styles/json-tree.css`。原因是 DSH 依赖伪元素、容器查询和属性选择器，用 Tailwind 类无法一比一还原。

**流式**（照 DSH `finalized` + `streamingCells`，计划 `docs/exec-plans/completed/20261014-trajectory-streaming-split.md`）：

- 数据源（`use-trajectory-source.ts`）把 projection 更新合并到每个动画帧一次。
- 拆分（`live.ts`）：一组 `assistant/chunk` 没有被 `assistant/message` 收尾、所在轮次也没有 `turn/end` 时，算正在输出。它的 `tool-call-delta` 对上了已落盘的 `tool/call` 时，仍算定稿（那个工具要靠它的内容关联助手）。
- 定稿层：builder 只拿到每组的第一个 chunk 和第一个非空 chunk，生成正文为空的占位记录（id、计时、首 token 时间与完整结果相同）。定稿键由会话、历史起点、定稿节点数、首尾序号和每组的结构签名组成；流式期间只有 chunk 在长，键不变，builder、布局、时间轴都不重算。
- 流式层：累加器按 recordId 记住处理到第几个 chunk，每帧只追加新增部分，再把正文、思考、工具调用块、`sourceSequences`、`raw` 合进占位 cell。拆分路径和不拆分时的结果逐帧相等（`trajectory-live.test.ts`）。
- 表格渲染时按 recordId 用流式 cell 换掉占位 cell（DSH `TrajectoryTable` 的 `currentRecord`）；详情选中这条助手时也用流式 cell，正文实时变长。行组件按显示字段比较，只有这一行重渲，DOM 不重挂载。
- 搜索索引按 recordId 增量更新，记录对象没变就复用文本；首次立即建立，之后最多每 3 秒更新一次，所以新流式出的文字最多晚 3 秒能搜到（DSH 同样如此）。
- 开发态用 `?trajectoryFixture=streaming` 或 `streaming-long` 回放。

**不包含**：

- 实际时间开关：只隐藏，`time`、`actual` 模式留在纯函数里。
- 代码页签、语法高亮。
- 独立轨迹标签页。
- 增量 builder：chunk 不再触发重建，但普通事件（工具调用、工具结果、请求头）到达时定稿层仍全量重建；`streaming-long`（4232 个节点）约 10ms。
