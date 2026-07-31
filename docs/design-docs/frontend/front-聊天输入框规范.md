# 聊天输入框规范

## 定位

聊天输入框是整页最重要的操作中心。

当前 Composer 是一套可复用输入系统，而不是单一输入条。它既支持已有会话底部的轻量 `follow-up bar`，也支持创建新会话时的居中 `initial composer`。

- 默认态是低高度的贴底输入面板，优先服务“继续追问 / 继续指挥当前会话”。
- 复杂能力通过左侧 `+` 菜单展开，不在默认态把所有入口铺开。
- 输入栏下方展示会话状态行，让 branch、This Mac / Worktree 和 context usage 成为稳定状态信息。
- 输入栏上方预留 `Review / overflow` 操作层，未来承载 diff review、批量操作和更多会话动作。
- 新会话首屏使用 `initial composer`，发送首条消息后切换回底部 follow-up composer。

## 内容

- follow-up 输入区域默认一行高，内容较长时向多行扩展（上限内滚动）。
- 左侧 `+` command menu，用于选择 Chat / Plan / Agent 运行模式，并添加图片或 Skill 上下文。
- 当前运行模式 pill，紧跟 `+` 展示，让用户在发送前持续看到本轮能力边界。
- `Review / overflow` 操作层。
- 模型按钮下拉。
- Image 附件与 Skills 入口。
- 发送按钮。
- 会话状态行：branch、This Mac / Worktree、context usage。
- 新会话上下文选择行：workspace、branch、runtime。
- 上下文弹窗。

## 原则

- 使用弹出下拉，不使用生硬的静态选择框。
- 输入区要像桌面应用里的 follow-up command bar，而不是普通网页表单或网页聊天大卡片。
- 默认态保持轻量、贴底、低高度；不要把输入区域做成大面积白色卡片。
- 保留继续输入的舒适空间，但默认视觉重心应让位给上方消息流。
- 不显示语音按钮。
- 发送按钮保持单一、轻量、克制：使用编辑器式反色圆形按钮 + 上箭头，用 `bg-text-main` / `text-surface` 语义类随主题翻转（浅色 = 近黑底白箭头，深色 = 近白底深箭头），禁用态退为灰底；不使用彩色 accent。
- `model` 选择保持文字化，不加边框。
- Context usage 只在 follow-up 底部状态行右侧显示和打开，不再放在输入 panel 内。
- 普通 focus ring 使用高对比中性 token；运行状态可使用 operational green。Context usage 默认保持中性，只有接近阈值时切 warning / danger；Thinking toggle 不再默认使用品牌蓝。
- workspace、branch、runtime 都应表现为下拉入口；真实交互、Git 和 Worktree 边界统一遵循 `front-workspace-git-worktree-context.md`。
- Chat / Plan / Agent 不是只改 placeholder 的视觉标签；每次发送都必须把模式作为显式运行参数传入 main 和 Agent Runtime，由工具暴露层强制能力边界。Prompt 只负责行为指导，不承担权限隔离。
- Slash Command 在发送前由 renderer 分流：`/compact` 触发上下文压缩，`/eval [失败说明]` 触发最近失败 Turn 的回归 Candidate 生成；命令文本不作为普通用户消息显示。

## Composer 形态

### Ink & Emerald 视觉职责

- Composer 使用主题 `surface` 和 1px 中性 hairline，不使用蓝色描边或蓝色光晕建立默认层级。
- 发送按钮继续使用主题反色的 ink action：浅色近黑底、深色近白底，不改成绿色 CTA。
- 运行 / 停止状态可以使用小型 operational 绿点、细环或中性停止控件。
- Context usage、branch、This Mac / Worktree 等状态行默认使用 muted / faint 灰阶。
- operational green 只表示运行、连接或确认，不用于模型选择、附件、普通 `+` 按钮或菜单选中。
- 模式 pill 是对当前能力 profile 的持续编码，允许使用三种语义色：Chat = info soft，Plan = warning soft，Agent = operational soft。色彩必须同时有文字和图标表达，不能成为唯一区分依据。
- 菜单行的 hover / selected 仍使用中性底色和勾选，不把整行涂成模式色；模式色只出现在图标、文字小范围和 Composer 中的当前模式 pill。

Composer 有 `surface`（`followup` / `initial`）一个外部维度，内部布局按内容高度**动态切换**（2026-07-05 定稿）：

- **inline（单行）**：follow-up 默认态。`+`、当前模式 pill、输入框、模型选择和发送按钮全部同一行，输入框占据剩余空间。
- **stacked（两行）**：输入框全宽在上，控件行贴底（左 `+`、当前模式 pill 和模型选择，右发送 / 停止）。

切换规则：

- 判定依据是**inline 可用宽度下的渲染高度**（`scrollHeight` 超过单行阈值），不是有没有 `\n`——长文本自动折行也会触发；删回一行自动切回 inline。不允许用 stacked 全宽输入框的高度反向决定是否切回 inline，否则宽度变化会造成误判和内容裁切。
- 附件存在、`initial` surface 强制 stacked。
- **实现约束：切换不允许 remount textarea**。inline / stacked 是同一个 grid 容器切换 `grid-template-areas`，textarea / `+` / mode / 模型 / 发送元素的 DOM 结构不变，正在打字时切换不丢焦点和光标。toolbar 分组用 `display: contents` 保留 aria 语义。
- 模型菜单展开方向随布局态切换：inline 时按钮在右、菜单向左展开；stacked 时按钮在左、菜单向右展开。
- 模型主菜单保持约 `244px` 的紧凑单列，行高约 `34px`；选中项只使用轻量中性底色与勾选，不额外加粗整行。
- 菜单顶部固定模型搜索框，打开时自动聚焦；搜索只在当前可用模型中按名称、供应商、API model ID 和内部 ID 做本地过滤，不触发远端目录请求。
- 搜索结果按供应商分组展示，分组标题使用共享供应商注册表中的用户可读名称；搜索后不包含匹配模型的分组不显示。
- Composer 折叠态默认只显示模型名称；当前候选中存在跨供应商同名模型时追加供应商名称。同一供应商内部仍重名时，再追加 API model ID，保证菜单关闭后仍能确认真实模型身份。
- `Edit` 仅在对应模型行 hover / keyboard focus 或 Options 已打开时出现；Options 约 `210px`，贴着触发模型行在主菜单外侧展开，不固定沉到菜单底部。
- Options 必须由模型能力驱动：支持开关时显示 Thinking；提供推理强度时显示 `Auto / Minimal / Low / Medium / High / Extra High / Max` 中该模型真实支持的项；`Auto` 表示不覆盖供应商默认值。强制推理模型不能被关闭。
- Composer 不提供上下文长度选择器。模型使用注册表声明的原生最大上下文，Context 入口只负责展示当前占用。
- 主菜单和 Options 打开时使用约 `140ms` 的 opacity + transform 轻量过渡；系统启用 reduced motion 时取消过渡。
- 模型列表保留滚动能力，但不通过扩大菜单宽度或行高承载更多信息。
- 窗口不超过 `600px` 时，即使输入内容仍是单行，也强制使用 stacked grid：输入占第一行，`+ / mode / model / send` 位于第二行；Composer 两侧留白收敛为 `18px`，mode 和模型标签都可截断，不得挤压发送按钮。
- initial composer 的 workspace / branch / runtime 选择行在窄窗允许横向滚动，不把三个入口压成不可读窄条。

| surface | 布局 | 结构 |
| --- | --- | --- |
| `followup` 单行 | inline | Review strip → panel 内 `+ / mode / input / model / send` 同行 → status row |
| `followup` 多行或有附件 | stacked | Review strip → panel 内 `attachments? / skills? / input` 全宽 / `+ mode model … send` 贴底 → status row |
| `initial` | stacked | selector row → panel 内 `attachments? / skills? / input` 全宽 / `+ mode model … send` 贴底 → optional Plan shortcut |

首条消息发送后，ConversationView 进入消息流状态，并显示底部 followup composer。

## Initial composer 结构

创建新会话时，Composer 位于消息区中部，包含三层：

1. 上下文选择行：当前 workspace、真实 Git branch（非 Git Workspace 隐藏）以及 `This Mac` / `New Worktree` runtime，三者都是下拉入口；Worktree 细节见 `front-workspace-git-worktree-context.md`。
2. 输入 panel：输入框在面板上半部；底部 toolbar 从左到右包含 `+`、当前模式 pill、模型入口和发送按钮。
3. 可选快捷 chip：`Plan New Idea`。如果保留，点击或 `Shift+Tab` 必须真实切换到 Plan；不允许继续作为无行为的 demo 控件。

Initial composer 不显示 follow-up 的 Review strip，也不显示底部 branch/local/context usage 状态行。

## Follow-up bar 结构

从上到下分三层：

1. Review 操作层：位于输入栏上方，Git workspace 存在未提交改动时显示真实 `Review +N -M` 汇总和 quick actions；无改动时不显示 Review 入口；当前 workspace 不是 Git repository 时显示无计数的 `Review` 入口，引导用户在右侧 Review Tab 查看初始化提示。
2. 输入面板：输入框全宽在上；底部控件行左侧为 `+`、当前模式 pill 与模型选择，右侧为发送 / 停止按钮。
3. 状态行：左侧显示真实 branch 与 `This Mac` / `Worktree`，右侧显示 context usage 百分比或等价统计入口，也是打开 Context 弹窗的唯一入口。

### `+` command menu

点击左侧 `+` 打开真实能力菜单。本节取代历史 execution plan 中“只展示 demo 菜单、不接业务行为”的旧边界；后续实现以本文档为事实来源。

菜单固定结构：

1. 顶部弱提示：`Choose mode or add context.`
2. 显式模式：`Chat`、`Plan`。`Agent` 是无额外标签的默认运行态，不在菜单中展示。
3. 分隔线。
4. 上下文入口：`Image`、`Skills`。

不再展示：

- `Debug`、`Multitask`、`Ask`：当前产品只保留 Chat / Plan / Agent 三种边界明确的模式。
- `Models`：模型已有 Composer 中的独立选择器，不建立第二个入口。
- `Attach files`：显式菜单入口收口为 Image；已有的拖拽普通文件能力可作为兼容行为保留，但不在菜单中暴露。
- `MCP Servers`：当前不实现 MCP，不展示空入口、占位态或“即将推出”。

菜单与 model menu、model options、Context popup 互斥。选择模式后关闭菜单；Image 在调起系统文件选择器前关闭菜单；鼠标悬浮到 Skills 行时展开二级菜单，鼠标离开主菜单与二级菜单组成的整个浮层后关闭。

### Chat / Plan / Agent 运行模式

#### 状态与切换

- 新会话默认为 `Agent`。
- `Agent` 默认态不显示 mode pill，输入栏保持最小噪音。只有选中 `Chat` 或 `Plan` 后，才在 `+` 与 model selector 之间显示彩色 pill。
- Chat / Plan pill 带有关闭图标，点击 pill 直接恢复 Agent；切换到 Chat / Plan 仍从 `+` command menu 完成。
- 切换只影响下一次发送，不改变已在运行的 Turn。流式生成期间模式控件与其他 Composer 编辑控件一样禁用。
- 模式在当前会话的 initial / follow-up Composer 切换中保持；切换到其他会话时按各会话独立保持。V1 不写入 session 持久化，应用重启后回到 Agent。
- 每次发送的 user message 仍只展示用户输入，不把“[Plan mode]”之类前缀拼进用户消息文本。

#### 能力契约

| 模式 | 用户意图 | 工具 profile | 运行时硬边界 |
| --- | --- | --- | --- |
| `Chat` | 纯对话、解释、头脑风暴 | `none` | 不向模型暴露任何工具 definition；除用户显式绑定的 Image / Skill 上下文外，不主动读取工作区、不搜索、不执行、不修改文件 |
| `Plan` | 调查现状、分析取舍、产出可执行计划 | `read-only` | 只允许明确 allowlist 中的只读工具；禁止通用 Bash、写/删文件、Browser、图片生成和 SubAgent |
| `Agent` | 规划并执行任务 | `full` | 使用当前主 Agent 完整工具集，仍受设置页工具开关、provider 能力、工作区边界和审批机制约束 |

profile 必须在工具注册 / 暴露阶段生效，不允许先把完整工具集发给模型，再依赖模型自律。为避免后续新工具自动泄露到 Plan，Plan 采用 allowlist，不采用“排除已知写工具”的 denylist。

Plan V1 允许的工具为：

- 工作区读取：`read_file`、`grep`、`glob`、`list_directory`。
- 外部资料读取：`web_search`、`web_fetch`，仅在对应 provider 可用时暴露。

Plan 的行为指导需要以独立 system prompt segment 注入：

- 先理解目标、检查相关实现和确认约束，不凭空写计划。
- 存在会改变方案的未知信息时先提问；信息足够时直接给出结构化计划。
- 计划应包含目标、影响边界、关键设计决策、实施顺序、验证方式和主要风险，粒度与任务复杂度匹配。
- 不得声称已编辑文件、已执行命令、已通过测试或已完成实施。

Skill 是上下文指导，不是权限包。无论 Skill 正文写了什么，都不得绕过当前模式的工具 profile：Chat 中 Skill 只能指导文本回复，Plan 中 Skill 只能使用 Plan allowlist，Agent 中也仍遵守审批和路径边界。

#### 文案

placeholder 随模式改变，但不代替彩色 pill 和运行时契约：

| 模式 | initial | follow-up |
| --- | --- | --- |
| Chat | `Ask anything...` | `Continue the conversation...` |
| Plan | `Plan and design before coding...` | `Refine the plan...` |
| Agent | `Plan, build, or ask...` | `Send follow-up` |

### Image 入口

- 点击 `Image` 立即关闭 command menu，并通过 Electron main 调起 macOS 原生文件选择器。
- 选择器使用 `openFile + multiSelections`，只显示产品支持的图片扩展名；V1 为 `png / jpg / jpeg / gif / webp / bmp / svg / heic / heif`。
- 用户取消时不产生附件、错误消息或空占位。重复选择同一路径时去重。
- 选中后复用现有 Composer 图片缩略图和删除交互；模式切换不清空已选图片。
- Image 表示“把本地图片作为用户输入附件”，不是图片生成工具，不依赖 `generate_image` provider 设置。
- 发送前必须根据当前模型的 input capability 验证图片支持。有图片但当前模型不支持 image input 时，禁用发送并明确提示“当前模型不支持图片输入”，不得静默降级成只传文件名。
- 涉及系统文件选择、preload IPC、本地预览和多模态请求的验收必须在真实 Electron 窗口完成；浏览器 renderer 只能验证菜单、缩略图和错误态样式。

### Skills 二级菜单

`Skills` 复用设置页与主 Agent 已有的 Skill registry，不新建推荐市场、远程安装或 Composer 内管理功能。

- 桌面鼠标环境以悬浮为主交互：进入 Skills 行立即展开。点击仍作为触摸板、键盘与无 hover 设备的兼容入口，不作为桌面端的主路径。

#### 列表内容

- 二级菜单展示当前 workspace 中主 Agent 可用的真实 Skills。
- 只展示 `enabledForAgent=true`、`shadowed=false` 且 `status=available` 的项；全局禁用、被遮蔽或解析 warning 的 Skill 不能在 Composer 中被绑定，用户可到设置页处理。
- 项目级 Skill 排在用户级 Skill 之前，同一 scope 内按 name 升序。
- 每项第一行显示 name，第二行显示最多两行 description；不显示绝对路径、来源目录或卸载操作。
- 加载中显示紧凑 skeleton；空列表显示 `No enabled skills`；IPC 失败显示简短错误和 `Retry`，不伪造样例 Skill。

#### 选择与注入

- 支持多选。点击 Skill 行切换选中状态，已选行使用中性 selected 底色和勾选，不使用 operational 绿色表达 selected。
- 已选 Skill 以可移除 pill 显示在 Composer 输入区上方，与图片附件同层但使用文字型外观；多个 pill 可换行。
- 选中 Skill 不修改设置页的全局启停状态，只表示当前 Composer 的显式上下文绑定。
- 绑定状态与当前会话模式一样在 initial / follow-up 切换中保持，V1 不持久化；发送完成后不自动清空，直到用户显式移除或离开应用。
- 发送契约只传递去重后的 Skill name 列表（例如 `selectedSkills: string[]`）。main 必须在当前 workspace 的 registry 中按 name 重新解析当前生效项，不接受 renderer 直接传入的任意文件路径。
- 对显式选中的 Skill，main 读取对应 `SKILL.md` 正文，作为独立、可识别的 system prompt segment 注入本轮上下文。未显式选中的 Skill 继续使用现有“名称 + 描述 + location”目录和按需读取机制，不预加载所有正文。
- Skill 在发送前被禁用、删除、遮蔽或无法读取时，本轮应明确失败并指出 Skill name，不得静默忽略用户的显式绑定。

#### 浮层与窄窗口

- 宽窗口中鼠标悬浮 Skills 时，二级菜单默认贴主菜单右侧展开；右侧空间不足时翻到左侧。鼠标可直接从 Skills 行横向移入二级菜单，中间不得存在会误触发关闭的空隙。建议宽度 `300-340px`，最大高度不超过当前可见区域，列表内部滚动。
- 窗口不超过 `600px` 时不使用横向并列二级菜单；在同一 popover 内进入 Skills 视图，顶部提供 Back 返回主菜单。
- 主菜单和 Skills 视图使用约 `140ms` opacity + transform 过渡；`prefers-reduced-motion` 下取消过渡。

#### 键盘与可访问性

- `+` 和模式 pill 使用 `aria-haspopup="menu"` 与同一 `aria-controls`，`aria-expanded` 反映 command menu 状态。
- 菜单打开后焦点进入当前模式项；方向键在当前菜单内移动，`Enter` / `Space` 激活，`Escape` 分层关闭，并把焦点退回打开菜单的 trigger。
- Skills 行必须让辅助技术读出 name、description 和选中状态。Skill pill 的删除按钮使用 `Remove {skillName}` 作为可访问名称。
- focus 使用高对比中性 ring；不用模式色取代 focus，不仅靠色彩表示当前模式或 Skill 选中。

### 本轮不做

- 不实现第四种 Debug / Multitask 模式。
- 不实现 MCP 发现、配置、连接、工具注入或占位 UI。
- 不在 Composer 中安装、卸载、启用或禁用 Skill；这些仍属于 Settings > Skills。
- 不为 Plan 新建独立 Agent loop、可编辑 Plan Document、任务状态机或“批准计划后自动执行”链路。Plan V1 复用主 Agent loop，只收紧工具 profile 并注入专用行为指导。
- 不在本规范中新建模型选择器、通用文件管理器或 Skill marketplace。

### Review / overflow 操作层

输入栏上方的轻量 action strip 用于进入 Review：

- 左侧 Review 按钮由 Git Review summary 驱动：有未提交改动时显示 `Review +N -M`。
- 无 Git repository 时显示无计数的 `Review`，点击进入右侧 Review Tab 的 Git 初始化空态。
- 无未提交改动时不显示 Review strip，避免 Composer 常驻无效操作。
- SubAgent transcript panel 打开期间不显示 Review strip，优先保证当前 panel 和 follow-up 输入的视觉关系；关闭 panel 后恢复。
- 相邻 overflow `...` 只保留真实 Review quick actions，例如打开 `Last Turn` 或 `Uncommitted`；能力不可用时展示明确 disabled reason，不保留 AI Review 或无行为占位。

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

## Context 定稿图

![Context 定稿图](context-popup-final.png)

## 附件展示

- 图片附件只显示图片本体。
- 文件附件只显示文件名。
- 附件位于 follow-up 输入栏上方、Review / overflow 层下方，简洁排列。
- 删除附件的 X 按钮默认隐藏，仅在鼠标悬浮到附件或键盘聚焦到删除按钮时显示。

## Composer 定稿图

![Composer 定稿图](composer-final.png)

当前实现计划以 `/Users/wakeup-jin/Desktop/actspace-learing-design/bug/19-2.png` 和 `/Users/wakeup-jin/Desktop/actspace-learing-design/bug/19-3.png` 的 follow-up bar 方向为准；仓库内 `composer-final.png` 后续需要在视觉稿更新时同步替换。
