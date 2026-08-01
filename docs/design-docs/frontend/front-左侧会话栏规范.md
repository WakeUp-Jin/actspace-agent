# 左侧会话栏规范

## 定位

左侧会话栏是 actspace 桌面端工作台的左侧栏，负责：

- 入口聚合：聊天态新建（New Agent）以及 Usage / Kairos 两个产品入口，外加顶栏窗口控件。Lab 方向暂停，不在公开导航中展示。
- 会话导航：让用户在大量历史会话之间快速切换。
- Workspace 操作：围绕已加入侧边栏的本地文件夹，提供打开 IDE、批量归档和从侧边栏移除等轻量管理能力。
- 状态指示：把当前选中、运行中 turn、待审批和失败等状态集中显示在行首状态点。
- 全局设置入口：底部 Settings。

它属于聊天态工作台的可调面板区域，宽度和折叠规则见 `工作台布局与面板交互规范.md`。

## 信息架构

自上而下分四块：

1. **顶部窗口区**（红绿灯 + 折叠按钮 + 搜索按钮）。
2. **顶部主入口**：`New Agent` / `Usage` / `Kairos`。
3. **分区列表**：`Pinned` → `Scheduled` → `Workspaces`（父分类 + 多个 Workspace 文件夹）。
4. **底部** `Settings`。

## 顶部窗口区

- 自左到右：macOS 红绿灯（系统）、折叠按钮（PanelLeft icon）、搜索按钮（Search icon）。这两个按钮放在窗口级 chrome 浮层的左段（`.chrome-left`），不属于 sidebar 内部。
- **chrome 按钮由 `WindowChromeBar` 渲染**（参考 Cursor Agent Window 的 `.part.titlebar`）。它是 `position: fixed top:0 left:0 right:0 height:44px z-index:60 pointer-events:none` 的全宽浮层，并使用与 `SplitView` 实际 pane 宽度同步的三列 grid：
  - `.chrome-left`：红绿灯安全区（`padding-left: 86px`）+ PanelLeft + Search
  - `.chrome-center`：左对齐的当前 view 标题（chat 时是 session title；lab/usage/kairos 时是对应名）+ 中间栏尾部的 IDE / Environment + 窗口拖动区（`-webkit-app-region: drag`）
  - `.chrome-right`：右 panel 的对象菜单和 PanelRight toggle；空白区域不恢复 pointer events，避免遮挡右栏 Tab
- chrome bar 自身透明，只绘制统一的主题感知底部分隔线；sidebar / main / right panel 三栏各自顶部留 `var(--window-chrome-strip-height) = 44px` 的 padding-top，让浮层覆盖到自己顶部时不挡内容，视觉上「三栏直接贯顶 + 标题与操作各归其位」。
- 折叠按钮在 `expanded ↔ hidden` 之间切换；hidden 态时它的 aria-label 变成 `Expand session sidebar`，`aria-pressed=false`。
- 搜索按钮是图标级别的"操作"按钮，不是导航项；点击触发全局会话/工作区搜索。搜索功能本身在首版可暂未实现，但入口必须保留。
- 不再有 main pane 自管的 `.topbar`，所有窗口级 chrome 元素都统一挂在 chrome bar 上。

## 顶部主入口

- `New Agent`：替代原 `New chat`，承担"开启一次新的 Agent 任务"语义；展示快捷键 `⌘N`。
- `Usage`：统计页占位（Coming soon），将承载 token / 成本聚合。具体设计见 `front-usage-statistics.md`。
- `Kairos`：时机引擎占位页（Coming soon）。Kairos 取自希腊语「合适的时刻」，将承载定时任务、事件触发、自主 Agent 的运行边界与节奏。
- 三个入口共用同一组 hover / active 状态语言；当前 view 视为 active。
- Lab 的原型和 renderer 代码作为历史设计资产保留，但暂不提供侧栏入口。

## 分区列表

### 分组标题统一规范

`Pinned` / `Scheduled` / `Workspaces` 共享同一个 `NavSectionHeader` 组件，行为统一：

- 标题文字字号 **12px / weight 500 / `--color-text-faint`**：
  - 字号比主入口（13px）小一档，颜色比主入口的 muted 弱一档（faint）。
  - **字重和会话行、主入口同样是 500**，靠"字号小一档 + 颜色更浅"区分"导航主入口"和"分组标题"两种语义，而不是用 440 这种非标字重做区分。早期版本曾用「主入口 520 / 分组标题 440」靠字重对比，已纠正，理由见 [全局视觉语言规范.md](./全局视觉语言规范.md) 的「字重与行高」段。
- 标题文字左对齐到 sidebar 内 padding-left 8px 起点；前面不再放任何 chevron / icon，文字本身就是分组的视觉锚点。
- 整个标题区都是点击命中区，点击切换该分组的 `collapsed` 状态。
- 右侧 `nav-section-actions` 默认全部隐藏，hover / focus 标题区时整体淡入：
  - `chevron`：固定排在 actions 区最右，hover 出现 → 视觉上表达"我可以折叠"，点击同样切换 `collapsed`。
  - 其它 extra actions（如 Scheduled 的 `More + New scheduled task`、Workspaces 的 `Sort + New folder`）按 section 注入，统一渲染在 chevron 左边。
- 折叠态下不渲染该 section 的内容；记忆只放组件内 `useState`，不持久化。

### Pinned

- 跨 Workspace 的顶层固定分区。
- 用户可手动 pin/unpin 任意会话。
- 至少有一个会话被 pin 时出现，没有则该 section 隐藏。
- Pinned 区会话 hover 时显示深色填充图钉（`<Pin fill="currentColor" />`），区别于未 pin 状态下的描边图钉；非 hover 时仍隐藏操作，让时间列成为唯一常显的行尾信息。

### Scheduled

- 顶层独立分区，用于定时运行相关会话。
- 首版可以只放占位条目，等真实定时任务功能落地再接通。
- 标题右侧提供"更多操作 / 新建定时任务"两个图标按钮（走统一的 `nav-section-actions` hover 显隐规则）。
- 占位行使用 `session-status-dot.is-muted` 灰点 marker，与正常 session 行保持视觉对齐。

### Workspaces

- **Workspaces 是一层父级分类标题**，下面挂多个 Workspace 文件夹；父级本身可折叠（默认展开）。
- 父级标题右侧 hover 时露出两个图标按钮：
  - Sort：排序占位（点击 noop，title 标 `coming soon`）。
  - New folder：新建工作区文件夹占位（点击 noop，title 标 `coming soon`）。
- 单个 Workspace 按会话创建时记录的 `workspaceRoot` 自动归类，分组名 = `path.basename(workspaceRoot)`。
- 旧会话缺 `workspaceRoot` 字段时归到 `Default workspace`。
- 每个 Workspace 文件夹行的交互：
  - 行内布局是 `grid: [icon-slot 14px | name 1fr | actions auto]`，padding-left 与会话行完全一致，因此 folder name 的 X 位置严格等于其下方 session title 的 X 位置（视觉上文字连成一条左对齐线）。
  - **左侧 icon-slot** 本身是一个 button：
    - 默认显示 `<Folder>` 图标，表达"这是一个工作区"。
    - hover 整行时 `<Folder>` 淡出、`<ChevronDown>` / `<ChevronRight>` 淡入覆盖在同一格子里，表达"我可以折叠"。
    - 只有点击 icon-slot 触发折叠/展开，不再让文件夹名称同时承担折叠语义。
  - **中间 folder name** 是 Workspace 主操作按钮：
    - 单击打开 Workspace 操作菜单，不直接折叠、不直接打开 IDE。
    - 右键文件夹行打开同一份菜单，菜单项和禁用状态必须一致。
    - `aria-haspopup="menu"`；菜单打开时设置 `aria-expanded="true"`。
  - **右侧 actions** 默认隐藏，hover 整行时露出 `<Plus>` 按钮，点击 = 在该 workspace 起一次新 Agent。
  - 这一轮交互的核心是把三条意图**空间正交化**：左 = 折叠（导航），中 = Workspace 菜单（管理），右 = 新建 Agent（创造），跟 Cursor 的视觉与肌肉记忆一致。
- 每个 Workspace 默认展开；超过 **8** 条会话用 `See more / See less` 折叠剩余项。
- 当前仍不支持重命名、拖拽排序或把会话拖到另一个 Workspace；文件夹来源仍是用户选择的本地目录。

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
  - 如果不存在可切换会话，先在原 Workspace 创建一个新空会话作为导航落点；该新会话不属于菜单打开时的快照，不被本次批量归档。
- 批量操作完成后只刷新一次 session list 和 Workspace 分组，不在每条会话归档时造成侧边栏连续跳动。
- 若发生部分失败，明确告知已归档/未归档数量，未成功条目保持可见；不把部分成功伪装成全部成功。

#### Remove from Sidebar

- 该操作只隐藏 Workspace 及其会话导航，**不删除本地文件、不删除 session、不改变 archived/pinned 状态**。
- 被隐藏 Workspace 的会话同时从 `Workspaces` 和跨 Workspace 的 `Pinned` 分区移出，否则用户仍会在侧边栏看到该文件夹的会话，与操作名不符。
- `Default workspace` 是应用的保底落点，不允许从侧边栏移除；其菜单中该项禁用并显示原因。
- 如果 active session 属于目标 Workspace，先切换到另一个可见 Workspace 的最近会话；没有可切换会话时，在 `Default workspace` 创建一个新空会话后再隐藏。
- Workspace registry 必须持久化 hidden 状态；后续读取 session meta 时不得因 `workspaceRoot` 仍存在而自动把已隐藏 Workspace 重新加回。
- 用户通过 `New folder` 重新选择同一绝对路径时，清除 hidden 状态并恢复该 Workspace；原会话、pin 与 archive 信息保留。
- 这一轮不新增隐藏 Workspace 管理页；「重新选择相同文件夹」是首版恢复入口。
- 当前实现边界：Workspace 操作失败和批量归档部分失败先写入 renderer/main 可观测日志；仓库尚无全局 toast 基础组件，不在本轮为单一菜单引入新的全局反馈系统。

## 会话行

- 高度紧凑（约 36px），保持高密度文本导航的气质，不做卡片。
- 整行用 grid 四段布局：`marker 14px | title 1fr | actions 46px | time auto`，padding 0 8px、gap 8px。左侧状态与标题继续和 workspace folder 对齐，右侧时间形成稳定扫描列。
- 字号：`title` 13px / 500；`time` 11px / `--color-text-faint`，紧凑相对时间（`1h` / `3d` 缩写）。时间位于最右侧，在普通、选中和 hover 状态下始终显示。
- Hover 时背景轻灰；当前选中态使用更深一点的浅灰底。

### 左侧 marker（唯一状态点）

- marker 列宽 14px，只渲染一个可点击的 `session-status-dot`，不再在行尾重复显示同一状态。
- 默认 idle 使用中性灰点；active / busy 使用 operational green，waiting approval 使用 warning，failed / interrupted 使用 danger。
- 点击状态点仍可查看状态名称和说明，移除重复点不牺牲原有状态详情功能。
- Pin 不再覆盖状态点，因此置顶、选中、运行等状态可以同时表达，标题起点也不会因置顶状态变化。

### 右侧 actions

- 固定顺序为 **Pin / Unpin → Archive → 时间戳**；两个按钮均为 22×22，时间戳始终在最右侧。
- Pin 与 Archive 只在行 hover 或各自获得 keyboard focus 时淡入；已置顶通过填充 Pin 表达，但不在非 hover 状态常显。
- actions 固定预留 46px，避免 hover 时标题截断位置或时间戳横向跳动。
- 非当前会话点击 Archive 会调用 `archiveSession({ sessionId, archived: true })`，写入 `SessionMeta.archived` 后从普通侧边栏列表隐藏。
- 当前 active session 不允许归档，Archive 按钮保持占位但禁用，`aria-label` / `title` 为 `Current session cannot be archived`，避免当前工作区被操作清空或自动跳转。
- 行尾不显示状态点，避免左右两边出现语义相同的圆点。

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

## Settings 切换规则

- 底部 `Settings` 是页面级入口，不是弹窗入口。
- 点击后从聊天态切换到设置态，原侧边栏被设置导航替换。
- 切换规则与设置态布局见 `设置页规范.md`。
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

字体栈与 Cursor 对齐，详细约定见 [全局视觉语言规范.md](./全局视觉语言规范.md) 的「字体栈」「字体特性」「字号阶梯」「字重与行高」四段。Sidebar 这里只列与本组件直接相关的字号字重表：

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
  - 主入口（New Agent / Usage / Kairos）：`13px / 500 / --color-text-muted`。
  - 会话标题：`13px / 500`。
  - 会话时间戳：`11px / --color-text-faint`。
  - 分组标题（Pinned / Scheduled / Workspaces 等）：`12px / 500 / --color-text-faint`。靠字号小一档 + 颜色更浅区分语义，而不是用 440 这种非标字重。
  - Workspace 文件夹名：`13px / 500`。
  - Settings：`13px / 500`。

## 后端契约

- `SessionMeta` 增加可选字段：
  - `workspaceRoot?: string`：创建会话时由主进程从 `BootstrapState.workspaceRoot` 注入。
  - `pinned?: boolean`：用户在前端 pin/unpin 时通过 IPC `session:pin` 更新。
- `archived?: boolean`：用户归档会话时通过 IPC `session:archive` 更新。
- `SessionListItem` 同步透出这些字段，让前端按 workspace 分组并标记 pinned / archived。
- `WorkspaceEntry` 增加可选 `hidden?: boolean`；该字段持久化在 `workspaces.json`，不因 session 反向合并自动清除。
- 后端 `agent-core` 在创建 session 时根据 `SessionCreateInput.workspaceRoot` 写入 meta；列出时直接透出。
- 切换 pin 走 `pinSession({ sessionId, pinned })`，主进程调用 `setSessionPinned` 重写 meta。
- 重命名走 `renameSession({ sessionId, title })`，主进程调用 `setSessionTitle` 重写既有 `SessionMeta.title`。
- Fork 走 `forkSession({ sessionId })` / `session:fork`；主进程拒绝 active turn，并调用 agent-core 的 `forkSessionRecord` 创建独立会话目录后返回完整 `SessionRecord`。
- Copy ID 只使用列表已有 `sessionId`；Copy Transcript 对当前会话复用 renderer 消息，对其他会话按需读取完整 `SessionRecord`，再通过 shared formatter 过滤为 User / Assistant Markdown。
- 切换 archive 走 `archiveSession({ sessionId, archived })`，主进程调用 `setSessionArchived` 重写 meta；普通 `listSessions()` 默认只返回未归档会话，设置页通过 `listSessions({ archived: true })` 读取归档列表。
- `Archive All` 在 renderer 中先冻结 Workspace 当前 session id 快照并处理 active session 导航落点，再通过 main-owned 批量归档契约执行；返回值至少包含 `archivedSessionIds` 和 `failedSessionIds`。
- `Open in IDE` 走 main-owned Workspace IPC，输入只包含 `workspaceId`，main 根据 registry 解析并校验目录后打开 Cursor。
- `Remove from Sidebar` 走 main-owned Workspace visibility IPC，只更新 registry 的 `hidden`；当用户再次选择同一目录时，Workspace selection 逻辑必须复用原条目并将 `hidden` 置回 `false`。
- Workspace registry 的读取、reconciliation 和 visibility 更新属于同一个读改写事务，必须按 `dataRoot` 串行执行，并使用唯一临时文件原子替换，避免启动期并发 `workspace:list` 争用固定 `.tmp`。
- 会话 Tooltip 只消费 `SessionListItem.title` 和 Workspace 分组已解析的 `workspaceRoot`，不读取 `session.jsonl`，不发起 `session:get-preview`。

## 验收矩阵

- Workspace 文件夹：左侧 chevron 只折叠；名称左键只聚焦，右键打开菜单，`Shift+F10` / Context Menu 键提供键盘入口；右侧 `+` 仍只新建 Agent。
- 菜单：顺序、图标、separator、danger 文字、键盘方向键、Escape 回焦和窗口 collision 正常。
- `Open in IDE`：只打开 registry 对应目录；未注册、已隐藏、不存在和非目录目标都不启动外部程序。
- `Archive All`：包含 Pinned 会话；存在 running/waiting approval 会话时禁用；active session 有导航落点；部分失败保留未成功条目。
- `Remove from Sidebar`：同时移出 Workspaces/Pinned；Default workspace 禁用；重启不回流；重新选择同路径恢复。
- 会话 Tooltip：所有行可 hover/focus，只显示完整标题与绝对路径；定位锚点使用完整会话行，使浮层左边缘与 Sidebar 右侧分割线保持 `8px` 间距，而不是贴着标题文字出现；右键菜单和重命名时关闭。
- 主题：浅色、深色和 system-dark 下不使用非主题感知颜色，focus/disabled/danger 状态可辨识。

## 设计原则

- 轻量优先：信息密度高、视觉装饰少，不做重卡片。
- 轻量管理：Workspace 来源仍是本地目录，侧边栏只暴露打开、归档和隐藏三个高频动作，不在导航区引入重命名、排序、迁移等重管理能力。
- 状态合并：行首点首版只区分 active 和 busy，不细分未读/错误/审批，等业务上有真实区分需求再扩展。
- 操作克制：顶部主入口要么是当前真正在演进的产品方向（Usage / Kairos），要么是核心操作（New Agent）；暂停的方向不占用公开入口。
- 折叠彻底：`hidden` 而非 `rail`，让 main content 真正占满，符合用户对"折叠"的直觉与 Cursor 行为一致；窗口顶部浮动的 chrome row 保证可逆。
