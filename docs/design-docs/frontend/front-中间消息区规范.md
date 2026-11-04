# 中间消息区规范

只管消息流与工具流：消息语法、排版与间距、各类消息块、运行中态和工具审批。轮尾（操作、用量、改动卡、交付卡）、轮次导航、压缩分隔线、步数上限见 [front-轮尾与导航规范.md](front-轮尾与导航规范.md)；输入区与消息队列见 [front-聊天输入框规范.md](front-聊天输入框规范.md)；Markdown 正文见 [front-聊天区Markdown渲染规范.md](front-聊天区Markdown渲染规范.md)；子 Agent 卡与右侧面板见 [front-子Agent与后台任务规范.md](front-子Agent与后台任务规范.md)。

工具流的数据契约遵循 [工具预览设计规范](../tool-system/agent-tool-preview-design-guidelines.md)：组件消费 `ToolUiPreview` 派生出的 `MessageBlock` 字段，不直接展示工具原始参数。颜色、字号阶梯等全局规则见 [front-视觉token规范.md](front-视觉token规范.md)，文案与状态表达见 [front-文案与状态表达规范.md](front-文案与状态表达规范.md)。

## 消息语法

- 严格按模型执行顺序展示；一条消息可含多轮思考、工具调用、编辑和最终回复，不得打乱顺序。
- Thinking、工具行、编辑记录和普通回复共用同一左边缘（`--conversation-text-inset`），没有头像占位缩进；助手回复前不重复展示头像、产品名或模型名。
- 运行时平铺全部过程；最终回复完全输出后，整个过程统一收进一个 `Worked for Xs`（`ToolActivityGroup`），最终回复留在组外。没有 `Explored` 之类的子分组。
- 重新展开 Worked 后，Thinking 和每个工具详情都从收起开始（包括失败的 Bash），用户可逐项展开，普通重渲染不覆盖手动选择。
- 工具行和 Thinking 保持文本流感：纯文本行、不用图标（Web Search 也没有）、不用边框卡片，靠排版和留白分层，像执行日志而不是功能卡片。

## 排版与间距

默认字体大小下的基线（用户字号设置仍有效）：

| 对象 | 字号 / 行高 | 字重与颜色 |
| --- | --- | --- |
| 工具行、Thinking 标题 | 14px / 22px | 400；动作 muted，目标与元数据 faint；Thinking 标题 faint |
| 助手回复正文 | 16.5px / 1.78（`--md-chat-size`） | 主文字色，语义强调保留 |
| 展开的思考内容 | 14px / 1.65 | UI 字体，muted，保留原始换行与空行 |
| Bash 输出、工具结果详情 | mono 字号设置，默认 13px / 1.6 | muted；保留语法与 diff 的专用样式 |

- 同一种工具不得因「有无 resultPreview」「是否可点击文件」而改变字号、字重或行高。
- 外部间距只由消息流（`.message-flow` 的相邻关系，`styles/tool-result.css` 里的 `--flow-*` 变量）决定，单个组件不决定自己与上一条的距离，外部 margin 归零，不用负 margin 抵消父级 gap；组件只拥有标题与展开详情之间的内部间距。

| 相邻内容 | 距离 |
| --- | --- |
| 两条折叠过程行（含 Thinking ↔ Bash / Read / Edit / Write） | 5px（`--flow-process-gap`） |
| 过程行 ↔ 正文段 | 14px（`--flow-prose-gap`） |
| 两个独立正文块 | 23px（`--flow-paragraph-gap`），同块内部段落按 Markdown 规则 |
| 过程结束 → 最终回复 | 18px（`--flow-final-gap`），位于 Worked 之外时只应用一次 |
| 标题 → 展开详情 | 7px；Thinking 内容不包边框卡片 |
| 展开的 Thinking → 下一过程行 | 5px |
| 其他展开详情 → 下一过程行 | 13px（详情尾部 8px + 5px，统一由布局表达） |

- 空白 assistant 文本不生成正文容器，避免只含思考与工具调用的消息额外叠加正文间距（原始消息与 usage 仍保留）。
- 审批卡、媒体、Todo、系统通知、压缩分隔线不套过程行规则，由关系计算（`messageFlowKind`）显式回退为 `other`。

## 用户消息

- 用户消息用卡片显示；超长内容两态折叠：默认只露约 88px（`overflow-hidden`、无滚动条，底部随主题翻转的渐隐遮罩暗示还有内容）；点击展开到 `min(240px, 32vh)` 并内部滚动；**收起只通过点击卡片以外的任意位置**，再点卡片不收起；存在文本选区（拖选复制）时不触发展开。未超过折叠高度的短消息无手型光标、无遮罩、无点击交互。
- 提问卡片不吸顶，跟着内容滚走；滚出视野后的一行提问条见轮次导航规范。
- 用户消息里的图片缩略图是可点击、可键盘聚焦的入口，激活后在右侧打开 Image Tab，与 Composer 发送前预览一致；没有预览数据时按钮禁用，renderer 不直接读本地路径。
- 图片预览恢复只对缺少预览的图片调用会话产物 IPC；无待加载图片时不更新预览状态，相同结果保持原状态引用，避免纯文本消息触发 effect 反馈循环。上下文压缩不撤销历史消息的图片访问：main 在投影缺少引用时查该 Session 已验证 Journal 的 append surface，仍校验会话所有权、媒体类型和字节完整性，不接受文本中的 ID、其他 Session 或 renderer 本地路径；回滚暂存附件须保护已持久化的历史引用。

## 助手回复与 Markdown

- 助手回复用正常文本块；Markdown 排版、行内代码、代码块、路径、提示框、公式、图片、Mermaid 与流式效果以 Markdown 渲染规范为准。
- 链接按目的地处理：HTTPS 等外链系统外开；工作区文件走既有文件入口（可带行号，只对 Markdown 生效）；远程图片不加载；`#fragment` 只在当前回复内查找目标、滚动并转移焦点，不改 Electron 顶层 URL、不建窗口。脚注引用、定义、回链及其无障碍描述用每条回复稳定的命名空间，避免多回复同名脚注串跳，流式追加不改变已有目标身份。不得放宽导航安全策略来补偿链接分类错误。

## Thinking

- 一行标题（思考时长或状态）+ 展开后的完整内容；不用左侧竖线或卡片边框。
- 只在思考正文含非空白文字时展示：空 delta、纯空白、只有签名 / 用量的响应不生成可见行；未收到有效正文时保留等待模型提示。签名与 reasoning tokens 是后台记录，隐藏空 Thinking 不删除它们。
- 运行时按消息默认状态展示，手动选择保留到整个回复结束；回复完成后随 Worked 收起。折叠向右箭头、展开向下箭头。

## 工具行（Read / Grep / Glob / Web Search / 目录 / 图片）

主行信息结构「动作 · 目标 · 必要状态 / 统计 · 原地展开入口」，各段独立渲染，不把整句日志塞进一个不可区分的字符串。

| 类型 | 主行示例 | 展开 / 其他入口 |
| --- | --- | --- |
| Read | `Read Demos/README.md 1–8` | 文件文字打开右侧文件；结果 disclosure 独立 |
| Listed | `Listed Demos/ 25 entries` | 目录结果 |
| Edit / Write | `Edit Demos/README.md +1 −1` | 真实 diff 与变动统计 |
| Bash | `Ran ls -lt Demos/` / `Denied …` / `Failed …` | 见 Bash |

- 动作与必要状态不参与目标的截断；目标 `min-width: 0` 视觉省略，完整路径 / 命令可键盘访问和展开。展示层截断不得改变实际打开文件的路径。溢出的工具行 hover / 聚焦时用 Tooltip 显示全文。
- 失败时仍保留动作与目标并显示失败终态，诊断放进可展开详情（danger token、长文本换行）；失败 Read 不打开文件，不展示旧成功预览；空目录明确显示 0 项，未获知结果时不伪造计数。
- 结果通过有界 `resultPreview` 进入通用 `tool-result-*` disclosure；Read 仅对当前 workspace 可确认的相对路径提供打开动作。
- 点击提示：打开右侧文件或 SubAgent 视图的入口，文字 hover / 聚焦时提高对比度，不加箭头或 Open file 按钮；原地展开的箭头默认占位但隐藏（避免 hover 位移），hover / 聚焦 / 展开时可见；编辑记录和 Thinking 展开态保留箭头。
- 生成图片（`Generate image`）与 Read 同一单行语法：行内依次是尺寸、数量、prompt 摘要、模型名，超宽单行省略；成功后不在过程区放图片，最终回复完成后由轮尾图片列表展示（见轮尾规范）。

## Bash

- 展示动作从结构化状态生成，目标优先 `commandPreview`，其次完整 command 的视觉截断，最后回退工具名；不能把原始 summary 加前缀当标题。`intent` 是补充，不替代实际命令。
- 正常执行态与 Read 同级的轻量行：`Ran ...` / `Running ...` / `Denied ...` / `Failed ...`，行尾展开箭头；展开后只有一个浅色单层容器，直接展示 `$ command`、cwd、exit code、stdout / stderr，不再嵌套边框；长输出容器内滚动。
- 被拒绝显示完整原因，未知原因不假定为审批超时；失败显示真实 stderr 与退出码，不得显示为成功。
- `sandboxed: false`（真实环境）、`notExecuted`（未执行）、后台运行状态在主行可见；`sandboxed: true` 的普通沙盒信息进执行详情。缺失 sandboxed 表示未知，不展示「沙盒」；缺失 exitCode / durationMs 不补 0；未执行不显示伪造输出或成功退出码。完整 summary / 错误在详情保留，不用正则猜退出码、环境或审批状态。
- 状态：`pending` / `running` / `success` / `failed` / `denied` / `expired` / `cancelled`。审批通过后同一条工具调用转为 running / success / failed，不生成割裂的新块。
- 实时与历史回读经共享 preview builder（`packages/client/client/src/sessions/tool-card.ts`）生成一致摘要；详情按需加载，不把大输出塞回列表快照。结构化事实不足以生成短原因时只显示状态与命令，不为凑文案扩大 Runtime 协议。

## Edit / Write File

- 后端工具名 `edit_file` / `write_file`，前端类型 `edit_diff` / `write_diff`，共用 `FileDiffBlock`；与其他工具行同一左边缘、字号和行视觉重量，仅在用户展开时出现 diff 容器（最低层级浅色单层，红绿区分增删）。
- 单行折叠日志 `Edit index.ts +3 -1 ›` / `Write config.ts +15 ›`：不用图标，只显示文件名，箭头紧贴行尾文本；`+N` 绿、`-N` 红，删除数为 0 不显示 `-0`。
- 进行中无 chevron：dispatched 显示 `Write file… · 正在生成` + shimmer；参数生成中每秒至多更新一次已生成字符量（≥10 字符才显示 `已生成 N`，由 `showFileChangeStats` 控制）；prepared 后补齐路径并显示「准备保存」；进入执行体后显示「正在保存」；完成后才显示真实 diff 增删。`edit_file` 进行中不展示 content / diff（局部 old / new_string 无法生成有定位的 diff）。

## 子 Agent 与其他消息块

- `agent` 块是主消息流里可点击的紧凑两行入口（头像、任务名、类型、状态、最新活动），点击在右侧「子 Agent」面板打开详情，不在主流内展开 transcript；规则见子 Agent 规范。组件只消费 `MessageBlock.kind === "agent"` 字段，不解析 raw args 或磁盘路径。
- Todo、后台任务通知分隔行（`BackgroundNoticeRow`）、压缩分隔线、错误块都是独立 timeline item，不贴到上一条回复里。

## 运行中态

所有工具行（含 Read、Grep、Glob、Web Search、目录、Bash、Edit / Write、图片分析与生成）running 时用统一的 text shimmer，不加额外图标或动效层。流式 Thinking 标题和等待模型的文案复用同一视觉，避免链路在工具之外静默。

- 视觉：底层 `--act-color-text-faint`，扫光中心 `--act-color-text`（中性，不用 operational 绿；绿色只用于运行圆点等离散信号）。实现为 `.tool-log-text-running` 文字 span 里放一个 `ToolLogShimmer`（`.tool-log-shimmer`）：它是带两端透明 mask 的窗口，`::after` 用 `content: attr(data-shimmer-text)` 画同一段高亮文字，窗口和文字用方向相反的 `transform` 位移，扫光只在合成层移动，不每帧重绘渐变；扫光限制在文字盒内，不占满整行，也不进无障碍树。颜色走主题 token，不写 `#hex`。完成态直接回到 muted，无切换动画。
- 时序：一轮约 1.1s 自然循环；不为显示 shimmer 人为延长 running，收到 `tool_finished` 立即切完成态；流式 Thinking 仅在它是当前最后一个 segment 时 running，历史回读的 Thinking 默认 completed、不回放动画；`prefers-reduced-motion` 取消扫光，保留 faint 底字。
- 文案：running 只显示工具名 + 主参数（`Read package.json`、`Grep ToolUiPreview in src`、`Write 秋日随笔.md`），不展示数值统计和折叠箭头；完成后才追加统计、条目数、chevron。
- 工具生命周期四阶段：
  1. `dispatched`：收到首个 `tool_call_delta`，emit `tool_call_streaming { isInitial: true }`，preview 字段可为空，用 `Write file…` 等 fallback + shimmer。**只有首帧才在 `state.segments` 追加工具 segment**，后续帧和 `tool_started` 只覆盖 preview，使工具位置严格反映模型首次开始生成它的时机。
  2. `argsProgress`：Write / Edit 在 Main 增量统计字符量（每秒至多一次 `generationProgress`，不发送正文、不自动展开）；其他工具保持稳定占位。
  3. `executing`：prepared 后一次补齐路径；通过校验与审批、进入执行体后 emit `tool_started`。
  4. `finished`：emit `tool_finished`，清除临时进度，用真实结果与 diff 增删，切换为折叠摘要。
- 事件契约：`tool_started.preview` 只含当前能确定的最小字段（filePath / command / query），不传未生成的数值；完成态字段在 `tool_finished` / 持久化事件补齐；`tool_call_streaming`、`tool_started`、审批、`tool_finished` 必须 upsert 同一条目，终态先到也创建条目；终态之后迟到的参数、progress、approval-resolved 不得降级。进度 / 子 Agent 事件不得把终态改回 running。

## 工具审批

共享部件在 `components/messages/ApprovalParts.tsx` 的 `ApprovalCard` / `ApprovalActions`。

- 所有审批（read、grep、glob、edit_diff、write_diff、delete、bash、browser、通用工具）用同一张卡：一个框（`bg-surface` + `border-line` + `shadow-act-xs` 圆角），卡片上下不加文字行，「等待确认」只写在容器 `aria-label`。头行「可选图标 · 动词（muted）· 目标（faint）」，按钮在行尾；Bash 例外，按钮在命令下方底栏。不用彩色边框、彩色托盘或 `Reason:` 行，危险程度只由主按钮颜色表达；需要补充说明时才在卡外垫 `bg-surface-subtle` 托盘（目前只有浏览器操作）。

| 工具 | 动词 | 目标 | 主按钮 |
| --- | --- | --- | --- |
| read | 读取 | 路径 | 允许 |
| grep / glob | 搜索 / 匹配 | `pattern 于 scope` | 允许 |
| edit_diff | 编辑 | 路径 + `+N -M` | 应用 |
| write_diff | 写入 | 路径 + `+N` | 写入 |
| delete | 删除 | 路径 | 删除（danger-solid） |
| bash | intent（缺省「Bash 命令」） | 命令名摘要（如 `git, tail`） | 运行 |
| browser | 确认浏览器操作 | 本次工具标题 | 允许这次 |

- 路径：目录淡色、过长时中段折叠为 `…`，文件名优先保留，`title` 为完整路径。编辑 / 写入默认不展示 diff；`+N -M` 后跟淡色箭头，整组是一个按钮，点开在卡内展开 diff（`aria-expanded`）。
- Bash 审批：头行终端图标 + intent + 命令名摘要，下一条分割线；主体是带简单着色的 `$ command`（`shell-highlight.ts`，取 `.act-code-hl` 主题变量），过长在卡内滚动；底部左侧显示执行环境（沙盒 / 真实环境），cwd 只在不是工作区根目录时跟在后面，右侧「拒绝」「运行」。
- 按钮全是 xs 胶囊，固定三层：拒绝（ghost）→ 本会话允许（tonal，仅在有授权建议时出现，`title` 为建议说明）→ 主按钮（`accent` 跟随强调色，删除用 `danger-solid`）。提交中被点按钮前出现旋转图标、所有按钮禁用，Bridge 返回 `ok: false` 时恢复。
- Bash 的「本会话允许 pnpm」只在后端返回正式 `process.execute` / `command_prefix` 建议时显示，前端不得从命令文本推导授权；建议与 requestId 绑定，切换审批或读取失败时不沿用旧建议；授权包含项目脚本、执行环境沿用现有设置，复杂语法与显式 no_sandbox 仍走单次审批。契约见 `docs/exec-plans/completed/20261011-approval-card-cursor-style/backend-bash-command-prefix-grant.md`。
- 「工作区外」「敏感文件」和通用审批提示不展示；未知原因收进 Info 图标 tooltip，不丢信息。不做键盘快捷键（Enter 与 Composer 发送冲突）；授权后工具行不再追加「本会话已授权」。

## 颜色职责

- 普通回复、Thinking、工具行、completed 工具默认黑灰文本，完成后回到 muted，不逐条变绿。
- running 的圆点 / 细环可用少量 operational；approval 用 warning，failed / error 用 danger；`+N` / `-N` 与 diff 行用低饱和 addition / removal token，不复用 Toggle 或危险按钮底色。
- 工具流以文本流为主，不引入彩色 timeline pill 或卡片墙。

## 会话浏览加载

列表和长会话的按需读取、分页、加载 / 重试状态见 [agent-progressive-session-loading.md](../agent-runtime/agent-progressive-session-loading.md)。
