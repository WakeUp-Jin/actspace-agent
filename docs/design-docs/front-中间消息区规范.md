# 中间消息区规范

## 定位

中间区域是主工作区，承载对话、工具流和最终回复。

工具流的数据契约遵循 [`工具预览设计规范`](../agent-tool-preview-design-guidelines.md)。前端组件消费 `ToolUiPreview` 派生出的 `MessageBlock` 字段，不直接展示工具原始参数。

## 消息语法

- 按模型执行顺序展示。
- 一次消息可能包含多轮思考、工具调用、编辑和最终回复。
- 每种消息类型使用不同组件，但保持同一条消息流里的节奏一致。
- 同一轮里的 Thinking、Read/Grep/Glob/Web Search、Edit/Write File 和普通回复使用统一左边缘，不保留旧头像占位缩进。

## 消息类型

- 用户消息。
- 助手普通回复。
- Thinking。
- Read。
- Grep。
- Glob。
- Web Search。
- Directory List。
- Bash。
- Agent / SubAgent Run。
- Edit File。
- Write File。
- Context Compaction。
- Final reply。

## 类型规则

- 用户消息用卡片显示；超长内容两态折叠（2026-07-05 定稿，对齐 Cursor）：
  - **默认折叠**：只露前几行（max-h 88px）、`overflow-hidden` 不出滚动条，底部用随主题翻转的渐隐遮罩（`from-surface to-transparent`）暗示还有内容。turn prompt 是 sticky 定位，折叠态让长消息对下方模型回复的遮挡降到最小。
  - **点击展开**：撑到 `min(240px, 32vh)`、内部滚动；**收起只通过点击卡片以外的任意位置触发**，再点卡片不收起（避免在展开内容里点击/选择时意外合上）；用户拖选文字复制时（存在文本选区）不触发展开。
  - 短消息（未超过折叠高度）不参与：无手型光标、无遮罩、无点击交互。
- 助手普通回复用正常文本块显示，不在消息正文前重复展示头像、产品名或模型名。
- Thinking 默认折叠，点击后展开完整内容。
- Read、Grep、Glob 和 Web Search 保持文本流感，不做重边框。
- Bash 正常执行态保持类似 Read 的轻量日志行；只有展开后的命令输出区域使用单层浅色容器。
- Bash 审核态可以使用轻量边框块，因为它承载用户操作，不属于普通执行日志。
- Agent 是聚合执行对象：主消息流显示可点击执行块，块内只展示 SubAgent run 的标题、最近事件、摘要和 stats；不展示额外 logo、机器人图标或全大写状态噪音。完整 transcript 通过 Composer 上方的会话内 panel 展示，不使用全局遮罩弹窗，也不在主消息流原地展开。
- Edit / Write File 与 Read 等保持同样的纯文本工具行节奏，仅在用户主动展开时显示 diff 详情容器。
- Context Compaction 是系统执行事件，不属于工具调用，也不渲染为 Tool Preview；手动 `/compact` 和未来自动压缩共享同一消息块语法。
- Final reply 作为收束结果，保持最清晰的阅读层级。

## Thinking 组件

Thinking 是消息流中的折叠思考行。

### 结构

- 一行简短标题，显示思考时长或状态。
- 展开后在下方显示完整思考内容。
- 不使用左侧竖线，不做卡片边框。

### 交互

- 默认折叠。
- 点击后展开完整内容。
- 展开与收起保持同一消息块内的连续性。
- 折叠态使用向右箭头，展开态使用向下箭头。

### 视觉原则

- 保持文本流感。
- 通过排版和间距体现层级，不靠重边框。
- 与普通回复保持统一的主视觉语言。

## Thinking 定稿图

![Thinking 定稿图](public/front/thinking-final.png)

## Read / Grep / Glob / Web Search 组件

Read、Grep、Glob 和 Web Search 是和 Thinking 同级别的工具调用消息。Directory List 也遵循相同形态。

### 结构

- 纯文本行展示。
- 不使用图标（包括 Web Search，过去版本曾给它单独配 Globe 图标，已统一去掉）。
- 不使用边框卡片。
- 每行只保留工具类型和简短内容。

### 交互

- 默认直接展示，不需要展开。
- 作为消息流中的日志条目存在。
- 与 Thinking 保持同一语法体系，但不从属 Thinking。

### 视觉原则

- 保持最轻量的文本流感。
- 用排版和留白区分层级，不靠装饰。
- 更像执行日志，而不是功能卡片。

## Read / Grep / Glob / Web Search 定稿图

![Read / 文本工具行定稿图](public/front/read-search-final.png)

## Bash 组件

Bash 是命令执行工具，包含正常执行态和审核 pending 态。

### 正常执行态

- 折叠行和 Read / Grep / Glob / Web Search 同级，不使用图标，不使用外围卡片。
- 行文使用 `Ran ...`、`Running ...`、`Denied ...` 等状态前缀。
- 行尾使用展开箭头。
- 展开后只有一个浅色单层容器。
- 容器内直接展示 `$ command`、cwd、exit code、stdout 和 stderr。
- 命令行和输出不再各自嵌套边框。
- 长输出在容器内滚动，不撑开整条消息流。

### 审核态

- 审核态是轻量边框块，宽度与消息正文对齐。
- 顶部显示终端符号、动作摘要和省略号操作。
- 主体显示 `$ command` 和 `Reason`。
- 底部左侧显示权限策略，右侧显示 `Skip`、`Allow`、`Run`。
- 审核通过后，同一条工具调用应转换为 running/success/failed 展示，而不是生成一个割裂的新块。

### 状态

- `pending`：等待用户审核。
- `running`：已允许，正在执行。
- `success`：执行成功。
- `failed`：执行失败或非零退出。
- `denied`：用户拒绝。
- `expired`：审核过期。
- `cancelled`：被取消。

## 工具执行中态规范

所有工具行（Read、Grep、Glob、Web Search、Directory List、Bash、Edit/Write File）在 running 阶段使用统一的 text shimmer 视觉，不引入额外的图标或动效层。

### 视觉

- 文本始终可读：底层使用 `text-text-muted` / `--act-color-text-muted`，任意时刻、任意快慢的工具都能立即看清文字。
- 品牌高光使用 `--act-color-brand` 作为**叠加**效果从右向左扫过文本一次为一轮，不允许出现「文字消失」的瞬间。
- 实现方式：running 文本使用 `.tool-log-text-running`。真实文本保留为主题色；`::after` 通过 `content: attr(data-shimmer-text)` 复制同一段文字，再用 `background-clip: text` 裁出扫光层。动画背景必须限制在 inline 文本盒子内，不允许占满整条工具行。
- 颜色必须走主题 token，禁止在 running shimmer 中写死 `#hex` 作为基础色或高光色。
- 完成态文字色直接回到默认 muted 灰，无切换动画。

### 时序

- 一轮 shimmer 约 1.1s。
- shimmer 自然循环：工具执行时间长就多扫几次，执行时间短就直接进入完成态。
- 不为了显示 shimmer 而人为延长 running 态。`MIN_TOOL_RUNNING_MS`（约 300ms）只是用于防 UI 闪烁，不是为了让 shimmer 扫完一轮。
- `prefers-reduced-motion` 下静态显示蓝色文本，无动画。

### 文案

- running 阶段只显示工具名 + 主参数，例如 `Read package.json`、`Grep ToolUiPreview in src`、`Write 秋日随笔.md`、`Edit index.ts`。
- 进行中不展示数值统计（如 `+15`、`(12 entries)`）和折叠箭头。
- 完成后才追加统计、entry 数、折叠 chevron 等额外字段。

### 后端契约

- 后端在 `tool_started.preview` 推送当前能确定的最小字段（filePath / command / query），不传未生成的数值（diff stats、entryCount 等）。
- 完成态字段在 `tool_finished` / 持久化事件中补齐。
- Agent 工具的内部 SubAgent transcript 不走普通 `tool_call_streaming`；bridge 用 `subagent_event.preview` 推送最新 `AgentToolPreview`，前端覆盖同一个 Agent block 的 running 状态。

### 4 阶段工具生命周期

LLM 生成工具调用是一段慢操作（write_file 一千多字符的 content 在国内 LLM 实测约 2–3s）。前端必须区分四个阶段，避免出现「assistant 文本后大段静默 → 突然蹦出完成态卡片」的体验断层：

1. **dispatched**：bridge 收到首个 `tool_call_delta` chunk，emit `tool_call_streaming { isInitial: true, preview }`。此时 `preview.filePath` 等字段可能为空字符串，前端用 `Write file…` 等 fallback 文案展示 + shimmer。
2. **argsProgress**：bridge 持续累积 partial args，按 50ms throttle emit `tool_call_streaming`。preview 字段逐步填充（filePath 先有、streamingContent 后有）。write_file 出现 `streamingContent` 后立即展开 code preview，cursor 风格边写边看。
3. **executing**：LLM 完成本次 tool_call 输出，bridge emit `tool_started`。preview 此时仍保留 streamingContent（write 的 `createToolUiPreview` 在 output 为空时把完整 args.content 当作 streamingContent，避免从 argsProgress 切到 executing 时 code preview 突然消失）。仍展示 shimmer。
4. **finished**：bridge emit `tool_finished`，前端从 result event 里拿到 completed 风格 preview（diff + additions/deletions），streamingContent 清除，切换为折叠态摘要行 `Write 短文.md +35 ›`。

前端实现要点：

- `tool_call_streaming` 推过来的 preview 直接放进 `state.activeTools.get(toolCallId).preview`，复用与 `tool_started` 相同的 toolEntryToBlock 渲染分支，**不需要单独的 tool_pending segment 类型**。
- `tool_call_streaming` 首帧（`isInitial=true`）才往 `state.segments` push tool segment；后续 frame 和 `tool_started` 都只是覆盖 preview，segment 位置保持不变，保证工具的位置在消息流中**严格反映 LLM 首次开始生成它的时机**。

## Agent / SubAgent Run 组件

Agent 是主 Agent 调用的聚合工具，用户可见为一个可点击执行块。它承载的是“另一个隔离上下文中的只读探索过程”，因此视觉上允许轻边框和块状入口，但内部仍遵守消息流语法。

### 结构

- 顶部显示 `description` 和进入 transcript 的箭头，不额外展示 logo、机器人图标或全大写状态行。
- running 阶段展示最近 3-5 条 transcript 摘要，使用与工具 running 态一致的 text shimmer。
- completed 阶段展示最终 summary，控制在 3-4 行内，底部显示 `Explored N files · M tools · Ss` 等 stats。
- failed / aborted 阶段展示错误摘要，并继续保留 transcript 入口。

### 交互

- 整块可点击，打开 Composer 上方的 `SubAgentTranscriptPanel`。
- Panel 顶部在 header 下单独展示子智能体收到的任务输入；输入区使用轻量边框容器，字号和行高接近用户消息，默认只露出数行预览。
- Task input 自身不出现内部滚动条；点击输入区展开完整任务，再次点击收起。
- Task input 在 transcript 滚动时保持在顶部，工具流和最终回复在其下方滚动，避免长输入和正文形成割裂的上下两块。
- running 时 panel 按主消息区语法实时回放过程事件：`thinking` 复用 Thinking 行，`read_file` / `grep` / `glob` / `list_directory` 复用轻量工具行，usage 只显示轻量 token 行。
- 出现最终回复后，panel 将过程事件默认折叠成 `Worked for ...` 行；点击该行才展开完整工具流。
- 最终回复作为 `Worked` 行下方的正常 Markdown 正文渲染，不放入固定高度底部抽屉；`assistant_message` / `assistant_reply` 不混入中间过程流，避免最终报告被当成普通日志事件。
- running 时 panel 使用 App streaming state 里已经收到的 events；completed 后可通过 `subagent:get-transcript` IPC 按 `transcriptRef` 补拉落盘 transcript。
- Panel 位于 follow-up Composer 上方，并和输入框使用同一套宽度约束；它不提供 follow-up 输入，V0 只负责观察执行流。
- Panel 最大高度要克制，打开后顶部仍应露出一截聊天内容，避免完全遮住当前阅读上下文。
- Panel 打开期间，follow-up Composer 上方的 Review / overflow 操作层暂时隐藏；关闭 Panel 后再按 Git Review summary 恢复。

### 数据边界

- 组件只消费 `MessageBlock.kind === "agent"` 字段，不解析 raw args、raw output 或 transcript 文件路径。
- 主 session 只恢复 Agent 工具块；SubAgent 内部 user/tool/assistant/usage 事件只存在 sidecar transcript。
- transcript 读取必须经 preload/main IPC，renderer 不直接访问文件系统。

## Edit File / Write File 组件

Edit File 和 Write File 是文件修改类工具消息。后端工具名为 `edit_file` 和 `write_file`（全部 snake_case），前端展示语义使用 `edit_diff` 和 `write_diff` 类型，共享同一个 `FileDiffBlock` 组件。

它们与 Read / Grep / Glob / Web Search 在主消息流中保持同样的轻量行视觉重量，但比纯日志行多一层"展开看 diff"的能力。**不再使用 Edit File 独占的边框卡片样式**。

### 结构

- 单行折叠日志：`Edit index.ts +3 -1 ›`、`Write config.ts +15 ›`。
- 行内不展示任何图标，保持与其他工具行的纯文本节奏。
- 行左边缘与 Thinking、Read 等工具行对齐（共享同一 `conversation-text-inset`）。
- 折叠箭头紧贴行尾文本，使用 `inline-flex` 布局，不被推到容器最右端。
- 文件路径只展示文件名，不展示完整路径。
- 修改统计 `+N` 用绿色、`-N` 用红色；删除数为 0 时不展示 `-0`。

### 交互

- 工具调用进行中：
  - dispatched 阶段（filePath 还未解析出来）：显示 `Write file…` + shimmer。
  - argsProgress 阶段（path 已解析）：显示 `Write 短文.md` + shimmer；write_file 出现 `streamingContent` 后展开 code preview，行尾闪烁光标动画，模拟 cursor 风格写入。
  - executing 阶段（tool_started 后到 tool_finished 前）：保持 streamingContent 视图，避免闪烁，diff 在工具实际写入完成后才接管显示。
  - 整个 running 阶段无 chevron。
- edit_file running 阶段**不展示** content/diff，只展示单行 `Edit index.ts` + shimmer（因为 partial old_string/new_string 无法生成有定位的 diff）。
- 工具调用完成后：切换为折叠态 `Write short-story.txt +71 ›`，可点击展开。
- 展开后下方出现 unified diff 容器，使用浅色单层背景，红绿区分增删行。
- 折叠态使用向右箭头，展开态使用向下箭头，与 Thinking 保持一致。

### 视觉原则

- 与 Thinking 一致的"行内折叠"语法，不使用整张边框卡片包住摘要 + 折叠状态。
- diff 内容容器仅在展开时出现，使用最低层级的浅色容器，不与摘要行重复装饰。
- 与其它工具行保持同一左边缘和字号，避免在消息流中"突出"。

## Edit File 定稿图

![Edit File 定稿图](public/front/right-panel-diff-final.png)

## Context Compaction 组件

Context Compaction 展示上下文压缩生命周期。它可能由用户在 Composer 直接输入 `/compact` 手动触发，也可能由后端自动压缩触发；二者都落到消息流中的 `context_compaction` 消息块。

### 结构

- pending：显示轻量 `/compact` 命令行，不生成普通用户消息。
- running：显示为消息流中的独立系统执行段，不使用外围方框、图标或 spinner。上方是一段稳定文字，例如 `Compacting context · Summarizing older messages`；下方是一条细进度条。
- completed：显示为独立 timeline divider，推荐文案 `Context compacted · 29 messages`。divider 左右细线铺开，居中文案，不使用图标、卡片或 pill。
- skipped：显示为独立 timeline divider，推荐文案 `Nothing to compact`。
- failed：显示为独立系统结果行或 divider，展示失败原因；不贴进上一条 assistant 回复。

### 交互

- 本轮不提供展开详情。
- `/compact` exact command 由 renderer 在发送前分流到 `context:compact` IPC，不进入 `RunTurnInput.userInput`，也不写入 LLM conversation。
- running 进度条只表达阶段进度；后端没有真实百分比时使用 indeterminate 样式，不伪造精确百分比。
- running 文本不做 opacity pulse、扫光或省略号动画；动态只交给进度条，避免在阅读流里产生重复闪动。

### 视觉原则

- pending / completed / skipped / failed 都保持轻量系统消息，不打断对话阅读节奏。
- Context Compaction 是工作流的一部分，但不是工具日志，也不是 assistant 正文；它必须作为独立 timeline item 占据消息流位置，不能贴到上一条模型回复里。
- running 的进度条宽度与中间内容列 / Composer 输入框宽度对齐，允许铺满；高度保持克制，建议 2-3px。
- completed divider 使用普通主题色文字 + 细线，视觉重量低于用户消息卡片，高于普通工具日志行，确保用户能感知这里发生了上下文边界事件。
- 所有状态都不使用图标。当前方向明确去掉 `CheckCircle`、`Loader`、`CircleDashed` 等图标语言，让状态由文案、位置和进度条表达。
- 颜色只消费语义 token / 语义 Tailwind 类。
- `prefers-reduced-motion` 下仍能通过文案和状态理解执行过程，不依赖动画。

## 顺序原则

- 严格按执行顺序展示。
- 工具调用之间不要打乱顺序。
- 同一条消息里的不同状态要保持连续和可读。

## 当前阶段重点

- 先把消息的层级和阅读节奏定清楚。
- 先不追求过多色彩变化。
- 先让组件语法明确，再做细节视觉优化。
