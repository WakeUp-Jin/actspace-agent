# 左侧会话栏规范

> 2026-09-09 文案更新：日常界面展示名称以[中文文案规范](front-desktop-chinese-ui.md)为准；保留 Chat、Plan、Thinking、Effort 和工具执行展示。本文英文名称仍可用于指代内部概念，协议与行为不变。

## 定位

左侧会话栏是 actspace 桌面端工作台的左侧栏，负责：

- 入口聚合：聊天态新建（New Agent）以及扩展入口，外加顶栏窗口控件。
- 会话导航：让用户在大量历史会话之间快速切换。
- Workspace 操作：围绕已加入侧边栏的本地文件夹，提供打开 IDE、批量归档和从侧边栏移除等轻量管理能力。
- 状态指示：把当前选中、运行中 turn、待审批和失败等状态集中显示在行首状态点。
- 全局设置入口：底部 Settings。

它属于聊天态工作台的可调面板区域，宽度和折叠规则见 `工作台布局与面板交互规范.md`。

## 信息架构

自上而下分四块：

1. **顶部窗口区**（红绿灯 + 折叠按钮 + 会话历史返回/前进）。
2. **顶部主入口**：`New Agent` / `扩展`。
3. **分区列表**：`已置顶` → `工作区`（按工作区分组时）或 `会话`（单列表、按时间时）。分组、排序和归档筛选由标题上的「视图选项」决定，见下文。当前没有定时任务产品能力，因此不展示 `Scheduled` 占位分区。
4. **底部** `Settings`。

## 顶部窗口区

- 自左到右：macOS 红绿灯（系统）、折叠按钮（PanelLeft icon），以及在 sidebar 顶部右侧对齐的会话历史 Back / Forward。PanelLeft 与导航按钮属于窗口级 chrome，不属于 sidebar 内部；会话搜索是「工作区 / 会话」标题上的放大镜图标。
- **chrome 按钮由 `WindowChromeBar` 渲染**（参考 Cursor Agent Window 的 `.part.titlebar`）。它是 `position: fixed top:0 left:0 right:0 height:44px z-index:60 pointer-events:none` 的全宽浮层，并使用与 `SplitView` 实际 pane 宽度同步的三列 grid：
  - `.chrome-left`：红绿灯安全区（`padding-left: 86px`）+ PanelLeft；会话 Back / Forward 作为同一左列内的右对齐导航组
  - `.chrome-center`：左对齐的当前 view 标题（chat 时是 session title；lab/usage/kairos 时是对应名）+ 中间栏尾部的 Environment + 窗口拖动区（`-webkit-app-region: drag`）
  - `.chrome-right`：右 panel 的对象菜单和 PanelRight toggle；空白区域不恢复 pointer events，避免遮挡右栏 Tab
- chrome bar 自身透明；主题感知底部分隔线只绘制在右侧对象面板列，左列与中间列不绘制底线；sidebar / main / right panel 三栏各自顶部留 `var(--window-chrome-strip-height) = 44px` 的 padding-top，让浮层覆盖到自己顶部时不挡内容，视觉上「三栏直接贯顶 + 标题与操作各归其位」。
- 折叠按钮在 `expanded ↔ hidden` 之间切换；hidden 态时它的 aria-label 变成 `Expand session sidebar`，`aria-pressed=false`。
- 顶部不再放搜索按钮；会话搜索只在「工作区 / 会话」标题上的放大镜图标里（2026-10-15 起不再有单独一行「搜索本机会话」）。
- Back / Forward 只遍历本次 Workbench 已访问的会话历史，不修改 Session Journal；没有对应历史时禁用。切换到新会话后会截断当前位置之后的前进历史。
- 不再有 main pane 自管的 `.topbar`，所有窗口级 chrome 元素都统一挂在 chrome bar 上。

## 顶部主入口

- `New Agent`：替代原 `New chat`，承担"开启一次新的 Agent 任务"语义；展示快捷键 `⌘N`。
- `扩展`：管理能力、Skills 与 MCP，保留会话侧栏；Usage 位于设置中心的「活动」分组。
- 两个入口共用同一组 hover / active 状态语言；当前 view 视为 active。
- Kairos 与 Lab 不属于当前公开导航。

## 分区列表

### 分组标题统一规范

> 2026-10-15 侧栏改版（DSH + Cursor + Codex 时间分组，方案见 [sidebar-redesign-demo.html（已迁出）](../retired-html-demos.md)）。实现：`components/sidebar/SidebarSessions.tsx` 编排，`SidebarSectionHeader.tsx` 画标题。

`已置顶`、`工作区 / 会话` 和按时间分组的时间段标题共用 `SidebarSectionHeader`：

- 标题文字 **12px / weight 500 / faint**，靠字号小一档 + 颜色更浅区分「导航主入口」和「分组标题」，不用非标字重（见 [全局视觉语言规范](./front-全局视觉语言规范.md)「字重与行高」）。
- 点标题文字折叠 / 展开；文字右边一个 12px `ChevronDown`，展开时隐藏、悬停或键盘聚焦标题行时淡入，收起时转到朝右并常亮（Cursor）。
- 「工作区 / 会话」标题右侧常驻三个图标：搜索、视图选项、添加工作区（DSH）。视图被改过时视图图标着强调色、右上角一个强调色小圆点，提示名改为「视图选项（已改动）」。
- 折叠状态（分区、每个工作区、每个时间段）持久化在 `localStorage` 的 `actspace.sidebar.view.v1`，重启后保留；「恢复默认」不清折叠状态。

### 搜索

- 点放大镜，搜索框从图标位置向左展开盖住整个标题行，自动聚焦；`Esc` 或 ✕ 关闭；输入为空时点别处也关闭，有内容时保留。
- 有输入时搜索结果替换下面的列表，已置顶分区也隐藏；结果行与普通会话行一样（状态点、工作区名、相对时间、悬停操作），点开即切换会话。
- 搜索走 `sessions.listPage({ search })`（输入停 250ms 再查，每页 50 条，翻页替换当前页），不依赖侧栏已加载的会话；索引不可用时提示「查询索引暂不可用，已从会话文件读取」；没有结果显示「没有匹配的本机会话」。
- 设置页（快捷键设置）里仍用独立的 `SessionSearch` 组件，两者共用 `use-session-search.ts`。

### 视图选项

视图选项菜单（`SidebarViewMenu`）三组单选 + 恢复默认，选一项菜单不关，方便连着改（DSH）：

| 分组方式 | 说明 |
| --- | --- |
| 按工作区（默认） | 每个工作区一个可折叠文件夹，标题叫「工作区」 |
| 单列表 | 未置顶的会话排成一列，每行标工作区名，标题叫「会话」 |
| 按时间 | 见下文「按时间分组」，标题叫「会话」 |

| 排序方式 | 说明 |
| --- | --- |
| 最近更新（默认） | 按 `updatedAt` 倒序，有新消息的会话自己浮到上面 |
| 手动排序 | 用户拖出来的顺序；新会话出现在最上面，已归档的永远在最后。按时间分组时不可用（灰掉，提示「按时间时不可用」） |

| 筛选会话 | 说明 |
| --- | --- |
| 隐藏已归档（默认） | 和以前一样 |
| 全部对话（显示已归档） | 已归档会话回到各自工作区，排在最后，行尾显示「已归档」 |
| 仅显示已归档 | 只显示已归档会话、隐藏已置顶分区；没有时显示「暂无已归档会话」和「查看其他会话」（切回隐藏已归档） |

- 「恢复默认」把三项恢复成按工作区 / 最近更新 / 隐藏已归档，并清掉手动顺序。
- 手动顺序按「账本」分别记：每个工作区的会话、置顶区、单列表，以及工作区之间的顺序；存在同一个 `localStorage` 键里，每个账本最多 1000 个 id。工作区顺序只存在本机，不写 `workspaces.json`。
- 已归档会话 `listPage` 不返回，筛选不是「隐藏」时才用 `sessions.list({ archived: true })` 一次全量拉取；只放进还在侧栏里的工作区（远端会话或已登记的工作区），已移除的工作区不会因此重新出现。

### 拖拽排序

- 能拖的和 DSH 一样：同一工作区内的会话、置顶区内的会话、单列表里的会话、工作区文件夹之间。不能跨账本拖（不能把会话拖到另一个工作区或拖进置顶），不合法的位置显示浏览器的「禁止」光标。
- 插入位置是行上沿或下沿一条 2px 强调色线，左端一个圆点；被拖的行半透明。按时间分组、搜索结果和已归档的行不能拖，重命名中的行也不能拖。
- 在「最近更新」下拖一次：先把当前看到的顺序拍下来作为各账本起点，再切到手动排序，标题下出现约 3 秒的「已切换为手动排序」提示（`role="status"`）。
- 用原生 HTML5 拖拽（`use-sidebar-drag.ts`），不挂 document 级监听。

### Pinned

- 跨 Workspace 的顶层固定分区。
- 用户可手动 pin/unpin 任意会话。
- 至少有一个会话被 pin 时出现，没有则该 section 隐藏；搜索时和「仅显示已归档」时隐藏。所有分组方式下都在最上面。
- 不按工作区分组时置顶会话的行也标工作区名。置顶区内不折叠（不限 5 条），手动排序时可拖。
- 悬停操作里置顶会话显示「取消置顶会话」（`PinOff`），未置顶显示「置顶会话」（`Pin`）。

### Workspaces

- **「工作区」是一层父级分类标题**，下面挂多个 Workspace 文件夹；父级本身可折叠（默认展开，状态持久化）。
- 父级标题右侧常驻搜索、视图选项、添加工作区三个按钮（见上文）。
- 单个 Workspace 按会话创建时记录的 `workspaceRoot` 自动归类，分组名 = 登记的名称，其次 `path.basename(workspaceRoot)`。
- 本地会话既没有 `workspaceRoot`、也匹配不到已登记的 Workspace 时不显示（旧版「默认工作区」遗留会话），不再有兜底分组。
- 每个 Workspace 文件夹行的交互：
  - 行高 30px，grid `[icon-slot 16px | name 1fr | actions auto]`，padding-left 与会话行一致，文件夹名的 X 位置等于下方会话标题的 X 位置。
  - **左侧 icon-slot**：默认显示文件夹图标（展开 `FolderOpen`、收起 `Folder`；当前会话在这个工作区里时用强调色）；悬停整行时文件夹淡出、`ChevronDown` 淡入叠在同一格，收起时箭头转到朝右（Cursor）。点击折叠，不进 Tab 顺序。
  - **中间文件夹名**：点击折叠 / 展开（`aria-expanded`），`title` 是完整路径；`Shift+F10` / Context Menu 键打开 Workspace 操作菜单。
  - **右侧 actions** 悬停整行时出现：`⋯`（「更多操作：名称」，打开和右键相同的 Workspace 操作菜单）和 `+`（在该工作区新建 Agent 会话）。
  - 右键文件夹行打开同一份菜单，菜单项和禁用状态一致。手动排序时文件夹行可拖动调整工作区顺序。
- 每组先显示 **5** 条，运行中、待审批和当前会话不占名额且总是显示；其余用「展开其余 N 个会话」展开（剩不到 7 条一次展开完，否则每次 5 条），展开过后显示「收起」。已加载的都显示完而服务端还有更多时显示「加载更多会话」。
- 没有会话的工作区显示「暂无会话」。
- 当前仍不支持重命名工作区、把会话拖到另一个工作区；文件夹来源仍是用户选择的本地目录。

### 按时间分组

- 照 Codex：最上面「需要处理」（warning 色标题 + 数量胶囊）收待审批、失败、跑完未看的会话，其余按 `updatedAt` 落进：今天、昨天、近 7 天按星期（标题旁写「10月13日」）、本月更早、今年按月（「9月」）、往年按年月（「2025年3月」）。
- 每个时间段可折叠（状态持久化），段内不限条数，每行标工作区名；置顶会话仍在已置顶分区，不进时间段。
- 服务端还有未加载的会话时，列表最后统一「加载更多会话」（各工作区分组都翻一页）。单列表同理。

### Workspace 操作菜单

- 菜单使用 renderer 内的主题感知浮层，与会话右键菜单共享圆角、边框、阴影、字号和 focus 语言；不使用与应用主题脱节的纯白原生菜单。
- 菜单默认在文件夹名称的右下方展开，窗口空间不足时由 collision 逻辑翻转或偏移，不能被 sidebar 的 `overflow` 裁切。
- 菜单顺序固定为：
  1. `Open in IDE`
  2. `Archive All`
  3. separator
  4. `Remove from Sidebar`
- 图标只做识别增强，文字始终保留；`Remove from Sidebar` 使用 danger 文字语义，但不使用大面积红色背景。
- 支持鼠标、`Enter` / `Space` 打开，菜单内支持方向键、`Enter` 执行和 `Escape` 关闭；关闭后 focus 回到 Workspace 名称按钮。
- 菜单打开时，文件夹行保留 hover/active 底色，避免浮层和触发对象之间失去视觉关联。

#### Open in IDE

- 第一版的 IDE 目标是 Cursor；对用户保留更稳定的 `Open in IDE` 文案，便于未来接入默认 IDE 设置。
- renderer 只传 `workspaceId`；Electron main 必须从 Workspace registry 重新解析路径，校验条目未隐藏、目录存在且是 directory，不接受 renderer 传入的任意绝对路径。
- macOS 通过受控子进程以 Cursor 打开整个 Workspace 目录，而不是某个会话文件或 session 存储目录。
- IDE 不存在、目录已被移动/删除或打开失败时，保持 Workspace 和会话数据不变，并给出非阻塞失败反馈。

#### Archive All

- 作用对象是点击菜单时该 Workspace 下的**全部未归档会话快照**；不删除本地 Workspace 文件，不移除 Workspace registry 条目。
- 归档是可恢复操作，可在 Settings 的 Archived Chats 中逐条恢复，因此默认不再弹二次确认。
- Workspace 没有未归档会话时禁用该菜单项。
- 任一目标会话处于 `running` 或 `waiting_approval` 时禁用 `Archive All`，禁用原因必须可见，避免把正在执行或等待用户决策的任务从导航中隐藏。
- 如果当前 active session 在快照中：
  - 优先切换到另一个 Workspace 的最近未归档会话，然后执行批量归档。
  - 如果不存在可切换会话，回到该 Workspace 的新建会话页（草稿，不创建空会话），首条消息发送时才创建会话。
- 批量操作完成后只刷新一次 session list 和 Workspace 分组，不在每条会话归档时造成侧边栏连续跳动。
- 若发生部分失败，明确告知已归档/未归档数量，未成功条目保持可见；不把部分成功伪装成全部成功。

#### Remove from Sidebar

- 该操作只隐藏 Workspace 及其会话导航，**不删除本地文件、不删除 session、不改变 archived/pinned 状态**。
- 被隐藏 Workspace 的会话同时从 `Workspaces` 和跨 Workspace 的 `Pinned` 分区移出，否则用户仍会在侧边栏看到该文件夹的会话，与操作名不符。
- 所有 Workspace 都可以移除，包括首次启动自动创建的「默认工作区」；移除后不会再自动创建。
- 如果 active session 属于目标 Workspace，先切换到另一个可见 Workspace 的最近会话；没有可切换会话时，回到新建会话页（不创建空会话），工作区切到剩下按活跃度排第一的 Workspace。
- 全部 Workspace 都被移除后，新建会话页不能发送，发送按钮提示「请先选择工作区」，由用户在 Composer 里选择文件夹。
- Workspace registry 必须持久化 hidden 状态；后续读取 session meta 时不得因 `workspaceRoot` 仍存在而自动把已隐藏 Workspace 重新加回。
- 用户通过 `New folder` 重新选择同一绝对路径时，清除 hidden 状态并恢复该 Workspace；原会话、pin 与 archive 信息保留。
- 这一轮不新增隐藏 Workspace 管理页；「重新选择相同文件夹」是首版恢复入口。
- 当前实现边界：Workspace 操作失败和批量归档部分失败先写入 renderer/main 可观测日志；仓库尚无全局 toast 基础组件，不在本轮为单一菜单引入新的全局反馈系统。

## 会话行

- 行高 30px，grid 三段：`marker 16px | title 1fr | end auto`，gap 6px，不做卡片。
- 字号：标题 13px / 500，跑完未看的会话标题加粗；单列表、按时间、搜索结果和非工作区分组下的置顶区在标题后标工作区名（11px faint，最多占 34%）。
- 行尾平时显示中文相对时间（刚刚 / 5分钟 / 3小时 / 2天 / 2个月 / 1年）；待审批显示 warning 色「待审批」；已归档显示「已归档」标签。
- 悬停、键盘聚焦或右键菜单打开时，行尾文字让位给操作按钮（不预留空位）。双击标题重命名。
- Hover 时背景轻灰；当前选中态使用更深一点的浅灰底。

### 左侧 marker（唯一状态点）

- marker 列只渲染一个可点击的 `session-status-dot`，点击查看状态名称和说明。
- 空闲：不显示；运行中：operational 色转圈的圆环；待审批：warning 色呼吸点；失败：danger 色点；跑完未看（`unread`，「已完成」）：success 色点（DSH）。
- 「跑完未看」由 renderer 在后台会话的 `agent_run_finished` 时记下，打开该会话即清除；只存在内存里，重启不保留。当前会话不显示这个点。
- 已归档的行不显示状态。Pin 不覆盖状态点。

### 右侧 actions

- 悬停时依次是 **`⋯` 更多 → 归档 → 置顶 / 取消置顶**，都是 22×22 的 `IconButton`；`⋯` 打开和右键相同的会话菜单。
- 已归档的行是 **`⋯` → 取消归档**（`ArchiveRestore`），不显示置顶；右键菜单里同样把「归档」换成「取消归档」，「置顶」禁用。取消归档走 `archiveSession({ sessionId, archived: false })` 后刷新会话列表。
- 非当前会话点击归档会调用 `archiveSession({ sessionId, archived: true })`，先从 renderer 侧栏移除目标行，IPC 失败或异常时重新读取会话列表恢复。
- 当前 active session 不允许归档，按钮禁用，名称为「当前会话无法归档」。

### 右键菜单、Copy、Fork 与重命名

- 会话行支持右键上下文菜单，顺序为 **Pin / Unpin**、**Rename**、**Copy**、**Fork**、**Archive**。
- 右键菜单是 renderer 内的轻量浮层，不调用 Electron 原生菜单；原因是 Rename 需要直接切换当前 React 行内编辑状态。
- 菜单浮层使用 `bg-surface-raised` / `border-line` / `shadow-act-popover` / `text-text-main` 等主题 token，随浅色 / 深色主题翻转。
- **Copy** 使用向右展开的二级菜单，并同时支持 hover、click 与 keyboard focus：
  - `Copy ID` 复制稳定的 `sessionId`。
  - `Copy Transcript` 复制 Markdown 文本，只包含会话标题、User / Assistant 正文和用户附件名；不复制 Thinking、工具原始输出或 diff。
- **Fork** 从会话当前已持久化 head 创建独立分支。成功后自动打开新会话，源会话不变化；新标题使用 `<原标题> (fork)`。
- 运行中或等待审批的会话禁用 **Fork**，提示用户等待当前 turn 完成，避免复制不完整状态。
- 点击 **Rename** 后，当前会话标题位置进入原地输入态：
  - `Enter` 保存，`Esc` 取消，失焦保存。
  - 空标题不保存，回退原标题。
  - 输入框保持 13px / 500，与会话标题同密度，不把行撑成卡片。
- 菜单里的 **Archive** 遵守行尾 Archive 同一限制：当前 active session 禁用归档。

### Hover 信息卡

- 鼠标 hover 或键盘 focus 到会话主按钮时，延迟约 **350ms** 显示轻量 Tooltip，帮助用户确认被截断的会话名称和其所属文件夹。
- Tooltip 对所有会话可用，不以标题是否发生视觉截断作为触发条件，避免宽度测量和用户预期不一致。
- 内容严格保持两层：
  - 第一行：完整会话名称，`12px / 500 / text-text-main`。
  - 第二行：完整 `workspaceRoot` 绝对路径，`11px / 400 / text-text-muted`，允许换行和 `overflow-wrap:anywhere`。
- 不显示模型、Context 用量、repo/branch、更新时间或任何操作按钮；这里是导航辨识提示，不扩展成会话预览卡。
- 旧会话缺 `workspaceRoot` 时，按现有 Workspace 归组规则回退到 registry 中的 default path；如果仍无法解析，第二行显示 `Workspace path unavailable`。
- 浮层使用现有 Radix Tooltip Portal 和主题 token，默认出现在会话行右侧；宽度上限约 360px，通过 collision 逻辑避免超出窗口。
- 会话右键菜单打开、进入重命名输入态或会话已离开可见 sidebar 时，Tooltip 必须关闭。

## 扩展切换规则

- 顶部 New Agent 下方新增「扩展」，选中时使用中性高亮。
- 主区显示「能力 / Skills / MCP」，保留会话侧栏；窄窗选择入口后关闭侧栏覆盖层。
- 扩展态隐藏聊天右栏及其开关；返回聊天恢复原右栏状态和会话草稿。
- 原设置里的扩展与 Skills 已迁入此处；能力详情见 [设置中心规范](front-设置中心重构规范.md#66-扩展独立入口)。

## Settings 切换规则

- 底部 `Settings` 是页面级入口，不是弹窗入口。
- 点击后从聊天态切换到设置态，原侧边栏被设置导航替换。
- 切换规则与设置态布局见 `front-设置中心重构规范.md`。
- 不显示账号卡片、登录信息卡片或登出浮层。

## 面板状态

### 展开态（expanded）

- 宽度 200–360px，由用户在工作台 SplitView 中调整。
- 不展示 logo 或品牌 wordmark。
- 宽度变化不应让会话标题变成多行卡片，超长标题仍按紧凑导航处理。
- 会话列表保留可见的细滚动条，默认使用低对比 thumb、hover 时再增强；滚动条和右侧 1px SplitView 分隔线必须保持不同视觉层级。

### 隐藏态（hidden）

- 折叠按钮的第二态：整条 sidebar 从布局中消失，main content 横向占满。
- 红绿灯右侧的 `WindowChromeBar.chrome-left` 仍在窗口顶部浮层中，是重新展开的唯一入口。
- rail（窄边）模式已**退役**：之前 60px 的 icon-only 紧凑态不再保留；折叠按钮直接在 expanded / hidden 之间二选一，与 Cursor 行为一致。
- localStorage 中旧值 `leftMode: "rail"` 会在反序列化时映射成 `hidden`，避免破坏用户偏好。
- 拖拽左侧分隔条到 `LEFT_HIDE_SNAP_WIDTH`（148px）以下时，sidebar 自动 snap 到 hidden 态。

### 紧凑窗口覆盖态

- 窗口宽度不超过 `820px` 时，sidebar 不进入 SplitView 分栏，主聊天区始终占满窗口。
- chrome 左侧按钮在紧凑窗口中打开覆盖式 sidebar；面板最大宽度 `360px`，并至少给主区保留 `48px` 的可见边缘。
- 覆盖态不修改持久化的桌面 `leftMode / leftWidth`，窗口重新变宽后恢复原桌面偏好。
- 点击遮罩、再次点击 chrome 折叠按钮或按 `Escape` 都能关闭；打开右侧对象面板时会先关闭左侧覆盖层。

## 字体

字体栈与 Cursor 对齐，详细约定见 [全局视觉语言规范](./front-全局视觉语言规范.md) 的「字体栈」「字体特性」「字号阶梯」「字重与行高」四段。Sidebar 这里只列与本组件直接相关的字号字重表：

```css
--font-ui:
  -apple-system, BlinkMacSystemFont,
  "PingFang SC", "Hiragino Sans GB",
  "Segoe UI", "Microsoft YaHei",
  "Helvetica Neue", Arial, sans-serif;
```

- 不把 `"SF Pro Text"` 写在最前面，让 macOS 通过 `-apple-system` 自动选 San Francisco，与 Cursor `.monaco-workbench.mac:lang(zh-Hans)` 完全一致。
- **全局 `font-feature-settings: normal`**，**不再开 `cv11/ss01`**——之前开启这两个拉丁 stylistic set 会让英文字形偏离 macOS 系统 UI；body 仅保留 `-webkit-font-smoothing: antialiased`。
- 字号字重基准（以 sidebar 为例，对齐 Cursor IDE 的"中间档"密度）：
  - 主入口（New Agent / 扩展）：`13px / 500 / --color-text-muted`。
  - 会话标题：`13px / 500`。
  - 会话时间戳：`11px / --color-text-faint`。
  - 分组标题（Pinned / Workspaces 等）：`12px / 500 / --color-text-faint`。靠字号小一档 + 颜色更浅区分语义，而不是用 440 这种非标字重。
  - Workspace 文件夹名：`13px / 500`。
  - Settings：`13px / 500`。

## 后端契约

- `SessionMeta` 增加可选字段：
  - `workspaceRoot?: string`：创建会话时由主进程从 `BootstrapState.workspaceRoot` 注入。
  - `pinned?: boolean`：用户在前端 pin/unpin 时通过 IPC `session:pin` 更新。
- `archived?: boolean`：用户归档会话时通过 IPC `session:archive` 更新。
- `SessionListItem` 同步透出这些字段，让前端按 workspace 分组并标记 pinned / archived。
- `WorkspaceEntry` 增加可选 `hidden?: boolean`；该字段持久化在 `workspaces.json`，不因 session 反向合并自动清除。
- v2 Runtime 在创建 Session 时根据 Host 提供的 workspace context 写入 Journal header；列出时由 Runtime Projection 透出。
- 切换 pin 走 `pinSession({ sessionId, pinned })`，主进程经 AgentApplication 追加 `session/pinned-set` Journal 事件并刷新投影。
- 重命名走 `renameSession({ sessionId, title })`，主进程经 AgentApplication 追加 `session/title-set` Journal 事件并刷新投影。
- Fork 走 typed Runtime IPC；主进程拒绝 active turn，并调用 v2 Session store 创建独立 Journal 后返回完整 Session Projection。
- Copy ID 只使用列表已有 `sessionId`；Copy Transcript 对当前会话复用 renderer 消息，对其他会话按需读取完整 `SessionRecord`，再通过 shared formatter 过滤为 User / Assistant Markdown。
- 切换 archive 走 `archiveSession({ sessionId, archived })`，主进程经 AgentApplication 追加 `session/archived-set` Journal 事件；普通 `listSessions()` 默认只返回未归档会话，设置页通过 `listSessions({ archived: true })` 读取归档列表。
- `Archive All` 在 renderer 中先冻结 Workspace 当前 session id 快照并处理 active session 导航落点，再通过 main-owned 批量归档契约执行；返回值至少包含 `archivedSessionIds` 和 `failedSessionIds`。
- `Open in IDE` 走 main-owned Workspace IPC，输入只包含 `workspaceId`，main 根据 registry 解析并校验目录后打开 Cursor。
- `Remove from Sidebar` 走 main-owned Workspace visibility IPC，只更新 registry 的 `hidden`；当用户再次选择同一目录时，Workspace selection 逻辑必须复用原条目并将 `hidden` 置回 `false`。
- Workspace registry 的读取、reconciliation 和 visibility 更新属于同一个读改写事务，必须按 `dataRoot` 串行执行，并使用唯一临时文件原子替换，避免启动期并发 `workspace:list` 争用固定 `.tmp`。
- 会话 Tooltip 只消费 `SessionListItem.title` 和 Workspace 分组已解析的 `workspaceRoot`，不读取 `session.jsonl`，不发起 `session:get-preview`。

## 验收矩阵

- Workspace 文件夹：图标格和名称点击折叠，折叠状态重启保留；右键、`⋯`、`Shift+F10` / Context Menu 键打开菜单；右侧 `+` 只新建 Agent。
- 视图选项：三种分组、两种排序、三种归档筛选和恢复默认都生效并持久化；按时间时手动排序禁用；拖拽只在同一账本内，「最近更新」下拖动后切到手动排序并提示。
- 搜索：放大镜展开搜索框，结果替换列表，`Esc` 关闭后恢复原列表。
- 菜单：顺序、图标、separator、danger 文字、键盘方向键、Escape 回焦和窗口 collision 正常。
- `Open in IDE`：只打开 registry 对应目录；未注册、已隐藏、不存在和非目录目标都不启动外部程序。
- `Archive All`：包含 Pinned 会话；存在 running/waiting approval 会话时禁用；active session 有导航落点；部分失败保留未成功条目。
- `Remove from Sidebar`：同时移出 Workspaces/Pinned；所有 Workspace 都可移除；重启不回流；重新选择同路径恢复；全部移除后新建会话页提示「请先选择工作区」。
- 会话 Tooltip：所有行可 hover/focus，只显示完整标题与绝对路径；定位锚点使用完整会话行，使浮层左边缘与 Sidebar 右侧分割线保持 `8px` 间距，而不是贴着标题文字出现；右键菜单和重命名时关闭。
- 主题：浅色、深色和 system-dark 下不使用非主题感知颜色，focus/disabled/danger 状态可辨识。

## 设计原则

- 轻量优先：信息密度高、视觉装饰少，不做重卡片。
- 轻量管理：Workspace 来源仍是本地目录，侧边栏只暴露打开、归档和隐藏三个高频动作，加上拖拽排序；不在导航区引入重命名、迁移等重管理能力。
- 状态合并：行首一个点表达运行中、待审批、失败、跑完未看四种状态，按时间分组时后三种汇总到「需要处理」。
- 操作克制：顶部主入口只保留当前产品入口（扩展）和核心操作（New Agent）；退役或暂停的方向不占用公开入口。
- 干净但有个性：静止时像 DSH 一样只有标题和时间，个性放在微交互里（文件夹与箭头交叉淡入、搜索框展开、拖拽插入线），不靠常驻装饰（Cursor）。
- 折叠彻底：`hidden` 而非 `rail`，让 main content 真正占满，符合用户对"折叠"的直觉与 Cursor 行为一致；窗口顶部浮动的 chrome row 保证可逆。

## 会话浏览加载

列表和长会话的按需读取、真实分页、加载/重试状态与索引边界，见[会话浏览按需加载](front-progressive-session-loading.md)。
