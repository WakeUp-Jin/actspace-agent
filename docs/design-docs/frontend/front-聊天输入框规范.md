# 聊天输入框规范

> 2026-09-09 文案更新：日常界面展示名称以[中文文案规范](front-desktop-chinese-ui.md)为准；保留 Chat、Plan、Thinking、Effort 和工具执行展示。本文英文名称仍可用于指代内部概念，协议与行为不变。
>
> 2026-10-06：09 输入框优化（`docs/exec-plans/completed/20261005-desktop-frontend-refactor/09-输入框优化执行计划.md`，设计稿 `docs/desktop-frontend-refactor/demo/composer-run-target-demo.html`）实施后改写「Composer 形态」到「Skills」各节，并新增「发送队列」。运行目标的菜单与状态行细节见 [Workspace / Git / Worktree](front-workspace-git-worktree-context.md)。
>
> Runtime 模式契约见[Agent 形态与三种工作模式](../agent-runtime/agent-forms-and-modes.md)；本文定义 Composer 的对应交互。

## 当前模式边界

- 主会话使用同一个 `actspace.main` 形态，提供 Agent、Plan、Chat 三种模式；空闲时可从 `+` 菜单切换，已有消息不阻止切换。
- Chat 隐藏工作区、Skills 与权限入口，保留模型、Thinking、Context、附件、发送/停止；工具仅为 `web` 与 `generate_image`。
- Chat 文件入口接受 PNG/JPEG/WEBP/GIF、TXT、Markdown、JSON、CSV；不支持 PDF、DOC、DOCX。
- Chat 切换到 Plan/Agent 时必须有工作区；缺失时先选择工作区，再写入模式。
- `/chat` 不在 Slash Command catalog 中；三种模式都可从 `+` 菜单选择。

## 定位

聊天输入框是整页最重要的操作中心。

当前 Composer 是一套可复用输入系统，而不是单一输入条。它既支持已有会话底部的轻量 `follow-up bar`，也支持创建新会话时的居中 `initial composer`。

- 默认态是低高度的贴底输入面板，优先服务“继续追问 / 继续指挥当前会话”。
- 复杂能力通过左侧 `+` 面板展开，不在默认态把所有入口铺开。
- 输入栏下方是只读状态行，陈述「在哪儿跑」（分支 · 本机 / 工作树，或 Host · 工作区）、会话累计统计胶囊和 context 用量。
- 输入栏上方预留 `Review / overflow` 操作层，未来承载 diff review、批量操作和更多会话动作。
- 新会话首屏使用 `initial composer`，发送首条消息后切换回底部 follow-up composer。

## 内容

- follow-up 输入区域默认一行（胶囊形），内容变长后进入多行，最高 200px 内滚动。
- 左侧 `+` 面板：搜索、切换模式、添加附件、Skills ›。模型不进 `+` 面板。
- 当前运行模式 chip（Plan / Chat），紧跟 `+` 展示，让用户在发送前持续看到本轮能力边界。
- `Review / overflow` 操作层。
- 模型按钮（始终显示：单行时贴在发送按钮左边，多行时在底部工具行）。
- 发送 / 停止按钮。
- 发送队列托盘（运行中发送的消息）。
- 对话中的只读状态行：运行位置、权限控件、会话统计 / Token 用量胶囊、context 用量。
- 新建页的运行目标行：工作区、分支、运行位置。
- 上下文弹窗。

## 原则

- 使用弹出下拉，不使用生硬的静态选择框。
- 输入区要像桌面应用里的 follow-up command bar，而不是普通网页表单或网页聊天大卡片。
- 默认态保持轻量、贴底、低高度；不要把输入区域做成大面积白色卡片。
- 保留继续输入的舒适空间，但默认视觉重心应让位给上方消息流。
- 不显示语音按钮。
- 发送按钮是 28px 圆形 IconButton 与上箭头，按模式着色：Agent 用 `accent`（默认调色板回落为主题反色，其余调色板使用用户强调色），Plan 用 `warning`，Chat 用 `operational`；停止按钮保持 primary，不跟模式变色。
- `model` 选择保持文字化，不加边框。
- Context usage 只在 follow-up 底部状态行右侧显示和打开，不再放在输入 panel 内。
- 普通 focus ring 消费 focus-ring token，默认调色板为中性、其它调色板跟随强调色；运行状态可使用 operational green。Context usage 默认保持中性，只有接近阈值时切 warning / danger；Thinking toggle 不再默认使用品牌蓝。
- 新建页的 workspace、branch、运行位置是无边框文字按钮加下拉菜单；对话中运行目标已锁定，状态行只读。真实交互、Git、Worktree 和远端 Host 边界统一遵循 `front-workspace-git-worktree-context.md`。
- Chat / Plan / Agent 不是只改 placeholder 的视觉标签；模式先经会话命令持久化，Run 创建时读取 Session 模式快照，由工具暴露层强制能力边界。Prompt 只负责行为指导，不承担权限隔离。
- Slash Command 在普通 Agent Turn 之前分流：`/compact` 触发上下文压缩，命令文本不作为普通用户消息显示。v2 不提供 `/eval`。可发现菜单、键盘行为、Functions / Skills 分组统一见 `front-composer-slash-command.md`。

## 草稿与历史输入

- 未发送的文字草稿和附件按 `sessionId` 隔离，存在比 Conversation 页面生命周期更长的 `SessionLocalStore` 里（`composerText`、`attachments`）；进入设置、Usage 等页面，或在会话之间切换后返回时，恢复该会话自己的文字和附件，附件不会带到另一个会话。
- 图片附件预览的 blob URL 在附件发送成功、被移除或被恢复的草稿替换、所在会话被 evict（归档、删除、移除 Host 或工作区）时释放；离开会话页不释放。
- 草稿只在当前应用运行期间保留，不写入 Session Journal，关闭或刷新应用后不保证恢复。发送开始后清空当前草稿；如果输入尚未持久化就发送失败，继续使用 Composer 的失败恢复机制回填文字和附件，且失败恢复必须校验原会话 ID，不得跨会话回填。
- 历史输入来自当前会话已经持久化的用户文字消息，按时间从旧到新排列；不恢复消息当时的附件、模型、模式或 Skills，避免重新绑定已经过期的执行配置。
- 普通输入框为空时，`ArrowUp` 从最近一条历史输入开始向前浏览；浏览期间 `ArrowDown` 向后移动，越过最新一条后恢复为空输入。
- 新鲜的非空文字和多行文字继续使用 textarea 原生方向键移动光标。Slash Command 菜单打开时方向键优先导航菜单；IME 组词期间不触发历史回溯。

## Composer 形态

### Ink & Emerald 视觉职责

- Composer 外框使用 `bg-surface`、1px `border-composer`（浅色 `rgb(0 0 0 / .07)`，聚焦 `border-composer-focus` `.11`）和柔和阴影 `shadow-act-composer`（聚焦时 `shadow-act-composer-focus`）。这是阴影规则的例外：输入框是整页的操作中心，需要轻微浮起。不使用蓝色描边或蓝色光晕。
- 发送按钮按模式着色（见「原则」）；运行 / 停止状态可以使用小型 operational 绿点、细环或中性停止控件。
- Context usage、分支、本机 / 工作树、Host 等状态行默认使用 muted / faint 灰阶。
- operational green 只表示运行、连接或确认（以及 Chat 模式），不用于模型选择、附件、普通 `+` 按钮或菜单选中。
- 模式 chip 是对当前能力 profile 的持续编码：Chat = operational（绿），Plan = warning（黄）；Agent 默认态不显示 chip。色彩必须同时有文字和图标表达，不能成为唯一区分依据。
- 菜单行的 hover / selected 使用中性底色和勾选，不把整行涂成模式色。

### 单行与多行

Composer 有 `surface`（`followup` / `initial`）一个外部维度，内部布局在单行（inline）和多行（stacked）之间切换：

| | 单行（inline） | 多行（stacked） |
| --- | --- | --- |
| 外框 | 胶囊（`rounded-act-pill`） | `rounded-act-xl`（18px） |
| grid | `plus mode input model send`（Agent 无 mode） | `input` 全宽 / `plus mode model . send` |
| 模型按钮 | 显示，在输入区右侧、发送按钮左边 | 显示，在底部工具行 `+` / 模式之后 |
| 输入区 | 单行 | 最高 200px，超出后内部滚动；新建页最少 2 行 |

- **进入多行**：按单行宽度测量会折行、文本含换行、有附件 / Skill / 回复引用、新建页（initial）、窗口不超过 600px。
- **回到单行**：只在输入框**完全清空**且没有附件、Skill、引用时。进入多行后删到一行仍保持多行（`stuckStacked`），避免打字时外框来回跳。换会话时重新判断。
- 测量用单行宽度下的渲染高度，不用多行全宽输入框的高度反推，否则宽度变化会造成误判。
- **实现约束：切换不允许 remount textarea**。inline / stacked 是同一个 grid 容器切换 `grid-template-areas`，DOM 结构不变，正在打字时切换不丢焦点和光标。

| surface | 结构（从上到下） |
| --- | --- |
| `followup` | Review strip → 发送队列托盘 → panel → 只读状态行 |
| `initial` | 运行目标行 → 发送队列托盘 → panel（多行） |

首条消息发送后，ConversationView 进入消息流状态，并显示底部 followup composer。两种 surface 是同一个 Composer：ConversationView 只挂载一次，切换时只换外层布局 class，不重新挂载，焦点、输入法状态和草稿都保留。

### 控件

| 控件 | 规格 |
| --- | --- |
| `+` | IconButton `variant="ghost"`，圆形 28px；hover 和面板打开时出底色；`aria-expanded` |
| 模式 chip | Agent 不显示。Plan / Chat 为 `[图标 名称 ×]`：高 24px、13px、胶囊；Plan `bg-warning-soft text-on-warning`，Chat `bg-operational-soft text-operational`。名称区不是按钮；`×` 是独立的 IconButton（`退出 Plan 模式` / `退出 Chat 模式`），焦点在 chip 内按 Backspace 也回到 Agent；运行中禁用。退出后焦点回到输入框 |
| 模型按钮 | 无边框文字按钮，`text-text-muted`，hover 变 `text-text-main`；最大宽度 220px，超出截断 |
| 发送 / 停止 | 28px 圆形；输入为空且运行中时显示停止。不能发送时 tooltip 和 aria-label 写原因（远端按 readiness，见 `front-workspace-git-worktree-context.md`） |

### 模型菜单

- 工具行模型按钮打开 `ui/Popover`（上方、左对齐，间距 8px），宽约 `244px`，行高约 `34px`；选中项只使用轻量中性底色与勾选。本机和远端是同一个菜单：远端只列 Host 回报的模型、没有 Options，Host 还没回报时写「等待 Host 模型」。
- 菜单顶部固定模型搜索框，打开时自动聚焦；搜索只在当前可用模型中按名称、供应商、API model ID 和内部 ID 做本地过滤，不触发远端目录请求。
- 搜索结果按供应商分组展示，分组标题使用共享供应商注册表中的用户可读名称；搜索后不包含匹配模型的分组不显示。
- 折叠态默认只显示模型名称；当前候选中存在跨供应商同名模型时追加供应商名称。同一供应商内部仍重名时，再追加 API model ID。
- `编辑` 仅在对应模型行 hover / keyboard focus 或 Options 已打开时出现；Options 约 `210px`，按右侧剩余空间贴在菜单左侧或右侧。
- Options 由模型能力驱动：支持开关时显示 Thinking；提供推理强度时显示 `Auto / Minimal / Low / Medium / High / Extra High / Max` 中该模型真实支持的项；`Auto` 表示不覆盖供应商默认值。强制推理模型不能被关闭。
- Composer 不提供上下文长度选择器。模型使用注册表声明的原生最大上下文，Context 入口只负责展示当前占用。
- 打开时约 `140ms` 的 opacity + transform 过渡；reduced motion 下取消。Esc 关闭后焦点回到模型按钮。

### 浮层互斥

`+` 面板、模型菜单、上下文用量、状态行两个统计胶囊的面板、新建页的三个运行目标菜单由一个 `ComposerOverlay` 状态管理，同一时间只开一个；从一个点到另一个时新的直接打开、旧的关闭，关掉的那个不抢回焦点。斜杠菜单由输入内容推出，与它们互相收起。

## Initial composer 结构

创建新会话时，Composer 位于消息区中部，包含两层：

1. 运行目标行：`📁 工作区 ⌄ ／ ⑂ 分支 ⌄ ／ 💻 运行位置 ⌄` 三个无边框文字按钮（28px、14px、muted），可换行。远端时没有分支按钮，工作区列 Host 上的工作区。Chat 不用工作区和分支，只在远端时显示运行位置。菜单内容见 `front-workspace-git-worktree-context.md`。
2. 输入 panel（多行）：输入框在上，最少两行；底部从左到右是 `+`、模式 chip、模型按钮，右侧是发送。

`Shift+Tab` 切换到 Plan；输入框下方不再显示「规划新想法」快捷 chip。Initial composer 不显示 Review strip，也不显示底部状态行。

## Follow-up bar 结构

从上到下：

1. Review 操作层：位于输入栏上方，Git workspace 存在未提交改动时显示真实 `Review +N -M` 汇总和 quick actions；无改动时不显示 Review 入口；当前 workspace 不是 Git repository 时显示无计数的 `Review` 入口，引导用户在右侧 Review Tab 查看初始化提示。远端会话不显示。
2. 发送队列托盘（有排队或已引导的消息时）。
3. 输入 panel：单行或多行，见「单行与多行」。
4. 只读状态行：左侧是运行位置（`⑂ main · 💻 本机` / `⑂ 分支 · ⑂ 工作树` / `🖥 Host · 📁 工作区`）和权限控件，右侧是两个统计胶囊和 context 用量（打开 Context 弹窗的唯一入口）。没有下拉，不能在对话中切换机器。Chat 会话右侧同样有胶囊和 context 用量，左侧为空。细节见 `front-workspace-git-worktree-context.md`。

### `+` 面板

点击 `+` 打开与输入框同宽的面板（`ui/Popover` 锚在整个 panel 上，`side="top"`、间距 8px；上方放不下时由 Radix 翻到下方）。外观：`rounded-act-lg`、`bg-surface-raised`、`shadow-act-popover`；行高 28px、行圆角 8px；每行是图标、名称（muted，高亮时 main）和紧跟其后的 faint 说明；高亮行 `bg-hover-overlay`；列表最高 280px。 两侧均放不下自然高度时，整张面板遵守 Radix 给出的可用高度，搜索/返回行保持可见且不收缩，列表在剩余高度内滚动；不能只限制列表280px而让整卡顶部越出视口。

主页：

```text
🔍 搜索 Skills、文件…
📋 Plan   先出计划，确认后再执行          ← 只列当前不是的模式
💬 Chat   纯对话，不使用工具
─────────────
📎 图片与文件 / 图片                     ← 按运行目标能力：Chat 或远端为「图片与文件」，本机 Agent 为「图片」
📖 Skills                         ›      ← Chat 不显示
```

- **模式组**：空会话列 Plan / Chat 中不是当前模式的；已开始的 Agent 会话只列 Plan；已开始的 Plan / Chat 会话不列。运行中模式行禁用。
- **搜索**：打开即聚焦。在模式、附件和 Skills 中本地过滤，结果按「模式 / 添加 / Skills」分组；都没有时写「没有匹配的结果。」。打开面板时就加载 Skills，主页搜索能直接搜到。
- **下钻**：Skills › 在同一张卡片内换页，搜索框左侧换成 `‹` 返回。模型和 Thinking / 推理强度只在模型按钮的菜单里选，`+` 面板不再重复一份。
- **键盘**：焦点始终在搜索框（combobox + `aria-activedescendant`，行是 `listbox` / `option`）。↑↓ 循环并跳过禁用行；Enter / Tab 选中；光标在末尾时 → 下钻；搜索框为空时 ← / Backspace 返回上一级；Esc 在子页返回一级、在主页关闭；输入法组字时这些键都不处理。返回后高亮停在刚才进入的那一行。
- **焦点**：用键盘关闭（Esc、选中）回到消息输入框；点外面关闭或被别的浮层顶掉时不抢焦点。
- 图片在调起系统文件选择器前关闭面板。

不再展示：`Debug`、`Multitask`、`Ask`（只保留 Chat / Plan / Agent）；`MCP Servers`（不实现 MCP，不展示空入口、占位或“即将推出”）。

### `/` Slash Command 菜单

- 用户在空白草稿中输入 `/` 后，Composer 打开键盘优先的 Slash Command 菜单。
- 菜单只包含 `Functions` 与 `Skills` 两个一级分组，并复用现有模式回调、Context / Review 入口、`/compact` 路由和 Skill registry。
- `/` 与 `+` 是同一批能力的不同发现入口：`+` 偏鼠标、附件和多选，`/` 偏搜索、键盘和快捷调用；两者不要求展示完全相同的项目。
- Slash 菜单与 `+` 面板、模型菜单、Context 弹窗互斥，不新增常驻按钮，也不改变 Composer 默认视觉密度。
- 完整触发规则、命令清单、选择语义、键盘 / IME、可访问性、视觉和验收要求见 `docs/design-docs/frontend/front-composer-slash-command.md`。

### Chat / Plan / Agent 运行模式

#### 状态与切换

- 新会话默认为 `Agent`。
- `Agent` 默认态不显示模式 chip，输入栏保持最小噪音。只有选中 `Chat` 或 `Plan` 后，才在 `+` 后面显示彩色 chip。
- Plan / Chat chip 都带独立的 `×`（焦点在 chip 内按 Backspace 同效）回到 Agent；也可从 `+` 面板切换到其他模式。
- 切换只影响下一次发送，不改变已在运行的 Turn。流式生成期间模式控件与其他 Composer 编辑控件一样禁用。
- 模式按 Session 独立保存：`setSessionAgentMode` 校验 revision，并追加、flush `agent/mode-set` Journal 事件。切换会话或重启后从投影恢复，不重置为 Agent。
- 每次发送的 user message 仍只展示用户输入，不把“[Plan mode]”之类前缀拼进用户消息文本。

#### 能力契约

| 模式 | 用户意图 | 工具 profile | 运行时硬边界 |
| --- | --- | --- | --- |
| `Chat` | 对话、联网查询、图片生成 | `web`、`generate_image` | 不暴露工作区文件、Bash、Browser 或 Subagent 工具 |
| `Plan` | 调查现状、分析取舍、产出计划 | 显式 allowlist | 可读取、联网、图片分析、Explore 和 Todo；禁止 Bash、文件写删、Browser、图片生成和通用 agent |
| `Agent` | 规划并执行任务 | `full` | 使用当前主 Agent 完整工具集，仍受设置页工具开关、provider 能力、工作区边界和审批机制约束 |

profile 必须在工具注册 / 暴露阶段生效，不允许先把完整工具集发给模型，再依赖模型自律。为避免后续新工具自动泄露到 Plan，Plan 采用 allowlist，不采用“排除已知写工具”的 denylist。

Plan V1 允许的工具为：

- 工作区读取：`read_file`、`grep`、`glob`、`list_directory`。
- 外部资料读取：`web_search`、`web_fetch`。
- 补充能力：`inspect_image`、`explore`、`todo_read`、`todo_write`。

具体暴露集合是模式 allowlist 与当前注册工具的交集；缺少服务凭据时由工具执行返回配置错误，不保证通过隐藏 schema 表达。

Plan 的行为指导需要以独立 system prompt segment 注入：

- 先理解目标、检查相关实现和确认约束，不凭空写计划。
- 存在会改变方案的未知信息时先提问；信息足够时直接给出结构化计划。
- 计划应包含目标、影响边界、关键设计决策、实施顺序、验证方式和主要风险，粒度与任务复杂度匹配。
- 不得声称已编辑文件、已执行命令、已通过测试或已完成实施。

Skill 是上下文指导，不是权限包。无论 Skill 正文写了什么，都不得绕过当前模式的工具 profile：Chat 不开放 Skills 选择入口，Plan 中 Skill 只能使用 Plan allowlist，Agent 中也仍遵守审批和路径边界。

#### 文案

placeholder 随模式改变，但不代替模式 chip 和运行时契约：

| 情况 | placeholder |
| --- | --- |
| Agent 新建页 | `描述你要做的事，@ 引用文件，/ 调用命令` |
| Agent 对话中 | `继续追问…` |
| Plan | `描述要规划的改动…` |
| Chat | `问点什么…` |
| 运行中且启用队列 | `继续追问，运行中发送会进入队列…` |

### Image 入口

- 点击「图片」立即关闭 `+` 面板，并通过 Electron main 调起 macOS 原生文件选择器。
- 选择器使用 `openFile + multiSelections`，只显示产品支持的图片扩展名；V1 为 `png / jpg / jpeg / gif / webp / bmp / svg / heic / heif`。
- 用户取消时不产生附件、错误消息或空占位。重复选择同一路径时去重。
- textarea 接收系统剪贴板中的图片文件。PNG、JPEG、WebP 由 Electron main 校验签名后写入应用 `tmpRoot/composer-attachments`，确保附件既有安全预览，也有可供当前轮 Agent 工具读取的真实路径；不把 Base64 当作工具路径。
- 文件选择由 main 生成有界 `data:` 缩略图；拖放使用当前 renderer 生命周期内的 `blob:` 预览。禁止把本地 `file://` 交给 Vite renderer 加载，也禁止把预览 Base64 持久化到 session 事件。
- 发送边界必须剥离 `previewUrl`；后续 Session Projection 在 main 进程从已持久化的受信附件路径重新生成有界 `data:` 缩略图，仅丰富本次 IPC 返回值，不修改 Session Journal。源文件不可读时保留附件元数据并安全降级为空预览。
- 选中后显示 `48px` 图片缩略图；点击缩略图在右侧面板打开 Image Tab。发送后的用户消息图片同样是可聚焦的预览按钮，复用同一个 Image Tab 交互，不退化为只能查看缩略图的静态装饰。删除按钮保持紧凑并与预览按钮分离，模式切换不清空已选图片。
- Image 表示“把本地图片作为用户输入附件”，不是图片生成工具，不依赖 `generate_image` provider 设置。
- Composer 不根据主模型是否原生支持图片来禁用发送。runtime 根据实际能力路由：原生视觉模型接收图片内容；文本主模型接收附件元数据，并在当前模式与配置允许时调用 `inspect_image`。工具不可用时由模型明确说明限制，不得伪造视觉结论。
- 涉及系统文件选择、preload IPC、本地预览和多模态请求的验收必须在真实 Electron 窗口完成；浏览器 renderer 只能验证菜单、缩略图和错误态样式。

### Skills 页

`Skills` 复用设置页与主 Agent 已有的 Skill registry，不新建推荐市场、远程安装或 Composer 内管理功能。它是 `+` 面板里的一页，不再是悬浮展开的二级菜单。

#### 列表内容

- 展示当前 workspace 中主 Agent 可用的真实 Skills。
- 只展示 `enabledForAgent=true`、`shadowed=false` 且 `status=available` 的项；全局禁用、被遮蔽或解析 warning 的 Skill 不能在 Composer 中被绑定，用户可到设置页处理。
- 项目级 Skill 排在用户级 Skill 之前，同一 scope 内按 name 升序。
- 每项显示 name 和 description；不显示绝对路径、来源目录或卸载操作。
- 加载中、空列表（「暂无已启用的 Skills」）、IPC 失败（简短错误和「重试」）、没有匹配各有一行说明，不伪造样例 Skill。

#### 选择与注入

- 支持多选。点击或 Enter 切换选中状态，面板不关；已选行使用中性 selected 底色和勾选，不使用 operational 绿色表达 selected。
- 已选 Skill 以可移除 pill 显示在输入区上方，与图片附件同层但使用文字型外观；多个 pill 可换行。
- 选中 Skill 不修改设置页的全局启停状态，只表示当前 Composer 的显式上下文绑定。
- 绑定状态与当前会话模式一样在 initial / follow-up 切换中保持，V1 不持久化；发送完成后不自动清空，直到用户显式移除或离开应用。
- 发送契约只传递去重后的 Skill name 列表（例如 `selectedSkills: string[]`）。main 必须在当前 workspace 的 registry 中按 name 重新解析当前生效项，不接受 renderer 直接传入的任意文件路径。
- 对显式选中的 Skill，main 读取对应 `SKILL.md` 正文，作为独立、可识别的 system prompt segment 注入本轮上下文。未显式选中的 Skill 继续使用现有“名称 + 描述 + location”目录和按需读取机制，不预加载所有正文。
- Skill 在发送前被禁用、删除、遮蔽或无法读取时，本轮应明确失败并指出 Skill name，不得静默忽略用户的显式绑定。

#### 可访问性

- Skills 行让辅助技术读出 name、description 和选中状态。Skill pill 的删除按钮使用 `移除 {skillName}` 作为可访问名称。
- focus 使用高对比中性 ring；不用模式色取代 focus，不仅靠色彩表示当前模式或 Skill 选中。

### 本轮不做

- 不实现第四种 Debug / Multitask 模式。
- 不实现 MCP 发现、配置、连接、工具注入或占位 UI。
- 不在 Composer 中安装、卸载、启用或禁用 Skill；这些仍属于 Settings > Skills。
- 不为 Plan 新建独立 Agent loop、可编辑 Plan Document、任务状态机或“批准计划后自动执行”链路。Plan V1 复用主 Agent loop，只收紧工具 profile 并注入专用行为指导。
- 不在本规范中新建模型选择器、通用文件管理器或 Skill marketplace。

### 发送队列

回合运行中（包括上下文压缩中）发送的消息进入输入框上方的托盘，当前运行结束后按顺序发出。托盘的结构、`↳ 引导`、暂停与恢复的完整规则以 [中间消息区规范 · 消息队列与运行中引导](front-中间消息区规范.md#消息队列与运行中引导) 为准；这里只记录它和 Composer 的关系：

- 托盘是 Composer 根节点的子元素，在 panel 之前、Review strip 之后；不在 panel 里，不随 panel 的圆角、单行 / 多行和拖放区域变化。与 panel 同宽、间距 6px，`rounded-act-lg border-composer bg-surface`，不加阴影。
- 没有标题行：计数和发送时机在第一行左侧图标的 tooltip 里。最多露出 4 行（144px），再多在托盘内部滚动，不推动 panel。空队列不渲染。
- 运行中输入框有内容时，发送按钮的含义是「加入队列」；运行中且输入为空时是停止。占位文案见「文案」。

### Review / overflow 操作层

输入栏上方的轻量 action strip 用于进入 Review：

- 左侧 Review 按钮由 Git Review summary 驱动：有未提交改动时显示 `Review +N -M`。
- 无 Git repository 时显示无计数的 `Review`，点击进入右侧 Review Tab 的 Git 初始化空态。
- 无未提交改动时不显示 Review strip，避免 Composer 常驻无效操作。
- SubAgent transcript panel 打开期间不显示 Review strip，优先保证当前 panel 和 follow-up 输入的视觉关系；关闭 panel 后恢复。
- 相邻 overflow `...` 只保留真实 Review quick actions，例如打开 `Last Turn` 或 `Uncommitted`；能力不可用时展示明确 disabled reason，不保留 AI Review 或无行为占位。


## 状态行统计胶囊

> 2026-10-14 实现（`components/composer/ComposerStatsPills.tsx`、`composer-stats.ts`；模型侧计时在宿主投影 `packages/session/projection/src/facts.ts`），交互原型 `composer-usage-dock-demo.html`。显示分支和数字格式逐条照 DeepSeek Harness `StatsPills.tsx`（详细模式）与 `token-format.ts`。

follow-up 状态行右侧、context 圆环左边，两个整会话累计的胶囊：

| 胶囊 | 文字 | 不显示 | 只读（span，不可点） | 面板 |
|---|---|---|---|---|
| 会话统计（`Gauge`） | `N 轮 M 步 · 43 tok/s` | 还没有任何一步 | 模型用时、工具用时、TTFT 步数都为 0 且没有输出速度 | 「会话统计」：模型用时 / 工具调用用时 / 首 token 平均（TTFT）/ 输出速度（TPS），有值才出行 |
| Token 用量（`Database`） | `12.2K tok · 缓存命中 80%` | 计费输入和输出都为 0 | — | 「Token 用量」，标题值是精确总量：缓存命中 / 未缓存输入 / 缓存读取 / 缓存写入（非 0 才出行）/ 输出 |

- 计费输入 = 未缓存输入 + 缓存读取 + 缓存写入；输出速度 = 总输出 token ÷ 总解码时长；缓存命中不会把「差一点全命中」舍成 100%。
- 胶囊是状态行里的纯文字入口（原生 `<button>`，和 context 圆环一致），悬停或展开时给 hover 底色；面板是 `ui/Popover`，在胶囊上方右对齐，宽 300–440px。
- 数据口径（2026-10-16 修订）：全部取自宿主投影，不再读渲染端事件窗口。轮次、步数、Token 用量来自 `activity` / `usage`；模型用时、TTFT、输出速度来自 `activity.timing`——`sessionStats` 投影（stateVersion 3）扫全量 journal（含 `assistant/chunk`）累加，所以重新打开的会话和长会话也准；工具用时来自全量 `tools` 投影。历史窗口照旧去掉已定稿消息的 chunk，这不影响统计。 模型用时按每次请求的 request/header 到 assistant/message 或 llm/retry 累加，包含失败尝试，不包含重试等待；重试结算后清空计时起点。旧版本统计缓存失效后从 Journal 重建。
## Context 弹窗

点击 follow-up 底部状态行右侧的 context usage 入口后弹出。

### 内容

- 上下文总占用。
- 分段占用条。
- System prompt。
- Tools。
- Rules。
- Skills。
- MCP。
- Subagents。
- Conversation。

### 原则

- 分段彩色部分表示已使用容量，未使用部分使用低对比 `--act-color-meter-track`；不能用深灰轨道与已用数据竞争视觉注意力。

- 保持统计感。
- 以占用和构成为主，不做复杂编辑。
- 视觉上接近你给的那张参考图。

## 附件展示

- 图片附件显示真实缩略图；点击后进入右侧 Image Tab，不新增模态预览层。
- 文件附件只显示文件名。
- 附件位于输入 panel 内、输入框上方，简洁排列；有附件时 Composer 进入多行。
- 图片删除按钮使用约 `18px` 点击区与 `11px` X 图标；默认隐藏，仅在鼠标悬浮到附件或键盘聚焦到附件控件时显示。删除只移除当前 Composer 附件，不删除原始文件。
