# 左侧会话栏规范

管左侧会话栏（`components/Sidebar.tsx`、`components/sidebar/**`）：入口、分区列表、会话行、工作区操作。宽度、折叠和紧凑覆盖规则见 [front-工作台布局与面板交互规范.md](front-工作台布局与面板交互规范.md)；会话按需分页见 [agent-progressive-session-loading.md](../agent-runtime/agent-progressive-session-loading.md)。

## 信息架构

自上而下四块：

1. 顶部窗口区：红绿灯 + 折叠按钮 + 会话历史 Back / Forward。这些是窗口级 chrome（由 `WindowChromeBar` 渲染，不属于 sidebar 内部），顶部不放搜索按钮。
2. 顶部主入口：`New Agent`（`⌘N`）/ `扩展`。选中态用中性高亮，两个入口共用同一套 hover / active 语言。
3. 分区列表：`已置顶` → `工作区`（按工作区分组）或 `会话`（单列表 / 按时间）。
4. 底部 `Settings`：页面级入口，点击后侧栏被设置导航替换；不显示账号卡片。

- 折叠按钮在 expanded / hidden 间切换，hidden 时 aria-label 为 `Expand session sidebar`。
- Back / Forward 只遍历本次 Workbench 已访问的会话，不改 Session Journal；无历史时禁用；切到新会话后截断前进历史。
- 展开态不放 logo / 品牌 wordmark；超长标题仍是紧凑单行，不变成多行卡片；会话列表保留细滚动条（低对比 thumb，hover 增强），与右侧 1px 分隔线保持不同层级。

## 分区标题

`已置顶`、`工作区 / 会话`、按时间分组的时间段标题共用 `SidebarSectionHeader`：

- 12px / 500 / faint，靠字号小一档和更浅的颜色与主入口区分，不用非标字重。
- 点标题文字折叠 / 展开；右侧 12px `ChevronDown` 展开时隐藏、悬停或聚焦时淡入，收起时转向右并常亮。
- 「工作区 / 会话」标题右侧常驻三个图标：搜索、视图选项、添加工作区。视图被改过时视图图标着强调色并带一个小圆点，提示名为「视图选项（已改动）」。
- 折叠状态（分区、每个工作区、每个时间段）持久化在 `localStorage` 的 `actspace.sidebar.view.v1`；「恢复默认」不清折叠状态。

## 搜索

- 点放大镜，搜索框从图标位置向左展开盖住标题行并自动聚焦；`Esc` 或 ✕ 关闭；输入为空时点别处也关闭，有内容时保留。
- 有输入时结果替换下方列表（已置顶分区也隐藏）；结果行与普通会话行一致，点开切换会话。
- 走 `sessions.listPage({ search })`（停 250ms 再查，每页 50 条），不依赖侧栏已加载的会话；索引不可用提示「查询索引暂不可用，已从会话文件读取」；无结果为「没有匹配的本机会话」。设置页的快捷键里另有独立 `SessionSearch`，两者共用 `use-session-search.ts`。

## 视图选项

`SidebarViewMenu` 三组单选 + 恢复默认，选一项菜单不关。

| 分组方式 | 说明 |
| --- | --- |
| 按工作区（默认） | 每个工作区一个可折叠文件夹，标题「工作区」 |
| 单列表 | 未置顶会话排成一列，每行标工作区名，标题「会话」 |
| 按时间 | 见下文，标题「会话」 |

| 排序 | 说明 |
| --- | --- |
| 最近更新（默认） | `updatedAt` 倒序 |
| 手动排序 | 用户拖出的顺序；新会话在最上，已归档在最后；按时间分组时禁用（提示「按时间时不可用」） |

| 筛选 | 说明 |
| --- | --- |
| 隐藏已归档（默认） | 已归档会话不显示 |
| 全部对话 | 已归档会话回到各自工作区排最后，行尾标「已归档」 |
| 仅显示已归档 | 只显示已归档会话并隐藏已置顶分区；没有时显示「暂无已归档会话」和「查看其他会话」 |

- 「恢复默认」回到按工作区 / 最近更新 / 隐藏已归档，并清掉手动顺序。
- 手动顺序按「账本」分别记（每个工作区的会话、置顶区、单列表、工作区之间），存在同一 `localStorage` 键，每账本最多 1000 个 id；工作区顺序只存本机，不写 `workspaces.json`。
- 已归档会话 `listPage` 不返回；筛选非「隐藏」时才用 `sessions.list({ archived: true })` 全量拉取，且只放进仍在侧栏里的工作区（远端会话或已登记工作区）。

## 拖拽排序

- 可拖：同一工作区内的会话、置顶区内的会话、单列表里的会话、工作区文件夹之间。不能跨账本拖，非法位置显示「禁止」光标。
- 插入位置是行上沿或下沿一条 2px 强调色线、左端一个圆点；被拖行半透明。按时间分组、搜索结果、已归档行和重命名中的行不能拖。
- 在「最近更新」下拖一次：先把当前顺序拍下作为各账本起点，再切到手动排序，标题下出现约 3 秒的「已切换为手动排序」提示（`role="status"`）。
- 用原生 HTML5 拖拽（`use-sidebar-drag.ts`），不挂 document 级监听。

## 已置顶

- 跨工作区的顶层分区，所有分组方式下都在最上面；无置顶会话时隐藏，搜索和「仅显示已归档」时隐藏。
- 不按工作区分组时，置顶行也标工作区名；置顶区不折叠（不限 5 条），手动排序时可拖。

## 工作区

- 「工作区」是父级标题，下面挂多个工作区文件夹；父级可折叠（默认展开）。
- 工作区按会话创建时记录的 `workspaceRoot` 归类，名称取登记名，其次 `path.basename(workspaceRoot)`。
- 文件夹行：高 30px，grid `[icon-slot 16px | name 1fr | actions auto]`，文件夹名 X 位置等于下方会话标题 X 位置。
  - icon-slot：默认文件夹图标（展开 `FolderOpen` / 收起 `Folder`，当前会话在其中时用强调色）；悬停整行时淡出、`ChevronDown` 淡入叠在同一格，收起时箭头转向右。点击折叠，不进 Tab 顺序。
  - 名称：点击折叠 / 展开（`aria-expanded`），`title` 是完整路径；`Shift+F10` / Context Menu 键打开操作菜单。
  - 悬停时右侧出现 `⋯`（「更多操作：名称」，打开与右键相同的菜单）和 `+`（在该工作区新建会话）。
- 每组先显示 5 条；运行中、待审批和当前会话不占名额且总显示；其余用「展开其余 N 个会话」展开（剩不到 7 条一次展开完，否则每次 5 条），展开后显示「收起」。服务端还有更多时显示「加载更多会话」。无会话显示「暂无会话」。
- 不支持重命名工作区，也不支持把会话拖到另一个工作区。

## 按时间分组

- 最上面「需要处理」（warning 色标题 + 数量胶囊）收待审批、失败、跑完未看的会话；其余按 `updatedAt` 落进：今天、昨天、近 7 天按星期（标题旁写日期）、本月更早、今年按月、往年按年月。
- 每个时间段可折叠（持久化），段内不限条数、每行标工作区名；置顶会话仍在已置顶分区。服务端还有未加载会话时，列表末尾统一「加载更多会话」。

## 工作区操作菜单

- 与会话右键菜单同一套主题感知浮层（`ContextMenu`），不用原生菜单；默认在名称右下方展开，碰撞时翻转，不被 sidebar `overflow` 裁切；打开时文件夹行保留 hover 底色。
- 顺序固定：`在 IDE 中打开` / `归档全部` / separator / `从侧栏移除`（danger 文字，不用大面积红底）。支持方向键、`Enter` 执行、`Escape` 关闭并回焦名称按钮。
- 在 IDE 中打开：目标是 Cursor（`main/workspace-ide-service.ts`）。renderer 只传 `workspaceId`，main 从 registry 重新解析路径并校验未隐藏、目录存在且是 directory；失败时不动数据，给非阻塞反馈。
- 归档全部：对象是点击时该工作区下全部未归档会话快照（含置顶）；不删文件、不移除 registry 条目；可在 Settings 的已归档会话恢复，因此不二次确认。无可归档会话时禁用；任一目标 `running` / `waiting_approval` 时禁用，原因通过 title 可见。active session 在快照中时，先切到另一工作区最近未归档会话，没有就回新建会话草稿页。完成后只刷新一次列表；部分失败要告知已归档 / 未归档数量，未成功条目保持可见。
- 从侧栏移除：只隐藏工作区及其会话导航，不删文件、不删 session、不改 archived / pinned；其会话同时从工作区与置顶分区移出。所有工作区（含自动创建的默认工作区）都可移除，移除后不再自动创建。active session 属于它时先切到其他可见工作区的最近会话，没有则回新建会话页。全部移除后新建会话页不能发送，提示「请先选择工作区」。hidden 状态持久化在 registry；用户用 `New folder` 重选同一路径时清除 hidden 并恢复原会话、pin、archive。没有「隐藏工作区管理页」。

## 会话行

- 高 30px，grid `marker 16px | title 1fr | end auto`，gap 6px，不做卡片。标题 13px / 500，跑完未看的标题加粗；单列表、按时间、搜索结果和非工作区分组下的置顶区在标题后标工作区名（11px faint，最多占 34%）。
- 行尾平时显示中文相对时间（刚刚 / 5分钟 / 3小时 / 2天 / 2个月 / 1年）；待审批显示 warning 色「待审批」；已归档显示「已归档」标签。悬停、键盘聚焦或菜单打开时行尾让位给操作按钮。双击标题重命名。
- 带 `sideChatParentId` 的会话不进侧栏（后端 `listPage` 也排除）；主会话行标 GitFork 图标和 `sideChatCount`（aria-label「N 个侧边对话」），侧边对话在右侧面板打开。

### 左侧 marker（唯一状态点）

- marker 列只有一个可点击的 `session-status-dot`，点击看状态名称和说明（状态表达的全局规则见 [front-文案与状态表达规范.md](front-文案与状态表达规范.md)，侧栏圆点是窄空间例外，悬停给文字）。
- 空闲不显示；运行中 operational 色转圈圆环；待审批 warning 色呼吸点；失败 danger 色点；跑完未看（`unread`，「已完成」）success 色点。
- 「跑完未看」由 renderer 在后台会话 `agent_run_finished` 时记下，打开即清除，只存内存、重启不保留；当前会话不显示。已归档的行不显示状态；Pin 不覆盖状态点。

### 行内操作

- 悬停时依次是 `⋯` → 归档 → 置顶 / 取消置顶，均为 22×22 `IconButton`；置顶会话提示「取消置顶会话」，否则「置顶会话」。
- 已归档的行是 `⋯` → 取消归档（`ArchiveArrowUp`），无置顶；右键菜单里「归档」同样换成「取消归档」，「置顶」禁用。
- 非当前会话归档先从侧栏移除目标行，IPC 失败再重读列表恢复；当前 active session 不能归档，按钮禁用，名称「当前会话无法归档」。

### 右键菜单

- renderer 内的轻量浮层（不调用 Electron 原生菜单，因为重命名要直接切换 React 行内编辑态）。顺序：置顶 / 取消置顶、重命名、复制、分叉、归档 / 取消归档。
- 复制是向右展开的二级菜单（hover、click、focus 都可开）：`复制 ID`（`sessionId`）、`复制会话记录`（Markdown，只含标题、User / Assistant 正文和用户附件名，不含 Thinking、工具原始输出、diff）。
- 分叉：从已持久化 head 创建独立会话并自动打开，标题 `<原标题> (fork)`；运行中或等待审批时禁用。
- 重命名：原地输入，`Enter` 保存、`Esc` 取消、失焦保存，空标题回退；输入框保持 13px / 500，不撑成卡片。

### Hover 信息卡

- hover 或 focus 会话主按钮 350ms 后显示 Tooltip（所有会话可用，不以是否视觉截断为条件）。内容严格两层：完整会话名（12px / 500）和完整 `workspaceRoot` 绝对路径（11px / muted，可换行）；缺路径时第二行 `Workspace path unavailable`。
- 不显示模型、用量、repo / branch、更新时间或操作；这是导航辨识提示，不扩成预览卡。
- 锚点用完整会话行，默认出现在右侧、与 Sidebar 分割线保持 8px，最大宽约 360px；右键菜单打开、进入重命名或会话离开可见区域时必须关闭。只消费 `SessionListItem.title` 与已解析 `workspaceRoot`，不读 `session.jsonl`。

## 扩展与 Settings 入口

- 「扩展」在 New Agent 下方；主区显示能力 / Skills / MCP，行为见工作台布局规范的扩展页；能力详情见 [front-设置页规范.md](front-设置页规范.md)。
- 设置页整页接管，不是弹窗；切换规则与设置态布局见同一份设置页规范。

## 后端契约

- `SessionMeta` 可选字段：`workspaceRoot`（创建会话时由主进程注入）、`pinned`（IPC `session:pin`）、`archived`（IPC `session:archive`）；`SessionListItem` 同步透出。`WorkspaceEntry` 有可选 `hidden`，持久化在 `workspaces.json`，不因 session 反向合并而清除。
- pin / 重命名 / 归档分别走 `pinSession`、`renameSession`、`archiveSession`，由 AgentApplication 追加 `session/pinned-set`、`session/title-set`、`session/archived-set` Journal 事件并刷新投影；`listSessions()` 默认只返回未归档，设置页用 `listSessions({ archived: true })`。
- 分叉走 typed Runtime IPC，主进程拒绝 active turn。复制会话记录：当前会话复用 renderer 消息，其他会话按需读完整 `SessionRecord` 再由 shared formatter 过滤。
- 归档全部：renderer 先冻结快照并处理 active session 落点，再走 main-owned 批量归档，返回至少含 `archivedSessionIds` 与 `failedSessionIds`。在 IDE 中打开与从侧栏移除各走 main-owned Workspace IPC，输入只含 `workspaceId`。
- Workspace registry 的读取、reconciliation 和 visibility 更新是同一读改写事务，按 `dataRoot` 串行并用唯一临时文件原子替换。

## 设计原则

- 轻量：信息密度高、不做重卡片；侧边栏只暴露打开、归档、隐藏三个工作区动作加拖拽排序，不引入重命名工作区、迁移等重管理。
- 状态合并：行首一个点表达运行中、待审批、失败、跑完未看，按时间分组时后三种汇总到「需要处理」。
- 静止时只有标题和时间，个性放在微交互里（文件夹与箭头交叉淡入、搜索框展开、拖拽插入线），不靠常驻装饰。
