# Composer Slash Command 设计规范

## 状态

- 阶段：V1 已实现；自动化与浏览器 Renderer 验证完成，Electron 真实验收待用户执行。
- 日期：2026-07-30。
- 母规范：`docs/design-docs/frontend/front-聊天输入框规范.md`。

## 定位

Slash Command 是 Composer 内的键盘优先能力入口。用户在空白输入框中输入 `/` 后，可以搜索并选择当前 Composer 已经具备的产品功能与 Skills，而不需要离开输入区域或记住隐藏命令。

它不建立第二套 Agent 能力系统，也不把所有产品导航塞进输入框。第一版只解决三个问题：

1. 让已经存在的 `/compact`、`/eval`、Chat / Plan / Agent、Context 和 Review 能力可发现。
2. 让当前 workspace 的可用 Skills 可以通过键盘快速绑定。
3. 让 `/` 与 `+` 复用同一套行为和 Skill registry，避免两个入口产生不同状态。

核心原则：

> `+` 服务鼠标发现与附件操作，`/` 服务键盘搜索与快速调用；两者共享能力，不追求菜单内容完全相同。

## 产品目标

- 用户输入一个 `/` 即可看到当前会话最相关的功能和 Skills。
- 菜单只保留 `Functions` 与 `Skills` 两个一级分组，不增加 Commands、Modes、Tools、Context 等更多分类。
- 功能项必须对应真实行为，不展示占位、未实现或仅供未来使用的命令。
- Skill 选择继续复用现有显式绑定语义：选中后显示可移除 pill，并在发送时按 Skill name 由 main 重新解析。
- 默认界面保持克制；用户不输入 `/` 时不增加新的常驻按钮、标签或提示条。

## V1 信息架构

### Functions

Functions 使用固定顺序，不按字母排序。当前模式项显示勾选，但 selected 仍使用中性底色，不用大面积语义色。

| 命令 | 菜单名称 | 行为 | 选择后的输入框 |
| --- | --- | --- | --- |
| `/chat` | Chat mode | 调用现有 `onModeChange("chat")`，切换为无工具对话模式 | 清除 Slash 查询并恢复焦点 |
| `/plan` | Plan mode | 调用现有 `onModeChange("plan")`，切换为只读计划模式 | 清除 Slash 查询并恢复焦点 |
| `/agent` | Agent mode | 调用现有 `onModeChange("agent")`，恢复完整 Agent 模式 | 清除 Slash 查询并恢复焦点 |
| `/compact` | Compact context | 复用现有 `/compact` 发送链，立即发起上下文压缩 | 清除 Slash 查询；不消费已选 Skill 和已有附件 |
| `/eval` | Capture failed turn | 把输入框替换为 `/eval `，让用户补充失败说明后再发送 | 保留尾部空格并恢复焦点 |
| `/status` | Context status | 调用现有 `onExpandContext`，打开 Context 视图 | 清除 Slash 查询并恢复焦点 |
| `/review` | Review changes | 调用现有 `onOpenReview`，打开 Review 视图 | 清除 Slash 查询并恢复焦点 |

选择 `/compact` 是一次明确的立即操作。它只发送命令本身与当前模型运行选项，不把图片、普通文件或 Skill 正文当作压缩命令输入；Composer 中已经附加的内容保持原样，供用户后续正常发送。

选择 `/eval` 不立即执行，因为失败说明会直接影响 Candidate 的可读性和后续评估价值。用户仍可删除说明并发送裸 `/eval`，沿用当前允许无 `reason` 的行为。

### Skills

- 数据来源继续使用 `window.actspace.listSkills({ workspaceRoot })`，不新增 IPC、远端市场或推荐列表。
- 只展示 `enabledForAgent=true`、`shadowed=false`、`status=available` 的 Skill。
- 项目级 Skill 排在用户级 Skill 之前，同一 scope 内按 name 升序。
- 搜索匹配 Skill 的 name 和 description，大小写不敏感。
- 已绑定 Skill 显示勾选和 `aria-selected=true`。
- 点击或按 Enter 选择 Skill 后，切换该 Skill 的绑定状态、清除 Slash 查询、关闭菜单并恢复输入焦点。
- Skill 的选中、移除、发送契约与 `+ > Skills` 完全一致；Slash 菜单不负责安装、卸载、启用或禁用 Skill。

## 触发与查询规则

- 仅当 Composer 可编辑、未处于 streaming 状态，且当前完整草稿匹配 `^/[^/\s]*$` 时打开菜单。
- `/` 必须是草稿的第一个字符。普通句子、URL、包含后续 `/` 的绝对路径和代码中的 `/` 不触发菜单。
- `/` 后允许任意不含空白的搜索字符，兼容英文 command、Skill name 和中文关键词；过滤按当前 `/` 后的完整字符串进行。
- 输入空格、换行或形成普通文本后关闭菜单；例如 `/eval ` 进入参数输入态，不继续显示命令列表。
- 粘贴 `/compact`、`/status` 等完整命令时也应打开并定位到精确匹配项。
- `Escape` 只关闭当前弹层，不删除已经输入的 `/query`。
- 点击 Composer 外部关闭菜单；再次改变 Slash 查询时允许重新打开。
- 无匹配结果时显示紧凑空态 `No matching functions or Skills`，不伪造建议项。

## 搜索与排序

- 空查询时完整显示 `Functions`，下方显示 `Skills`。
- 有查询时同时过滤两个分组；没有结果的分组不显示标题。
- Function 匹配 command、label 和 description，精确 command 前缀优先，其余保持固定产品顺序。
- Skill 匹配 name 和 description，保持项目级优先、scope 内 name 升序。
- Function 不因为 Skill 加载中或加载失败而不可用。

## Skill 加载状态

- Slash 菜单首次打开时按当前 workspace 懒加载 Skills；同一 workspace 复用当前 Composer 已有缓存。
- 加载中只在 `Skills` 分组显示紧凑 loading indicator，Functions 仍可操作。
- 空列表显示 `No enabled Skills`。
- IPC 不可用或加载失败时显示 `Skills unavailable` 与 `Retry`；失败不关闭菜单，也不影响 Functions。
- workspace 改变后使旧缓存失效，并按新 workspace 重新加载。

## 选择与执行语义

Slash 菜单中的项目分成三种行为，但视觉上仍只属于 `Functions` 或 `Skills` 两组：

1. 状态切换：Chat / Plan / Agent，立即调用现有模式回调。
2. 产品动作：Compact / Context / Review，立即复用现有动作链。
3. 输入补全：Eval，把完整命令前缀写回 Composer，等待用户补充并发送。

菜单层不得直接访问文件系统、Skill 文件或 Agent Runtime。Renderer 只传递现有回调、Skill name 和已有命令文本；`/compact`、`/eval` 的真实执行仍由当前 App / IPC 链负责。

## 与 `+` 菜单的关系

| 能力 | `+` 菜单 | `/` 菜单 |
| --- | --- | --- |
| Chat / Plan | 保留 | 提供 Chat / Plan / Agent 搜索入口 |
| Image | 保留 | V1 不重复展示 |
| Skills | 保留二级菜单和多选 | 提供搜索后单次切换绑定 |
| Compact / Eval | 不展示 | 提供可发现入口 |
| Context / Review | 使用现有独立入口 | 提供键盘快捷入口 |
| Model / Reasoning | 使用 Composer 常驻模型入口 | V1 不重复展示 |
| New chat | 使用 Sidebar / Workspace 入口 | V1 不展示，避免草稿丢失语义进入本计划 |

两个菜单必须互斥，并与 model menu、model options、Context popup 保持现有互斥关系。打开 Slash 菜单时关闭其他浮层；通过 `+` 打开菜单时关闭 Slash 菜单。

## 键盘与输入法

- Textarea 始终保留真实输入焦点，用户可以继续输入过滤词。
- `ArrowDown` / `ArrowUp` 在当前可见结果中循环移动 active item。
- `Enter` 选择 active item，不发送普通消息。
- `Shift+Enter` 保留换行语义；产生换行后 Slash 菜单关闭。
- `Tab` 不被 Slash 菜单劫持，保留正常焦点移动；现有 `Shift+Tab` 切换 Plan 的行为不变。
- `Escape` 关闭菜单并保留焦点和草稿。
- 中文、日文等 IME 组合输入期间，`Enter` 不选择命令也不发送消息；继续沿用 `nativeEvent.isComposing` / `keyCode === 229` 防护。
- 鼠标 hover 只改变 active item，单击才执行。

## 可访问性

- Textarea 在 Slash 菜单打开时暴露 `aria-expanded`、`aria-controls` 与当前项 `aria-activedescendant`。
- 结果容器使用 `role="listbox"`，Function 和 Skill 行使用稳定 id 与 `role="option"`。
- 分组标题不进入键盘结果序列。
- 每个 Function 的可访问名称包含 label、command 和简短作用。
- Skill 的可访问名称包含 name、description 和当前是否已绑定。
- selected、active、disabled 不能只依赖颜色区分，必须同时使用勾选、图标、文本或 aria 状态。

## 视觉与布局

Slash 菜单延续 ActSpace Editor Design System 的 Ink & Emerald 方向，重点是紧凑、安静和快速扫描，而不是做成大型命令中心。

- 宽窗口：菜单锚定输入区域左侧，宽度约 `380px`，最大宽度不超过 Composer 可用宽度。
- initial surface 位于页面中部，菜单向下展开并把可见高度限制在约半个视口内，避免固定向上展开时越出窗口顶部。
- follow-up surface 位于消息区底部，菜单向上展开，最大高度 `420px`。
- 内容区内部滚动，不推动消息流或 Composer 布局。
- 窄窗口（不超过 `600px`）：左右贴 Composer 内边界，宽度使用可用空间，不创建横向二级菜单。
- 行高保持紧凑；Function 主行显示 label，command 作为弱化右侧文本，description 只在需要解释时显示一行。
- Skill 显示 name 与最多两行 description，不显示绝对路径、scope 路径或管理操作。
- active / hover / selected 使用 neutral surface；模式语义色只允许出现在小图标或已有 mode pill，不把菜单行整块染色。
- 普通 focus 使用高对比中性 ring；operational green 不用于普通 active item。
- 动画使用现有约 `140ms` opacity + translate / scale 过渡；`prefers-reduced-motion` 下取消。
- 颜色只消费现有主题语义 token，不新增 hex、`text-black`、`bg-white` 或其他非主题感知字面量。

## V1 不做

- 不做 Slash Command 自定义、排序、收藏、最近使用或使用频率统计。
- 不做插件、MCP、自动化、SubAgent、Pet、Side chat 或第三方命令入口。
- 不把 Model、Reasoning、Image、New chat 重复塞入 Slash 菜单。
- 不新增 Skill marketplace、推荐安装、远程搜索或 Composer 内管理能力。
- 不把所有功能抽象成跨进程通用 Command Registry；V1 只在 renderer 维护小型展示 catalog，并复用现有行为回调。
- 不改变 `/compact`、`/eval` 的 main / preload / Agent Core 协议。
- 不持久化菜单开关、active item、查询或最近选择。

## 验收基线

### 自动化

- Slash 查询解析、过滤、排序和空态有纯函数测试。
- Composer 测试覆盖打开、关闭、过滤、键盘导航、IME、防误发送和浮层互斥。
- 模式切换、Context、Review、Compact、Eval 与 Skill 绑定分别有行为测试。
- `/compact` 与 `/eval` 现有 App 路由测试继续通过，且 Slash 入口不创建普通 user message。
- 主题防回流检查通过。

### 浏览器 Renderer

- 验证 initial / follow-up、inline / stacked、普通宽度 / 480px 窄窗。
- 验证 Light / Dark 下默认、active、selected、loading、empty、error、disabled 状态。
- 验证菜单不会遮挡发送按钮，内部滚动不会带动消息区滚动。

### Electron 真实验证

- 验证真实 `window.actspace.listSkills` 加载、workspace 切换后的 Skill 刷新和 Retry。
- 验证 `/compact`、`/eval` 走真实 IPC，但不要求调用付费模型或真实 provider；可以使用已有可控测试环境或由用户手动验收真实 provider 行为。
- 自动化和浏览器 renderer 结果不能替代 Electron main / preload / IPC 验收。

## 已确认决策摘要

本规范建议第一版采用以下固定决策：

- 只有 `Functions` 与 `Skills` 两组。
- Functions 为 Chat、Plan、Agent、Compact、Eval、Context、Review。
- Model、Reasoning、Image、New chat 不进入 V1。
- `/` 与 `+` 复用行为和 Skill registry，但不要求菜单内容完全一致。
- Compact 立即执行；Eval 进入参数补全；Skill 选择切换绑定并返回输入。
