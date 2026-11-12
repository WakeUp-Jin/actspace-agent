# 子 Agent、后台任务与侧边对话规范

右侧面板里三类「会话派生出来的对象」：子 Agent 面板、后台任务面板、侧边对话。面板外壳、Tab 与对象启动页见[右侧面板与文件渲染规范](front-右侧面板与文件渲染规范.md)；全局的文案、状态表达、token 与组件规则见前端必读规范，这里只写这三类面板自己的规则。运行时语义见[子智能体运行时](../collaboration/agent-subagent-runtime.md)、[后台任务](../collaboration/agent-background-tasks.md)、[侧边对话设计](../collaboration/side-chat-design.md)。

代码：`apps/desktop/src/renderer/components/right-panel/{SubagentsPanel,BackgroundTasksPanel}.tsx`、`right-panel/side-chat/`；状态文字与头像在 `components/messages/AgentIdentity.tsx`。

## 1. 入口与 Tab

| 面板 | Tab | 入口 |
|---|---|---|
| 子 Agent | id `subagents`，标题「子 Agent」，按当前会话隔离 | 对象启动页、对话里的子 Agent 卡片与通知行、轨迹详情的「查看轨迹」 |
| 后台任务 | id `background-tasks`，标题「后台任务」 | 对象启动页、消息里 Bash 行的「后台」标签 |
| 侧边对话 | id `side-chat:<sessionId>`，每条一个 Tab | 对象启动页、「+」菜单、`/side` |

- 启动页的「子 Agent」「后台任务」入口与「文档」「改动」同属开发类对象，没有会话时禁用；「+」菜单里没有这两项。
- 带定位的打开（`focus`）：子 Agent 用 `agentId + view（对话 / 轨迹）`，后台任务用 `taskId`；`revision` 每次点击递增，让已打开的 Tab 再次定位。列表还没到时先显示「正在加载…」，到了再选中；找不到时回到列表并说明（「找不到这个子智能体。」「找不到这条后台命令。应用重启前启动的命令不会出现在这里。」）。
- 本轮首次出现子 Agent 时自动打开「子 Agent」Tab，每个 turn 只开一次；用户关掉后不因后续更新再抢焦点。

## 2. 子 Agent 列表

按「运行中」「其他」分两组（「其他」含已中断、失败、已结束；没有「空闲」，老会话里空闲的子智能体显示为已结束）；空组不显示。组标题一行：左边组名，右边数量（`text-act-xs text-text-faint`）。组内没有外框和分隔线（2026-11-07 改，原来的分组卡分隔线顶到边框、悬停底色盖住圆角）：行自带 `rounded-act-md`，悬停才有 `bg-hover-overlay` 底色，与侧边栏会话行一致。

每个子 Agent 一行，三列：

- 左：28px 头像（`AgentAvatar`，按 `agentId` 固定）。
- 中：两行。上面是任务标题（`description`，单行截断，悬停看全文）；下面一句话（2026-11-08 改，见 §2.2）：
  - 运行中：此刻在做什么（`activity`，如「正在读取 · transaction.ts」），没有时写「正在思考」。刚来信时先显示来信摘要，见 §2.2。
  - 结束后：最终回复第一行（去掉 `**`、反引号和标题 / 列表标记，原样显示，不补文案），失败时用 `text-on-danger`；没有回复时不写这一行。
  - 这一行换内容时旧的上滑淡出、新的从下滑入（与原对话卡片第二行同一动画 `agent-activity.css`）；减少动态效果时直接替换。
- 右：两行，右对齐。上面是子会话累计 token（`18.4K tokens`），没有数据（外部子智能体、旧会话、子会话还没发出请求）时不写；下面是「状态文字 · 耗时」。

运行中的行最右固定一格（28px）：平时是绿色转圈；鼠标移到这一行或键盘聚焦时，转圈换成停止按钮（`IconButton` `variant="danger"` `shape="round"`，可读名称「停止 ‹描述›」，Tooltip「停止」），已转后台的走后台任务登记表的用户停止（模型下一步被告知是用户停的，不唤醒），同步等待中的直接中断。这一格宽度不变，切换时不挤动文字；按钮平时透明但仍在 Tab 顺序里。停止请求发出后只显示转圈；停止失败时列表顶部一行「停止失败：…」。

不显示类型（通用 / 探索 / Fork / Codex / Claude Code）、模型和「后台」标签，它们只在详情标题的悬停里。空列表写「此会话还没有子智能体。」，加载失败写「无法加载子智能体，请稍后重试。」。

### 2.1 主会话里的子智能体

子智能体在主会话里只有一种形象：一张单行卡片。派发时出一张，它发来消息时在消息到达的位置再出一张带正文的（来信卡片）。两种卡片的头部完全一样，状态跟着子智能体走。此刻在做什么只在右侧面板看（§2 第二行），对话里不显示。Demo：`docs/design-docs/frontend/subagent-compact-demo.html`（K1）。

**派发卡片**（`AgentRunBlock`，2026-11-08 改为单行）：

- 一行，高 34px，整张是按钮，点开右侧「子 Agent」并选中它；外观沿用原卡片（`rounded-act-md border border-line bg-surface-subtle`，悬停 `border-line-strong bg-surface`）。
- 从左到右：20px 头像（`AgentAvatar`）、任务标题（`description`，`flex-1` 单行截断，悬停看全文）、种类（通用 / 探索 / Fork / Codex / Claude Code，`text-act-xs text-text-faint`）、「后台」标签（只有后台运行时）、状态（`AgentStatus`：转圈「运行中」/ ✓「已完成」/ 「失败」/ 「已停止」，固定宽度；子智能体跑完就是终态，没有「空闲」）。
- 不再显示模型名和最新动态：模型在右侧详情顶栏，动态在右侧列表第二行。失败时卡片的 `title` 悬停给出错误，状态文字为「失败」（`text-danger`）。

**结束不另出行**：子智能体一次激活结束时，结果只体现在卡片的状态上（转圈停下，变为已完成 / 失败 / 已停止）。这个子智能体在对话里的所有卡片（派发卡片和来信卡片）一起变。

- 收件箱里后台子智能体的完成通知（`task_notification`，通知类型 `taskKind: "subagent"`；老会话的 `subagent_notification` 同样处理）在会话视图里不显示。主会话运行中读到的直接跳过；唤醒空闲主会话的仍然开新的一轮（领取事件 `opensTurn` 不变），只是这一轮没有开头那一行，由 `groupMessagesIntoTurns` / Web `buildTurns` 处理。
- `list_subagent_models` 只显示标题「查看可选模型」，不带工具结果；失败时带错误。`task_stop` 停的是子智能体时显示「停止 ‹描述›」一行（按任务 ID 认出子智能体）；停 Bash 仍是通用的任务行。

**来信卡片**（`agent_message`，`SubagentMessageCard`，2026-11-08 起替代 `BackgroundNoticeRow` 分隔行）：

- 外框 `rounded-act-md border border-line bg-surface`，上下两段：
  - 头部（`bg-surface-subtle`，高 32px）：20px 头像、发送方标题（`title`，即子智能体 `description`）、蓝色「来信」（`text-act-xs text-info`）、状态（同派发卡片的 `AgentStatus`）。整条头部是按钮（悬停 `bg-surface`），点开右侧「子 Agent」并选中发送方。
  - 正文（上边一条 `border-line` 分隔）：信的内容（去掉 `<agent_message>` 外壳），按聊天 Markdown 渲染，`text-act-md`，左边与头部的标题对齐。超过 6 行折叠，底部「展开」。
- 位置：唤醒空闲主会话的来信是那一轮的开头（没有用户提问时代替提问卡片的位置）；主会话运行中读到的来信留在它被读到的位置。来信卡片不收进「Worked for」：这一轮结束后，它显示在过程组外面、最终回复前面（运行中读到的那张按原位置排在过程组后）。
- 出现时轻轻上浮淡入（`rise-in`），减少动态效果时直接出现。
- 状态：发送方运行中显示转圈「运行中」，跑完一起变为已完成等。发送方查不到时（老数据、外部子智能体）不显示状态。

后台 Bash 通知仍是 `BackgroundNoticeRow` 分隔行；用户停止的任务，通知行状态写「已停止」。

### 2.2 右侧列表里的实时动态与来信

- 运行中的子智能体，列表第二行显示它此刻在做什么（`SubagentListItem.activity`），随列表每秒轮询更新。文案来自子智能体的实时事件（`SubagentActivity`：正在思考、正在读取 · 文件名、正在搜索 · 模式、正在分析、正在整理回复等），不显示模型输出的正文。
- 它刚发来一条消息时（`SubagentListItem.lastMessage`，`at` 在最近 6 秒内），这一行先显示「来信：」（`text-info`）加信的第一行，同时最右那一格的转圈换成 7px 蓝点（`bg-info`）；6 秒后恢复显示动态和转圈。悬停这一行时照常换成停止按钮。
- 动态只在主进程内存里（不写日志），应用重启后从下一个事件起才有。通用 / 探索 / Fork 没有动态时写「正在思考」；Codex / Claude Code 没有实时事件，运行中不写这一行。
- Web 端没有右侧面板，不显示动态；来信卡片同样替代分隔行（没有头像，头部是名字、「来信」、状态文字）。

## 3. 子 Agent 详情

### 3.1 顶部栏

一行，高 44px，从左到右：

1. 返回按钮：只有 `‹` 图标（`IconButton`，可读名称「返回子 Agent 列表」，Tooltip「返回」），不写面包屑。
2. 18px 头像 + 标题（`h2`，单行截断）。悬停标题给完整标题、类型和「后台」。
3. 模型名（`agentModelLabel`，`text-text-muted`，最宽约 96px，超出截断，悬停看原始模型 id）。没有模型时连同分隔点一起不显示。
4. 「状态文字 · 耗时」：与列表行右下同一个 `SubagentStatus`。
5. 最右：对话 / 轨迹切换（`SessionViewToggle`）。Codex / Claude Code 没有轨迹，不显示切换。

### 3.2 正文

- **本地 / Fork**：默认看对话，和主会话走同一套轮次渲染（`groupMessagesIntoTurns` + `TurnView`）：委派的任务是提问卡片，运行中过程平铺，结束后收进「Worked for」，最终回复留在折叠外；回复操作里不提供「分叉会话」。切到轨迹时复用 `TrajectoryView`（`variant="panel"`），它自己订阅子会话的 cell（不靠投影 context，那只跟父会话换新），子会话没到之前显示「正在加载轨迹…」。
  - Fork 在顶部栏下面多一行「从主会话 #N 分出」，Fork 的对话和轨迹都不含从主会话复制来的前缀。
  - 运行中每 750ms 拉一次记录；结束后拉到非空记录即停，拉取失败时最多重试 20 次，仍没有记录就退回显示最近一次的结论（Markdown）；都没有写「没有执行记录。」。运行变结束时保留已显示的内容，不闪回结论。
  - 记录暂时读不到时一行「执行记录暂不可用，正在重试。」；组件卸载、切子 Agent 或切会话时取消后续刷新，迟到响应不更新新视图。
- **Codex / Claude Code**：没有 ActSpace 子会话，也就没有轨迹。正文是最终回复（Markdown），下方一张「<类型> 记录文件」卡：路径（等宽，可换行）、复制路径、在 Finder 中显示；找不到文件时写「找不到这个记录文件，可能已被 <类型> 清理或移动。」。运行中没有结果时写「运行中，结束后在这里显示结果。」。
- 运行中底部一条栏，右侧「停止」危险按钮；停止失败的文字在栏内左侧。

### 3.3 数据与格式

- 列表项是 `SubagentListItem`（`projectSubagentItems`），由 `sessions.getSubagents` 每秒轮询；数据没变时保持引用不重渲染，只在有运行中的子 Agent 时推进耗时。
- 状态文字：`SubagentStatus` 只写文字（运行中、已中断、失败、已结束），不叠图标，不写「第 N 轮」；运行中整段绿色（`text-operational`），失败 `text-on-danger`。耗时用 `tabular-nums`，宽度不跳。
- 耗时按最近一次激活算：运行中是「现在 − `activeSince`」，结束后是「`endedAt` − `activeSince`」。格式：不到一分钟 `38s`，一分钟以上 `1m 12s`，一小时以上 `1h 05m`（`formatAgentDuration`）。
- token：`SubagentListItem.totalTokens`，取子会话快照的 `usage.totalTokens`（input + output + cache read + cache write 累加，与输入框用量胶囊同一口径），只有通用 / 探索 / Fork 有；格式 `formatTokenCount`（`999` / `18.4K` / `1.2M`）后接「tokens」。读子会话失败时不填，界面不显示。
- 模型名取该子 Agent 实际使用的模型（父会话委派完成时记下的，运行中取子会话最近一次请求的实际模型），不按用途猜。

## 4. 后台任务

只列后台 Bash 命令；后台子 Agent 虽然也登记在后台任务登记表里（`kind: "agent"`），但只在「子 Agent」面板里显示。登记表只在当前进程里，应用重启前的任务不会出现。

### 4.1 列表

- 面板每秒轮询 `tasksApi.listBackground`；按「运行中 · N」「已结束 · N」分组，空组不显示。
- 每行是一个整行按钮：左 `SquareTerminal` 图标；中间上行是 `description`（单行截断）加环境图标（沙盒 / 真实环境，`EnvironmentIcon`），下行是命令原文（等宽、单行截断，悬停给全文）；右侧状态。
- 状态：运行中是转圈加已运行时间（`accent`）；已完成且退出码为 0 是勾加「退出 0」（`success`）；非零退出是叉加「退出 N」（`on-danger`）；已停止、已中断是灰色文字。没有退出码时写「已完成」「失败」。
- 时间格式：`25s`、`3:27`、`1:02:03`；运行中算到现在，结束后算到结束时间。
- 空态「这次对话还没有在后台跑的命令。」；没有会话时「选择会话查看后台任务。」；读取失败「无法加载后台任务：…」。

### 4.2 详情

- 顶栏：返回（`IconButton`「返回后台任务列表」）、标题（`description`，单行截断）、状态。
- 信息四行（`dl`）：命令（等宽，可换行）、目录、环境（沙盒 / 真实环境，带图标）、时间（运行中「已运行 X」，结束后「运行了 X」）。
- 输出卡：头部「输出 · N 行」、「跟随最新」复选框（默认开）、复制按钮；正文是等宽预格式化文本，折行。运行中每秒拉一次输出；结束后再拉一次取到最后的输出就停。没有输出写「还没有输出。」（运行中）或「没有输出。」，读取失败写「无法读取输出：…」。
- 底栏：运行中左侧写「停止后会告诉模型是你停的」，右侧「停止」危险按钮，停止失败时左侧改写「停止失败：…」；结束后写「命令已结束。」。

## 5. 侧边对话

右侧面板 Tab 类型 `sideChat`：`{ id: "side-chat:<sessionId>", title, sessionId, parentSessionId, inheritedTurnCount?, runningTurnExcluded? }`。视图 `SideChatView` 外包 `SessionProjectionScope`：通过 `bridge.watch` 给非选中会话一份投影，复用外层 store 与 bridge，不改变当前选中会话。

### 5.1 入口

- 对象启动页入口「侧边对话」，说明「另起一条线问，带上目前为止的上下文」；「+」菜单里「侧边对话」排第一。启动页另有分组「本会话的侧边对话 · 已收起」，列出本主会话下当前没有打开 Tab 的侧边对话（`sessions.listSideChats`），每项带「N 分钟前更新」等相对时间；点击重新打开为 Tab，不新建会话。
- 只有本机运行目标显示；远端目标隐藏入口。
- 打开失败时错误显示在主 Composer 的 notice：「主会话还没有完成的一轮，暂时不能开侧边对话。」「侧边对话里不能再开侧边对话。」「主会话暂时不能分出侧边对话，请稍后再试。」「侧边对话没有打开，请重试。」

### 5.2 Tab 规则

- Tab 栏只显示 `parentSessionId` 等于当前主会话的侧边对话；切换主会话后它们隐藏，若激活的是侧边对话则回到启动页。
- 图标：空闲为 GitFork，其他状态显示会话状态点（running / approval / unread / failed，复用 `SESSION_STATUS_META`）。
- 标题：侧边对话自己的会话标题（与父标题、`New chat` 不同时）；否则首个用户问题（最多 40 字）；再否则「侧边对话 N」。首次提问时视图会把会话重命名为该问题（`runtime.rename`，每条只写一次），让已收起列表能认出它。
- 关闭按钮的动词是「收起」：只收起 Tab，侧边对话仍保存。

### 5.3 面板内容

- 消息流顶部是居中的小分隔线（两侧细线，随内容滚走，不做框和按钮）：「继承主会话 N 轮」；打开时主会话正在运行则为「继承主会话 N 轮，不含进行中的第 N+1 轮」；重新打开的 Tab 从窗口计数（无后缀），数不出时为「继承主会话的上下文」。
- 继承的消息不显示：隐藏 `sourceSeq ≤ lineage.parentBoundarySeq` 的 block 及这些 run 的合成 block。「加载更早的消息」只针对分叉后的历史。
- 空状态「在这里另起一条线问，不打断主会话」；Plan 模式下附一行「默认 Plan 模式，只用只读工具；需要改文件时在输入框里退出 Plan。」，否则「这里的对话不会回到主会话。」。
- 读取失败「侧边对话读取失败：… 重试」；加载中「正在加载侧边对话…」。
- Composer：surface 为 `followup`，默认 Plan（只读）模式；模型初始为主会话模型，可按侧边对话单独切换（存 `SessionLocalStore.selectedModelId`）；有权限模式控件；没有消息队列（运行中输入锁定，按钮变停止）；没有轮次导航、轨迹和批注。
- 面板里看得到就算读过：跑完一轮不留未读点。

## 6. 验收

- 浏览器 mock 的子 Agent 与后台任务场景见[前端验证清单](../../FRONTEND_VERIFICATION.md)；真实的子 Agent 停止、后台命令输出刷新、侧边对话打开 / 收起只能在 Electron 下验。
- 浅色、深色与 360px 宽都要看：列表行右侧两行不挤压标题，详情顶栏在窄宽下只让模型名和标题截断，不换行。
