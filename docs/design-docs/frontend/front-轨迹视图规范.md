# 轨迹视图规范

Trajectory 是会话主视图的一种工作模式，由标题栏的单个按钮（`SessionViewToggle`）在 Chat 与 Trajectory 间切换。它复用 DeepSeek Harness（DSH）的轨迹运行模型和页面能力，但不引入 DSH 的独立 tab、路由或会话 tab 状态；子 Agent 的轨迹在右侧「子 Agent」面板里查看，见 [front-子Agent与后台任务规范.md](front-子Agent与后台任务规范.md)。代码在 `apps/desktop/src/renderer/trajectory/`（纯类型、builder、layout、timeline、search）和 `components/trajectory/`（React 渲染）。

## 1. 数据层级

```text
Session Journal
  -> RuntimeV2TrajectorySnapshot（projectTrajectoryWindow，JSON-safe 原始节点）
  -> splitLiveChunks（live.ts：定稿节点 / 正在输出的 chunk 组，定稿键 settledKey）
  定稿层（settledKey 不变就不重算）：
    buildTrajectorySnapshot（builder.ts：Journal 节点 -> 语义记录；正在输出的助手只留空占位）
    -> deriveLayout（layout.ts + requests.ts：Turn -> Group -> Cell，请求视图与编号）
    -> flattenLayout / filterRows / collapseTurns / collapseAssistants（表格行）
    -> deriveTimeline（timeline.ts，按 [定稿布局, 模式] 缓存）
  流式层（每帧）：
    createLiveAccumulator（只折叠新到的 chunk）-> streamingCells（按 recordId 的流式 cell）
  搜索：TrajectorySearchIndex（search-index.ts，按 recordId 增量，3 秒节流）
  -> TrajectoryToolbar / TrajectoryTimeline / TrajectoryTable / details/*
```

- React 组件不直接猜 Journal 事件关系，只消费 runtime builder 的结果：request、assistant、partial assistant、tool tree、compaction、turn / step location 和 source references 的关联都在 builder 里完成。
- 适配 ActSpace：DSH 的 Context / SessionEvent / assembler 对应 ActSpace Journal event envelope 与 `RuntimeV2TrajectorySnapshot`；`Map`、类实例和回调不跨 IPC，IPC / preload 只传 JSON-safe DTO，renderer 内再恢复索引；保留 `ConversationLocation` 的 session / turn / step / unresolved 层级，保留 `eventSeq`、`throughJournalSeq`、`sessionId`，cell 上记 `sourceSeq` / `sourceSequences` / `rawRef`，可从可读记录追溯 Journal。
- 窗口：主进程先读 Session snapshot，再把 Journal 截取到 `throughJournalSeq`，所有投影共享同一版本，缺失版本范围直接报错不拼接混合版本。`getSessionProjectionSnapshot` 的 `beforeSeq` / `afterSeq` 驱动事件窗口：初始返回最近 20 个完整 Turn（历史页不带已定稿消息的 chunk，旧的大 request/context 只保留模型 / 路由等身份字段，轨迹对这些请求不展示完整提示词），向前读取按 `beforeSeq` 继续，绝对序列、Turn 与 Request 编号保留。本地历史窗口默认约 120 条语义记录，按完整 Turn 对齐，「Load earlier history」扩展，timeline 聚焦早期记录自动展开。展示分页不代表后端增量读取；projection-cache 从 storage 读取完整快照并按后端 identity、revision、codec 和 projection 版本复用。
- 刷新：Desktop 传 journal-update 的事件与 changed values，accepted 与 durable 水位分离，客户端遇到缺口再读窗口，不把 live 通知当作 fsync 证明。Bridge 刷新时保留已加载窗口、校验会话身份和版本、拒绝失效加载结果；运行中 Assistant 与最终消息保持稳定选择；异常流用同 requestId 关联终止消息。

## 2. 记录与事件显示规则

- builder 记录映射成 7 种 cell：系统、用户、上下文、助手、工具、子工具（有 `parentCallId`）、已压缩。`rawRecords` 保存所有节点，主列表只展示语义记录；Initial System Prompt 在 Turn 外，未改变的 header / context 不重复形成「系统」。
- `assistant/chunk` 进入 AssistantState accumulator，保留在 raw source，不逐 chunk 生成普通行；已完成 assistant 显示最终 message 及其 blocks、timing、usage；运行中的 assistant 最多一个 partial record。
- tool call 与 tool result 按 `callId` 配对；子工具形成递归 subtool tree，异常或中断生成可追溯的 error result；审批并入工具行（概述里的「审批」字段）。
- 用户消息可来自 surface；Inbox enqueue / claim / discard 只把 materialized claim 显示为用户，避免重复。上下文行有两种来源：`plugin/actspace.context/supplement` 的 `op=add`，以及 `source=task_notification` 的 inbox claim（`remove`、`bind` 不进主表）。上下文分类按 owner 映射（`contextCategory`）：owner `actspace.context-background-tasks` 显示为「后台任务」、标题「后台任务清单」，任务全部结束后的收尾文本显示为「已更新」；后台任务完成通知仍是 inbox claim，分类「通知」。
- 重试、错误并入请求视图（「重试」「上次尝试错误」「错误」）；其余原始事件不进主表，但仍可作为详情 source 展示。不通过隐藏原始事件替代 runtime 关联。
- request/context.snapshot 提供 renderedSystemPrompt、systemSections、tools、requestOptions 和 prepared 模型事实；工具 Schema 优先取真实 `inputSchema`，Result 读取 modelOutput，保留 `resultRaw` 与来源序列。TTFT 优先从对应 request/header 计时，避免重试时包含前次请求等待；缺失首 token 或 usage 不估造。

**请求**：每个步骤一个请求视图，key 是 `turnId\u0000stepId`；同一步骤的重试换新 requestId 但折进同一视图；压缩也算一次请求；编号按 Journal 顺序加历史偏移。请求圆点贴在每个请求组里第一条非输入行上，还没有可见记录的请求显示为占位行（零高度，只有圆点）。请求边界按钮附着到消息行，不让虚拟化器承担零高度节点。

**状态**：按 DSH 的 5 条规则（`status.ts`），显示为「已完成」「等待中」「失败」。

## 3. 工具栏、时间线与表格

- 工具栏（`TrajectoryToolbar`，文案在 `strings.ts`）：时长（`sequence` 与移除 idle gap 的 `duration` 间切换）、轮次、调用（展开 / 收起全部）、搜索；运行中在搜索框右侧多一个「停止」（调用原有 abort，切换视图不影响运行）。DSH 隐藏的「实际时间」开关不渲染，`time` / `actual` 模式只留在纯函数里。
- 轨迹视图隐藏整个底部输入区（Review、输入框、模型选择、底部状态），用隐藏布局而非卸载 Composer，切回会话保留草稿、附件和模型；DSH 为浮动输入框预留的底部空白不搬。Composer 继续由 Conversation Shell 持有，Trajectory 只是中心 viewport 内容。
- 表格虚拟化：基于 row height、overscan、history sentinel 的 ledger。搜索基于 stable record id 的增量索引，只搜文字，首次立即建立、之后最多每 3 秒更新（新流式出的文字最多晚 3 秒能搜到，DSH 同样）。关联跳转（工具 ↔ 所属 Assistant、Tool Hierarchy 返回父工具）会恢复目标所在 Turn、工具组与父工具的折叠并扩展本地历史窗口，只有搜索或时间范围排除目标时才解除对应条件，时间轴随选中记录定位。
- 颜色取 DSH 的浅色、深色值，写成 `tokens.css` 的 `--act-trajectory-*` 变量，组件和 `styles/trajectory.css` 只引用变量；轨迹页不跟随强调色。样式是移植的全局 CSS（前缀 `tjv-`、`tjb-`、`tjl-`、`tj-`）和 `styles/json-tree.css`，因为 DSH 依赖伪元素、容器查询和属性选择器，Tailwind 类无法一比一还原。

## 4. 详情页签

详情页签定义在 `detail-tabs.ts`；换选中对象时回到最近用过且新对象也有的页签。不做 `run_code` 代码页签。

| 选中 | 页签 |
| --- | --- |
| 系统 | 差异（有前一版）/ 系统提示词 / 工具 |
| 用户、上下文、助手 | 概述 / 预览 / 原始内容 / 来源（有来源时） |
| 工具 | 概述 / 参数 / 结果 / Schema / 计时 |
| 已压缩 | 概述 / 原始输出 |
| 请求 | 概述 / 选项（有选项时）/ 用量 / 计时 |

- 助手摘要含请求计时；用户标题「Turn N · Message」，助手「Turn N · Step N」；Prompt 更新显示逐行差异。
- 助手的 `sourceBlocks` 按消息原始顺序保留 thinking / text / tool-call，工具块存 `callId`、工具名和未截断的参数，文本摘要不混入参数 JSON。`assistantRecordId` 从消息工具块 `callId` 或工具事件 `assistantMessageId` 解析，多个归属冲突或身份缺失时留空，不按相邻行、工具名或同一步猜测；嵌套工具经 `parentCallId` 继承归属。概述 / 预览 / 原始内容共用工具记录导航，缺失调用显示不可用入口；仅有工具侧明确归属、没有模型内容块的旧数据，可在预览展示引用，不虚构原始块。
- Schema 从工具事件携带的定义或该调用所属请求的 tools 快照读取，展示名称、描述和完整参数定义，不读当前全局工具注册表；缺失明确请求 / 归属时不把后来同名工具定义套到旧调用上。参数页是本次实参，与 Schema 分离。
- **已压缩的概述**：状态、触发方式（手动 / 自动）、时长、压缩消息数、Token（`182400 tok → 约 9100 tok`，压缩前含估算时为 `约 182400 tok → 约 9100 tok`），下面是摘要正文。builder 把 `compaction/start` 的区间和 `compaction/end` 的 `trigger` / `beforeTokens` / `afterTokens` / `beforeEstimated` 合进记录的 `compaction` 字段；旧 journal 没有触发方式时不显示那一行，没有 token 时显示「—」。对话里压缩分隔线的「在轨迹中查看」按 `compactionId` 选中这一行。

## 5. 流式

照 DSH 的 `finalized` + `streamingCells`：

- 数据源（`use-trajectory-source.ts`）把 projection 更新合并到每个动画帧一次。
- 拆分（`live.ts`）：一组 `assistant/chunk` 没有被 `assistant/message` 收尾、所在轮次也没有 `turn/end` 时算正在输出；它的 `tool-call-delta` 对上了已落盘的 `tool/call` 时仍算定稿（该工具要靠它的内容关联助手）。
- 定稿层：builder 只拿每组的第一个 chunk 和第一个非空 chunk，生成正文为空的占位记录（id、计时、首 token 时间与完整结果相同）。定稿键由会话、历史起点、定稿节点数、首尾序号和每组的结构签名组成；流式期间只有 chunk 在长，键不变，builder、布局、时间轴都不重算。
- 流式层：累加器按 recordId 记住处理到第几个 chunk，每帧只追加新增部分，再把正文、思考、工具调用块、`sourceSequences`、`raw` 合进占位 cell；拆分与不拆分的结果逐帧相等。表格按 recordId 用流式 cell 换掉占位 cell，详情选中这条助手时也用流式 cell，行组件按显示字段比较，只有这一行重渲，DOM 不重挂载。
- 增量 builder 不做：chunk 不再触发重建，但普通事件（工具调用、工具结果、请求头）到达时定稿层仍全量重建。
- 开发态用 `?trajectoryFixture=<name>`（含 `streaming`、`streaming-long`）回放，`?trajectoryTheme` 只临时覆盖样例主题并在卸载时恢复，不修改应用偏好；fixture 是显式开发 query，默认通过 `SessionProjectionProvider` / `DesktopSessionBridge` 读取真实 Session Projection。

## 6. 子智能体

- 父轨迹里，一次委派只占 `agent` 工具调用那一行，不把子会话记录并进来（「子工具」只指同一会话里带 `parentCallId` 的嵌套调用）。`trajectoryDelegations(snapshot)`（`subagents.ts`）从 `delegation/requested` 取出 `parentCallId → childSessionId`，`agent` 行详情的「概述」据此显示「子智能体」一栏和「查看轨迹」按钮。
- 点「查看轨迹」在右侧「子 Agent」面板打开这个子会话并停在轨迹页，面板顶部栏最右用与主会话相同的 `SessionViewToggle` 切换对话 / 轨迹；子轨迹由 `<TrajectoryView sessionId={child} variant="panel" />` 渲染：只在挂载时 `bridge.watch` 子会话，不处理 Context 面板跳转，详情从下半部分弹出、不能拖宽。

## 7. 不做

DSH 独立 Trajectory tab 系统、tab routing、tab persistence；Journal 存储格式迁移；实际时间开关；`run_code` 代码页签与语法高亮；独立轨迹标签页；把轨迹详情里的 Markdown 迁到 CM6 或纳入聊天区 Markdown 渲染。
