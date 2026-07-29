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
- 左侧 `+` command menu，用于添加 agents、context、tools、附件和其他能力入口。
- `Review / overflow` 操作层。
- 模型按钮下拉。
- 附件入口。
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
- Slash Command 在发送前由 renderer 分流：`/compact` 触发上下文压缩，`/eval [失败说明]` 触发最近失败 Turn 的回归 Candidate 生成；命令文本不作为普通用户消息显示。

## Composer 形态

### Ink & Emerald 视觉职责

- Composer 使用主题 `surface` 和 1px 中性 hairline，不使用蓝色描边或蓝色光晕建立默认层级。
- 发送按钮继续使用主题反色的 ink action：浅色近黑底、深色近白底，不改成绿色 CTA。
- 运行 / 停止状态可以使用小型 operational 绿点、细环或中性停止控件。
- Context usage、branch、This Mac / Worktree 等状态行默认使用 muted / faint 灰阶。
- operational green 只表示运行、连接或确认，不用于模型选择、附件、普通 `+` 按钮或菜单选中。

Composer 有 `surface`（`followup` / `initial`）一个外部维度，内部布局按内容高度**动态切换**（2026-07-05 定稿）：

- **inline（单行）**：follow-up 默认态。`+` 左侧、输入框居中占满、右侧模型选择 + 发送按钮，全部同一行，低高度。
- **stacked（两行）**：输入框全宽在上，控件行贴底（左 `+` 和模型选择，右发送 / 停止）。

切换规则：

- 判定依据是**inline 可用宽度下的渲染高度**（`scrollHeight` 超过单行阈值），不是有没有 `\n`——长文本自动折行也会触发；删回一行自动切回 inline。不允许用 stacked 全宽输入框的高度反向决定是否切回 inline，否则宽度变化会造成误判和内容裁切。
- 附件存在、`initial` surface 强制 stacked。
- **实现约束：切换不允许 remount textarea**。inline / stacked 是同一个 grid 容器切换 `grid-template-areas`，textarea / `+` / 模型 / 发送四个元素 DOM 结构不变，正在打字时切换不丢焦点和光标。toolbar 分组用 `display: contents` 保留 aria 语义。
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
- 窗口不超过 `600px` 时，即使输入内容仍是单行，也强制使用 stacked grid：输入占第一行，`+ / model / send` 位于第二行；Composer 两侧留白收敛为 `18px`，模型标签继续截断而不挤压发送按钮。
- initial composer 的 workspace / branch / runtime 选择行在窄窗允许横向滚动，不把三个入口压成不可读窄条。

| surface | 布局 | 结构 |
| --- | --- | --- |
| `followup` 单行 | inline | Review strip → panel 内 `+ / input / model / send` 同行 → status row |
| `followup` 多行或有附件 | stacked | Review strip → panel 内 `attachments? / input` 全宽 / `+ model … send` 贴底 → status row |
| `initial` | stacked | selector row → panel 内 `attachments? / input` 全宽 / `+ model … send` 贴底 → Plan New Idea |

首条消息发送后，ConversationView 进入消息流状态，并显示底部 followup composer。

## Initial composer 结构

创建新会话时，Composer 位于消息区中部，包含三层：

1. 上下文选择行：`actspace-agent` workspace、`main` branch、`This Mac` runtime，三者都是下拉入口；非 Git Workspace 隐藏 branch，Worktree 细节见 `front-workspace-git-worktree-context.md`。
2. 输入 panel：输入框在面板上半部；底部 toolbar 包含左侧 `+`、紧跟其后的 `Auto` 模型入口和发送按钮。
3. 快捷 chip：`Plan New Idea`。

Initial composer 不显示 follow-up 的 Review strip，也不显示底部 branch/local/context usage 状态行。

## Follow-up bar 结构

从上到下分三层：

1. Review 操作层：位于输入栏上方，Git workspace 存在未提交改动时显示真实 `Review +N -M` 汇总和 `...`；无改动时不显示 Review 入口；当前 workspace 不是 Git repository 时显示无计数的 `Review` 入口，引导用户到右侧 Review 面板初始化 Git。
2. 输入面板：输入框全宽在上；底部控件行左侧为 `+` 与模型选择，右侧为发送 / 停止按钮。
3. 状态行：左侧显示真实 branch 与 `This Mac` / `Worktree`，右侧显示 context usage 百分比或等价统计入口，也是打开 Context 弹窗的唯一入口。

### `+` command menu

点击左侧 `+` 打开菜单。菜单第一版可以先展示 demo 结构：

- 顶部弱提示：`Add agents, context, tools.`
- 常用 mode：Plan、Debug、Multitask、Ask。
- 能力入口：Image、Models、Skills、MCP Servers。

该菜单的语义是“添加能力 / 上下文 / 工具”，不等同于单纯附件按钮。真实附件选择仍由附件计划接入，当前 Composer 计划只保证入口位置、浮层样式和窄窗口布局稳定。

### Review / overflow 操作层

输入栏上方的轻量 action strip 用于进入 Review：

- 左侧 Review 按钮由 Git Review summary 驱动：有未提交改动时显示 `Review +N -M`。
- 无 Git repository 时显示无计数的 `Review`，点击打开右侧 Review 空态。
- 无未提交改动时不显示 Review strip，避免 Composer 常驻无效操作。
- SubAgent transcript panel 打开期间不显示 Review strip，优先保证当前 panel 和 follow-up 输入的视觉关系；关闭 panel 后恢复。
- 右侧或相邻 overflow `...` 保留位置，后续接入更多 Review / Git 操作。

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
