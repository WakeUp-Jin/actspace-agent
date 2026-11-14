# 轨迹视图规范

Trajectory 是会话主视图的一种工作模式，由标题栏的单个按钮（`SessionViewToggle`）在 Chat 与 Trajectory 间切换。它复用 DeepSeek Harness（DSH）的轨迹运行模型和页面能力，但不引入 DSH 的独立 tab、路由或会话 tab 状态；子 Agent 的轨迹在右侧「子 Agent」面板里查看，见 [front-子Agent与后台任务规范.md](front-子Agent与后台任务规范.md)。代码在 `apps/desktop/src/renderer/trajectory/`（纯类型、builder、layout、timeline、search）和 `components/trajectory/`（React 渲染）。

## 1. 数据层级

```text
Session Journal
  -> RuntimeV2TrajectorySnapshot（projectTrajectoryWindow，JSON-safe 原始节点）
  定稿层（流式期间 Journal 不变，只在请求报出消息 id 时重算一次）：
    buildTrajectorySnapshot（builder.ts：Journal 节点 -> 语义记录；未结算的请求只留空占位）
    -> deriveLayout（layout.ts + requests.ts：Turn -> Group -> Cell，请求视图与编号）
    -> flattenLayout / filterRows / collapseTurns / collapseAssistants（表格行）
    -> deriveTimeline（timeline.ts，按 [定稿布局, 模式] 缓存）
  流式层（每帧）：
    LiveRunStore 的实时运行 -> requestOutputs（按 requestId 归组）-> streamingCells（填进占位 cell）
  搜索：TrajectorySearchIndex（search-index.ts，按 recordId 增量，3 秒节流）
  -> TrajectoryToolbar / TrajectoryTimeline / TrajectoryTable / details/*
```

- React 组件不直接猜 Journal 事件关系，只消费 runtime builder 的结果：request、assistant、partial assistant、tool tree、compaction、turn / step location 和 source references 的关联都在 builder 里完成。
- 适配 ActSpace：DSH 的 Context / SessionEvent / assembler 对应 ActSpace Journal event envelope 与 `RuntimeV2TrajectorySnapshot`；`Map`、类实例和回调不跨 IPC，IPC / preload 只传 JSON-safe DTO，renderer 内再恢复索引；保留 `ConversationLocation` 的 session / turn / step / unresolved 层级，保留 `eventSeq`、`throughJournalSeq`、`sessionId`，cell 上记 `sourceSeq` / `sourceSequences` / `rawRef`，可从可读记录追溯 Journal。
- 窗口：主进程先读 Session snapshot，再把 Journal 截取到 `throughJournalSeq`，所有投影共享同一版本，缺失版本范围直接报错不拼接混合版本。`getSessionProjectionSnapshot` 的 `beforeSeq` / `afterSeq` 驱动事件窗口：初始返回最近 20 个完整 Turn（历史页不带已定稿消息的 chunk；窗口不从头开始时，主进程把窗口起点之前最近一条 `request/system-prompt` 和 `request/tools` 放到窗口最前面，它们不占窗口的事件与字节预算，轨迹只把它们当比较基准），向前读取按 `beforeSeq` 继续，绝对序列、Turn 与 Request 编号保留。本地历史窗口默认约 120 条语义记录，按完整 Turn 对齐，「Load earlier history」扩展，timeline 聚焦早期记录自动展开。展示分页不代表后端增量读取；projection-cache 从 storage 读取完整快照并按后端 identity、revision、codec 和 projection 版本复用。
- 刷新：Desktop 传 journal-update 的事件与 changed values，accepted 与 durable 水位分离，客户端遇到缺口再读窗口，不把 live 通知当作 fsync 证明。Bridge 刷新时保留已加载窗口、校验会话身份和版本、拒绝失效加载结果；运行中 Assistant 与最终消息保持稳定选择；异常流用同 requestId 关联终止消息。

## 2. 记录与事件显示规则

- builder 记录映射成 7 种 cell：系统、用户、上下文、助手、工具、子工具（有 `parentCallId`）、已压缩。`rawRecords` 保存所有节点，主列表只展示语义记录；Initial System Prompt 在 Turn 外。系统行锚在 `request/context` 上：该请求生效的提示词或工具记录换了一条，且固定系统文本或工具 digest 真的变了，才出一行（初始系统提示词 / 系统提示词已更新 / 工具已更新 / 系统提示词和工具已更新）。规则、技能等分段变化不出系统行，由上下文行展示。
- 新会话的日志里没有 `assistant/chunk`（[流式输出只走实时通道](../agent-plugin-runtime/agent-spec-live-assistant-stream.md)）。已完成 assistant 显示最终 message 及其 blocks、timing、usage，首 token 时间读 `assistant/message.firstTokenAt`；每个未结算的请求有一个占位 assistant（§5）。旧会话里的 chunk 仍进入 AssistantState accumulator，保留在 raw source，不逐 chunk 生成普通行，首 token 缺字段时从 chunk 补算。
- tool call 与 tool result 按 `callId` 配对；子工具形成递归 subtool tree，异常或中断生成可追溯的 error result；审批并入工具行（概述里的「审批」字段）。
- 用户消息可来自 surface；Inbox enqueue / claim / discard 只把 materialized claim 显示为用户，避免重复。上下文行有三种来源：`plugin/actspace.context/supplement` 的 `op=add`；`source=task_notification` 的 inbox claim（`remove`、`bind` 不进主表）；相邻两条 `request/system-prompt` 的 `sections` / `modelFacts` 比较得出的「已加载 / 已更新 / 已移除」（窗口前带进来的那条只作基准）。上下文分类按 owner 映射（`contextCategory`）：owner `actspace.context-background-tasks` 显示为「后台任务」、标题「后台任务清单」，任务全部结束后的收尾文本显示为「已更新」；后台任务完成通知仍是 inbox claim，分类「通知」。
- 重试、错误并入请求视图（「重试」「上次尝试错误」「错误」）；其余原始事件不进主表，但仍可作为详情 source 展示。不通过隐藏原始事件替代 runtime 关联。
- 某次请求的提示词和工具取 seq 不大于其 `request/context` 的最近一条 `request/system-prompt` / `request/tools`（`@actspace/shared` 的 `indexRequestRecords`）；系统提示词文本由 `renderSystemPrompt(sections, modelFacts)` 推出，「原始内容」显示 `request/context` 加当时生效的两条记录。`request/context.snapshot` 只提供 requestOptions 和 prepared 模型事实。工具 Schema 优先取真实 `inputSchema`，Result 读取 modelOutput，保留 `resultRaw` 与来源序列。TTFT 优先从对应 request/header 计时，避免重试时包含前次请求等待；缺失首 token 或 usage 不估造。

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
- Schema 从工具事件携带的定义或该调用所属请求生效的 `request/tools` 读取，展示名称、描述和完整参数定义，不读当前全局工具注册表；缺失明确请求 / 归属时不把后来同名工具定义套到旧调用上。参数页是本次实参，与 Schema 分离。
- **已压缩的概述**：状态、触发方式（手动 / 自动）、时长、压缩消息数、Token（`182400 tok → 约 9100 tok`，压缩前含估算时为 `约 182400 tok → 约 9100 tok`），下面是摘要正文。builder 把 `compaction/start` 的区间和 `compaction/end` 的 `trigger` / `beforeTokens` / `afterTokens` / `beforeEstimated` 合进记录的 `compaction` 字段；旧 journal 没有触发方式时不显示那一行，没有 token 时显示「—」。对话里压缩分隔线的「在轨迹中查看」按 `compactionId` 选中这一行。

## 5. 流式

照 DSH 的 `finalized` + `streamingCells`。正在输出的文字不在日志里，来自界面进程的实时运行（`LiveRunStore`）：

- 数据源（`use-trajectory-source.ts`）把 projection 更新合并到每个动画帧一次。
- **占位**（`builder.ts`）：一个请求有 `request/header`，但还没有同 `requestId` 的 `assistant/message`、`llm/retry`（旧会话还有 `assistant/chunk`），所在轮次也没有 `turn/end`，就生成一条正文为空的占位 assistant 记录（`placeholder: true`、`partial`、`running`，带 `requestId`）。
  - 记录 id：实时运行已经报出这个请求的 `messageId` 时，与定稿消息相同（`<session>:record:assistant:<messageId>`），定稿后这一行不换 id。还没报出时用 `<session>:record:assistant:request:<requestId>`（`placeholderRecordId`）。
  - 失败后重试的请求被 `llm/retry` 结算，新请求有自己的占位。轮次结束了仍没有回复的请求不留占位，显示为请求占位行。
- **定稿层**：`buildTrajectorySnapshot(snapshot, { liveMessageIds })`，`liveMessageIds` 是实时运行里 `requestId → messageId` 的对应。流式期间日志不变；`liveMessageIdsKey` 只在请求开始输出、报出消息 id 时变化，`TrajectoryView` 以它和快照为依赖重算，builder、布局、时间轴在文字增长时都不重算。
- **流式层**（`live.ts`）：
  - `requestOutputs(run)`（`@actspace/client/live`）按 `llmCallId`（即 `requestId`）把实时运行的正文段、思考段和流式工具调用归组。
  - `streamingCells(layout.cells, outputs)` 只给占位 cell 填入摘要、预览、`outputDetail`、`thinkingDetail`、`sourceBlocks`（思考、正文，再是工具调用块）和 `raw`。
  - 表格按 recordId 用流式 cell 换掉占位 cell，详情选中这条助手时也用流式 cell。行组件按显示字段比较，只有这一行重渲，DOM 不重挂载。
  - `assistant/message` 到达后占位消失，流式 cell 被完整记录替换。
- 子会话轨迹（右侧面板）读子会话自己的实时运行（`useRequestOutputs(sessionId)`），子会话的 `agent_run_started` 已为它建立运行。
- 旧会话：已定稿消息的 chunk 仍由 builder 合并（`sourceSequences`、首 token 回退），它们不会处于「正在输出」。`fixtures/trajectory-complete.json` 保留 chunk，作为旧格式的回归样例。
- 增量 builder 不做：普通事件（工具调用、工具结果、请求头）到达时定稿层仍全量重建。
- 开发态用 `?trajectoryFixture=<name>`（含 `streaming`、`streaming-long`）回放，每帧给出 `{ snapshot, live }`，日志快照不变、实时输出逐帧增长。`?trajectoryTheme` 只临时覆盖样例主题，卸载时恢复，不修改应用偏好。fixture 是显式开发 query，默认通过 `SessionProjectionProvider` / `DesktopSessionBridge` 读取真实 Session Projection。

## 6. 子智能体

- 父轨迹里，一次委派只占 `agent` 工具调用那一行，不把子会话记录并进来（「子工具」只指同一会话里带 `parentCallId` 的嵌套调用）。`trajectoryDelegations(snapshot)`（`subagents.ts`）用 `foldSubagentTree` 从 `subagent/spawned`、`subagent/activation` 取出「调用 → 子智能体」（老会话来自 `delegation/requested`），创建子智能体的那一行详情的「概述」据此显示「子智能体」一栏（种类 · 描述）和「查看轨迹」按钮；Codex / Claude Code 没有子会话，没有按钮。
- 点「查看轨迹」在右侧「子 Agent」面板打开这个子会话并停在轨迹页，面板顶部栏最右用与主会话相同的 `SessionViewToggle` 切换对话 / 轨迹；子轨迹由 `<TrajectoryView sessionId={child} variant="panel" />` 渲染：只在挂载时 `bridge.watch` 子会话，不处理 Context 面板跳转，详情从下半部分弹出、不能拖宽。

## 7. 不做

DSH 独立 Trajectory tab 系统、tab routing、tab persistence；Journal 存储格式迁移；实际时间开关；`run_code` 代码页签与语法高亮；独立轨迹标签页；把轨迹详情里的 Markdown 迁到 CM6 或纳入聊天区 Markdown 渲染。
