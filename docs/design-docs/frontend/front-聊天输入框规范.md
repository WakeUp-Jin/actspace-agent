# 聊天输入框规范

管 Composer（`components/Composer.tsx`、`components/composer/**`）：形态、`+` 面板、模型菜单、Slash 菜单、运行模式、附件、Skills、发送队列和状态行。Runtime 模式契约见 [Agent 形态与三种工作模式](../agent-runtime/agent-forms-and-modes.md)；运行目标（工作区 / 分支 / 运行位置）见 [front-workspace-git-worktree-context.md](front-workspace-git-worktree-context.md)；`@` 引用与回复批注见 [front-composer-file-mentions-and-response-annotations.md](front-composer-file-mentions-and-response-annotations.md)。

## 定位

Composer 是整页的操作中心，一套可复用的输入系统，有两种 surface：

- `followup`：已有会话底部的贴底输入面板，默认低高度，服务「继续追问」。
- `initial`：新会话时居中的输入面板，发送首条消息后切换为 `followup`。

两种 surface 是同一个 Composer：ConversationView 只挂载一次，切换时只换外层布局 class，焦点、输入法状态和草稿都保留。

| surface | 结构（从上到下） |
| --- | --- |
| `followup` | Review strip → 发送队列托盘 → panel → 只读状态行 |
| `initial` | 运行目标行 → 发送队列托盘 → panel（多行） |

原则：像桌面应用里的 follow-up command bar，不是网页表单或大白卡片；复杂能力收进左侧 `+` 面板，默认态不铺开入口；不显示语音按钮；菜单一律用弹出下拉，不用静态选择框。

## 外观与控件

- 外框：`bg-surface`、1px `border-composer`（聚焦 `border-composer-focus`）、`shadow-act-composer`（聚焦 `shadow-act-composer-focus`）。这是阴影规则的例外，因为输入框需要轻微浮起；不用蓝色描边或光晕。色彩与 token 规则见 [front-视觉token规范.md](front-视觉token规范.md)。
- 单行 / 多行（同一个 grid 容器切换 `grid-template-areas`，不允许 remount textarea，打字时切换不丢焦点和光标）：

| | 单行（inline） | 多行（stacked） |
| --- | --- | --- |
| 外框 | 胶囊（`rounded-act-pill`） | `rounded-act-xl`（18px） |
| grid | `plus mode input model send`（Agent 无 mode） | `input` 全宽 / `plus mode model . send` |
| 模型按钮 | 输入区右侧、发送按钮左边 | 底部工具行 `+` / 模式之后 |
| 输入区 | 单行 | 最高 200px 后内部滚动；新建页最少 2 行 |

- 进入多行：按单行宽度测量会折行、文本含换行、有附件 / Skill / 回复引用、新建页、窗口不超过 600px。回到单行只在输入框完全清空且没有附件、Skill、引用时；进入多行后删到一行仍保持多行（`stuckStacked`），避免外框来回跳。测量用单行宽度下的渲染高度。
- 控件：

| 控件 | 规格 |
| --- | --- |
| `+` | 28px 圆形 ghost IconButton，hover 和面板打开时出底色，`aria-expanded` |
| 模式 chip | Agent 不显示。Plan / Chat 为 `[图标 名称 ×]`，高 24px、13px、胶囊；Plan `bg-warning-soft text-on-warning`，Chat `bg-operational-soft text-operational`。`×` 是独立 IconButton（`退出 Plan 模式` / `退出 Chat 模式`），焦点在 chip 内按 Backspace 同效；运行中禁用；退出后焦点回输入框。当前实现渲染图标 + 名称（`ComposerToolbar.tsx`），模式靠名称文字区分，颜色只是辅助，不是唯一区分依据；状态表达的全局规则见 [front-文案与状态表达规范.md](front-文案与状态表达规范.md) |
| 模型按钮 | 无边框文字按钮，`text-text-muted`，最大宽 220px 截断 |
| 发送 / 停止 | 28px 圆形 IconButton + 上箭头，按模式着色：Agent `accent`、Plan `warning`、Chat `operational`；停止按钮保持 primary，不跟模式变色。输入为空且运行中显示停止；不能发送时 tooltip 与 aria-label 写原因 |

- operational green 只表示运行、连接、确认（及 Chat 模式），不用于模型选择、附件、普通 `+` 或菜单选中；菜单行 hover / selected 用中性底色和勾选，不整行涂模式色。
- Context usage 只在 follow-up 底部状态行右侧显示和打开，默认中性，接近阈值（75% 黄、90% 红）才变色。
- 浮层互斥：`+` 面板、模型菜单、Context 用量、状态行两个统计胶囊面板、新建页三个运行目标菜单由同一个 `ComposerOverlay` 状态管理，同一时间只开一个，被顶掉的不抢回焦点；斜杠菜单由输入内容推出，与它们互相收起。
- 占位文案：

| 情况 | placeholder |
| --- | --- |
| Agent 新建页 | `描述你要做的事，/ 调用命令`（@ 引用文件上线后再加「@ 引用文件」） |
| Agent 对话中 | `继续追问…` |
| Plan | `描述要规划的改动…` |
| Chat | `问点什么…` |
| 运行中（队列） | `继续追问，运行中发送会进入队列…` |

## Initial 与 Follow-up 结构

- Initial：运行目标行（工作区 ⌄ / 分支 ⌄ / 运行位置 ⌄，无边框文字按钮，可换行；远端无分支按钮，Chat 只在远端显示运行位置）+ 多行 panel（输入在上、底部 `+` / 模式 chip / 模型 / 发送）。`Shift+Tab` 切 Plan（Chat 无效）；不显示 Review strip 与底部状态行。
- Follow-up：
  1. Review strip：Git workspace 有未提交改动时显示真实 `Review +N -M`；非 Git 目录显示无计数的 `Review`（进右侧 Review Tab 的初始化空态）；无改动不显示；远端会话和子 Agent 面板打开期间不显示。旁边的 `...` 只放真实 Review quick actions，不可用时写明原因。
  2. 发送队列托盘（有排队或已引导消息时）。
  3. panel。
  4. 只读状态行：左侧运行位置（`⑂ 分支 · 💻 本机` / `⑂ 分支 · ⑂ 工作树` / `🖥 Host · 📁 工作区`）和权限控件，右侧两个统计胶囊和 context 用量；没有下拉、对话中不能切机器；Chat 左侧为空。

## `+` 面板

点 `+` 打开与输入框同宽的面板（`ui/Popover` 锚在整个 panel、`side="top"`、间距 8px，放不下时翻到下方）。`rounded-act-lg`、`bg-surface-raised`、`shadow-act-popover`，行高 28px，高亮行 `bg-hover-overlay`，列表最高 280px；上下都放不下时整张面板遵守 Radix 可用高度，搜索 / 返回行不收缩、列表内滚动。

```text
🔍 搜索 Skills、文件…
📋 Plan   先出计划，确认后再执行      ← 只列当前不是的模式
💬 Chat   纯对话，不使用工具
─────────────
📎 图片与文件 / 图片                 ← 见「附件」
📖 Skills                        ›   ← Chat 不显示
```

- 模式组：空会话列 Plan / Chat 中不是当前模式的；已开始的 Agent 会话只列 Plan；已开始的 Plan / Chat 不列；运行中模式行禁用。
- 搜索：打开即聚焦，在模式、附件、Skills 中本地过滤，按「模式 / 添加 / Skills」分组，无结果「没有匹配的结果。」；打开时就加载 Skills。
- 下钻：Skills › 在同一张卡片内换页，搜索框左侧变 `‹`。模型和 Thinking / 推理强度只在模型菜单里选。
- 键盘：焦点始终在搜索框（combobox + `aria-activedescendant`）；↑↓ 循环并跳过禁用行；Enter / Tab 选中；光标在末尾按 → 下钻；搜索框为空时 ← / Backspace 返回；Esc 子页返回一级、主页关闭；IME 组字时不处理。键盘关闭回输入框；点外面或被顶掉不抢焦点。
- 不展示 Debug / Multitask / Ask 模式和 MCP 入口。

## 模型菜单

- 模型按钮打开 `ui/Popover`（上方、左对齐、间距 8px），宽约 244px，行高约 34px；选中项只用轻量中性底色 + 勾选。本机和远端是同一个菜单：远端只列 Host 回报的模型、没有 Options，未回报时写「等待 Host 模型」。
- 顶部固定搜索框，打开即聚焦，只在可用模型中按名称、供应商、API model ID、内部 ID 本地过滤；结果按供应商分组（用户可读名称），无匹配的分组不显示。
- 折叠态只显示模型名；跨供应商同名时追加供应商名，同一供应商内仍重名再追加 API model ID。
- `编辑` 只在行 hover / 键盘聚焦或 Options 已打开时出现；Options 约 210px，贴在菜单左侧或右侧。Options 由模型能力驱动：支持开关时显示 Thinking；推理强度只列该模型真实支持的 `Auto / Minimal / Low / Medium / High / Extra High / Max`（`Auto` 不覆盖供应商默认）；强制推理模型不能被关闭。
- 不提供上下文长度选择器，模型用注册表声明的最大上下文。约 140ms opacity + transform 过渡，reduced motion 取消；Esc 关闭后焦点回模型按钮。

## `/` Slash 菜单

`+` 偏鼠标、附件和多选，`/` 偏键盘搜索与快速调用，二者共享行为和 Skill registry，不要求内容一致。菜单只有 `Functions` 与 `Skills` 两组，不增加 Commands / Modes / Tools 等分类；Function 必须对应真实行为，不放占位。实现：`composer-slash-commands.ts`、`composer/SlashMenu.tsx`。

### Functions（固定顺序，不按字母排）

| 命令 | 行为 | 选择后 |
| --- | --- | --- |
| `/plan` | `onModeChange("plan")` | 清除查询并恢复焦点；当前模式项显示勾选（中性底色） |
| `/agent` | `onModeChange("agent")` | 同上 |
| `/compact` | 经统一 `submitTask` 提交压缩，空闲执行、繁忙排队 | 清除查询；只发命令本身与模型运行选项，不消费已选 Skill 和已有附件 |
| `/status` | `onExpandContext`，打开 Context 视图 | 清除查询并恢复焦点 |
| `/review` | `onOpenReview` | 同上 |
| `/side` | 把输入替换为 `/side `，不执行 | 发送 `/side 问题` 在右侧新开侧边对话并把问题发到那里（只发 `/side` 则只打开）；失败恢复草稿并报错 |

- 运行中不切模式，列表去掉 `/plan`、`/agent`（`/compact` 进入队列）；Chat 只有 `/compact`、`/status`，没有 Skills；`/side` 只在主对话 Composer 提供（需 `onOpenSideChat`、本地目标、非 Chat 形态），侧边对话内的 Composer 不提供；`/chat`、`/eval` 不存在。两个 Composer 可同时挂载，菜单 DOM id 按实例生成（`composer-slash-menu-<id>`）。
- 菜单层不直接访问文件系统、Skill 文件或 Runtime；`/compact` 的执行经 App / IPC 的 `submitTask`，由 Host Task 服务负责（见 [Task/Run 契约](../agent-plugin-runtime/agent-task-run-lifecycle.md)）。

### Skills

- 数据来自 `skillsApi.list({ workspaceRoot })`，只展示 `enabledForAgent=true`、`shadowed=false`、`status=available`；项目级在用户级之前，同级按 name 升序；搜索匹配 name 与 description（不区分大小写）。
- 点击或 Enter 切换绑定、清除查询、关闭菜单并恢复焦点；绑定语义与 `+ > Skills` 完全一致，菜单不负责安装、卸载、启停。
- 首次打开按 workspace 懒加载并复用缓存，workspace 变化后失效重载。加载中只在 Skills 分组显示 loading，Functions 仍可用；空列表「暂无已启用的 Skills」；失败「Skills 暂不可用。」+ 重试，不关菜单。

### 触发、搜索与键盘

- 仅当 Composer 可编辑、未 streaming，且完整草稿匹配 `^/[^/\s]*$` 时打开：`/` 必须是第一个字符；普通句子、URL、含后续 `/` 的路径、代码里的 `/` 不触发；输入空格或换行后关闭；粘贴完整命令也打开并定位精确匹配。
- 空查询显示完整 Functions + Skills；有查询时同时过滤两组，无结果的组不显示标题；Function 匹配 command、label、description 与英文检索别名，精确 command 前缀优先，其余保持固定顺序。无任何匹配显示「没有匹配的功能或 Skills」。
- 输入框始终保留真实焦点。↑↓ 在可见结果中循环；Enter 选择（不发送）；Shift+Enter 换行并关闭菜单；Tab 不被劫持，`Shift+Tab` 切 Plan 不变；Esc 关闭但保留草稿；点外部关闭，查询再变化允许重开；IME 组合期间 Enter 不选择也不发送（`isComposing` / `keyCode === 229`）；hover 只改 active，单击才执行。
- 无障碍：编辑器暴露 `aria-expanded` / `aria-controls` / `aria-activedescendant`；结果 `role="listbox"`，行 `role="option"`；分组标题不进键盘序列；Function 可访问名称含不带 `/` 的命令名和作用，Skill 含 name、description 与是否已绑定；selected / active / disabled 不只靠颜色。

### 布局

- 宽窗口：锚定输入区左侧，宽约 520px，不超过 Composer 可用宽度；窄窗（≤ 600px）左右贴 Composer 内边界。`initial` 向下展开，可见高度限制约半个视口；`followup` 向上展开，最高 420px；内部滚动，不推动消息流。
- Function 与 Skill 都是紧凑单行：小图标 + 名称（Function 不带 `/` 前缀）+ 可选勾，description 右对齐、一行，空间不足先截断 description，command 必须完整可见（`compact` 用 `Asterisk`，`status` 用 `ChartPie`，`side` 用 GitFork）。active / hover / selected 用中性底色，模式语义色只出现在小图标或 mode chip。约 140ms 过渡，reduced motion 取消。

## 运行模式

- 主会话用同一个 `actspace.main` 形态，提供 Agent、Plan、Chat 三种模式；空闲时可从 `+` 菜单切换（已有消息不阻止）。新会话默认 Agent，默认态不显示 chip。
- 切换只影响下一次发送，不改变运行中的 Turn；流式期间模式控件与其他编辑控件一起禁用。模式按 Session 独立保存（`setSessionAgentMode` 校验 revision 并追加 `agent/mode-set` Journal 事件），切会话或重启后从投影恢复。用户消息文本不拼「[Plan mode]」之类前缀。
- Chat 切到 Plan / Agent 必须有工作区；缺失时先选工作区再写入模式。
- 模式是运行时硬边界，不是 placeholder 标签：profile 在工具注册 / 暴露阶段生效，Prompt 只负责行为指导。

| 模式 | 用户意图 | 工具 profile | 运行时硬边界 |
| --- | --- | --- | --- |
| `Chat` | 对话、联网、图片生成 | `web`、`generate_image` | 不暴露工作区文件、Bash、Browser、Subagent；隐藏工作区、Skills、权限入口 |
| `Plan` | 调查、分析、出计划 | 显式 allowlist | 可读文件（`read_file`、`grep`、`glob`、`list_directory`）、联网（`web_search`、`web_fetch`）、`inspect_image`、`explore`、`todo_read`、`todo_write`；禁止 Bash、文件写删、Browser、图片生成、通用 agent |
| `Agent` | 规划并执行 | `full` | 完整主 Agent 工具集，仍受设置页工具开关、provider 能力、工作区边界和审批约束 |

- Plan 用 allowlist 而不是排除已知写工具的 denylist，避免新工具自动泄露；实际暴露集 = allowlist ∩ 当前注册工具。Plan 的行为指导以独立 system prompt segment 注入：先理解目标与实现、有关键未知先提问、计划含目标 / 边界 / 关键决策 / 顺序 / 验证 / 风险、不得声称已编辑或已测试。
- Skill 是上下文指导不是权限包，不得绕过当前模式的工具 profile。

## 附件

入口按能力决定：本机 Agent / Plan 的 `+` 面板显示「图片」，Chat 或能接受文件的目标（远端）显示「图片与文件」（`Composer.tsx` 的 `acceptsFiles`）。

| 入口 | 可选类型 |
| --- | --- |
| 「图片」（`dialogs.selectImages`） | png、jpg、jpeg、webp、gif |
| 「图片与文件」本机 Chat（`dialogs.selectFiles`） | png、jpg、jpeg、webp、gif + txt、md、markdown、json、csv；不支持 PDF、DOC、DOCX |
| 「图片与文件」远端 | 任意文件（Host 端读取） |
| 剪贴板粘贴 | PNG、JPEG、WebP；main 校验签名后写入应用 `tmpRoot/composer-attachments`，单张最大 20MB |
| 拖放 | 图片按 MIME 与扩展名（含 bmp、svg、heic、heif）判为图片，其余为文件 |

- 点击「图片」立即关闭 `+` 面板再调起系统文件选择器；取消不产生附件、错误或空占位；重复路径去重。
- 预览：文件选择由 main 生成有界 `data:` 缩略图，拖放用当前 renderer 生命周期内的 `blob:`；禁止把 `file://` 交给 renderer，禁止把预览 Base64 持久化到 session 事件。发送边界剥离 `previewUrl`，Session Projection 在 main 从受信附件路径重新生成缩略图，源文件不可读时保留元数据并降级为空预览。
- 展示：附件位于 panel 内、输入框上方，有附件时进入多行。图片显示 48px 真实缩略图，点击在右侧打开 Image Tab（发送后的用户消息图片同样是可聚焦预览按钮），不新增模态层；文件附件只显示文件名。删除按钮约 18px 点击区、11px X，默认隐藏、hover / 键盘聚焦附件时出现，只移除 Composer 附件，不删原文件；切模式不清空附件。
- 「图片」表示把本地图片作为用户输入附件，不依赖 `generate_image` 设置。Composer 不因主模型是否原生支持图片而禁用发送：原生视觉模型收图片内容，文本模型收附件元数据并在模式与配置允许时调用 `inspect_image`，工具不可用时由模型如实说明，不得伪造视觉结论。
- 系统文件选择、preload IPC、本地预览和多模态请求的验收必须在真实 Electron 完成。

## Skills 页

复用设置页与主 Agent 已有的 Skill registry，不做推荐市场、远程安装或 Composer 内管理；它是 `+` 面板里的一页。

- 列表规则同 Slash 的 Skills；每项显示 name 与 description，不显示绝对路径、来源目录或卸载操作；加载中、空列表、IPC 失败（简短错误 + 重试）、无匹配各有一行说明，不伪造样例。
- 多选：点击或 Enter 切换，面板不关；已选行用中性 selected 底色 + 勾选。已选 Skill 以可移除 pill 显示在输入区上方（与图片附件同层、文字型外观，可换行），删除按钮名为 `移除 {skillName}`。
- 绑定只表示当前 Composer 的显式上下文，不改设置页全局启停；在 initial / follow-up 切换中保持，不持久化，发送后不自动清空。
- 发送只传去重后的 `selectedSkills: string[]`，main 在当前 workspace registry 中按 name 重新解析，不接受 renderer 传路径；显式选中的 Skill 以独立 system prompt segment 注入 `SKILL.md` 正文，未选中的仍走「名称 + 描述 + location」目录。Skill 发送前被禁用、删除、遮蔽或不可读时本轮明确失败并指出 name，不静默忽略。

## 草稿与历史输入

- 未发送的文字和附件按 `sessionId` 隔离，存在 `SessionLocalStore`（`composerText`、`attachments`），进入设置页、切会话后返回都恢复自己的内容，附件不会带到别的会话。
- 图片预览 blob URL 在附件发送成功、被移除、被恢复草稿替换、所在会话被 evict（归档、删除、移除 Host 或工作区）时释放；离开会话页不释放。
- 草稿只在应用运行期间保留，不写 Journal；发送开始后清空；尚未持久化就发送失败则回填文字和附件，且必须校验原会话 ID，不得跨会话回填。
- 历史输入来自当前会话已持久化的用户文字，从旧到新；不恢复附件、模型、模式或 Skills。输入框为空时 `ArrowUp` 从最近一条向前浏览，`ArrowDown` 向后，越过最新一条恢复为空；非空文字和多行文字用 textarea 原生方向键；Slash 菜单打开时方向键归菜单；IME 组词期间不触发。

## 发送队列

回合运行中（含上下文压缩中）发送的消息进入输入框上方的托盘，当前运行结束后按顺序自动发出，每条一个新回合、不合并。实现：`composer/MessageQueueTray.tsx`，队列由 Host TaskLedger 按会话持久保存，Renderer 只投影状态。

- 托盘是 Composer 根节点的子元素（panel 之前、Review strip 之后），不在 panel 里，不随 panel 圆角和单行 / 多行变化；与 panel 同宽、间距 6px，`rounded-act-lg border-composer bg-surface`，无阴影；空队列不渲染。没有标题行，计数与发送时机（`N 条排队，当前运行结束后依次发送` / `即将发送` / `N 条已引导`）在第一行左侧图标的提示里。暂停时列表下多一行 `已暂停` + `继续发送`。最多露出 4 行（每行 36px），再多在托盘内滚动，不推动 panel。
- 排队行：单行摘要，左侧 `ListOrdered` 图标；右侧依次是附件 / 引用数量（`1 个文件 · 2 条引用`，窄窗隐藏）、`↳ 引导`、删除、`···`，三个动作平时 60% 不透明，hover 或键盘进入该行变实。`···` 只有 `编辑`（输入框为空才可用，把这条放回输入框并移出队列）和 `上移`；删除不二次确认。`/compact` 行用等宽字体标 `命令`，没有引导。已引导行排在最上方，行首绿色呼吸圆点，文本 muted，右侧 `下一步读取` + `撤回`。
- 发送按钮只有两种形态：有内容时是 ↑（运行中点击或 Enter 即加入队列，aria-label `加入队列`）；运行中且输入为空是 ■ 停止（压缩中置灰，提示 `压缩完成后可继续`）。
- `↳ 引导` 把该 Task 指定给当前 Run，Host 在下一步边界交付，模型下一步开始时读到（正写最后回复时回合多跑一步）；被领取后以普通用户消息出现在当前回合对应位置，不加标记并从托盘移除。没有运行中回合不显示；压缩中、等待审批显示但禁用并悬停说明。`撤回` 或回合结束时未被读到的引导回到队首；引导被拒（附件 / 引用失效）回到队首并在 Composer 顶部提示原因。
- 回合停止、失败或发送被拒后队列暂停，不自动发出，点 `继续发送` 显式恢复。例外：暂停时没有运行中回合、队列里也没有停止前遗留消息，则新消息由 Host 接收时同时解除暂停并立即执行（fork 会话首次发送同理）；有遗留消息时新消息排队尾，整条队列保持暂停。Client Reload 不重复提交；Host 重启后队列需手动继续。Web 与 Desktop 语义相同。
- 一轮步数打满（`turn/end` 的 `reason` 为 `step-limit`）的轮尾提示见 [front-轮尾与导航规范.md](front-轮尾与导航规范.md)；该情况在 Run 层记为 failed，但不再使队列暂停。

## 状态行统计胶囊

实现：`composer/ComposerStatsPills.tsx`、`composer-stats.ts`；模型侧计时在宿主投影 `packages/session/session-projection/src/facts.ts`。follow-up 状态行右侧、context 圆环左边有两个整会话累计的胶囊：

| 胶囊 | 文字 | 不显示 | 只读（span） | 面板 |
| --- | --- | --- | --- | --- |
| 会话统计（`Gauge`） | `N 轮 M 步 · 43 tok/s` | 还没有任何一步 | 模型用时、工具用时、TTFT 步数都为 0 且没有输出速度 | 「会话统计」：模型用时 / 工具调用用时 / 首 token 平均（TTFT）/ 输出速度（TPS），有值才出行 |
| 会话累计消耗（`Database`） | `累计 12.2K tok · 缓存命中 80%` | 计费输入和输出都为 0 | — | 「会话累计消耗」：标题值为精确总量，标题下一行说明口径（每次请求的输入含缓存加输出之和，每步都会重发上下文，所以远大于当前窗口占用）；缓存命中 / 未缓存输入 / 缓存读取 / 缓存写入（非 0 才出行）/ 输出 |

- context 圆环悬停提示「当前上下文窗口占用 ≈32.4K / 1M（估算）」，与「累计」胶囊是两个口径，文案上要能分开。
- 计费输入 = 未缓存输入 + 缓存读 + 缓存写；缓存命中 = 缓存读 ÷（未缓存输入 + 缓存读 + 缓存写），不把「差一点全命中」舍成 100%；输出速度 = 总输出 token ÷ 总解码时长。
- 胶囊是状态行里的纯文字入口（原生 `<button>`，和 context 圆环一致），hover 或展开给 hover 底色；面板是 `ui/Popover`，在胶囊上方右对齐，宽 300–440px。
- 数据全部取自宿主投影，不读 renderer 事件窗口：轮次、步数、Token 来自 `activity` / `usage`；模型用时、TTFT、输出速度来自 `activity.timing`（`sessionStats` 投影扫全量 journal 含 `assistant/chunk`）；工具用时来自全量 `tools` 投影。模型用时按每次请求 request/header 到 assistant/message 或 llm/retry 累加，含失败尝试、不含重试等待。

## Context 弹窗

点击状态行右侧 context 用量入口弹出（`components/ContextPopup.tsx`）：总占用与百分比、分段占用条，以及各分段明细 —— 系统提示词、工具、规则、Skills、会话摘要、会话内容（`context-labels.ts`）；「查看完整上下文」进入右侧 Context 面板。已用部分用分段色，未用部分用低对比 `--act-color-meter-track`，不让深灰轨道与数据争夺注意力。偏统计感，不做编辑。

## 不做

- 不做第四种 Debug / Multitask 模式；不做 MCP 发现、配置或占位 UI。
- 不在 Composer 里安装、卸载、启停 Skill（仍属 Settings > Skills）。
- Plan 不新建独立 Agent loop、可编辑 Plan Document、任务状态机或「批准计划后自动执行」链路，只复用主 loop 并收紧 profile。
- 不在这里新建模型选择器、通用文件管理器或 Skill marketplace。
