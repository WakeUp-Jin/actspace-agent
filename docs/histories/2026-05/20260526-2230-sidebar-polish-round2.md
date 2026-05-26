## [2026-05-26 22:30] | Task: 左侧会话栏对齐 Cursor 第二轮（hidden 折叠 / Workspaces 父级 / Kairos 入口 / 字体 / Archive 等）

### 🤖 Execution Context

- **Runtime**: Cursor IDE
- **Base Model**: claude-opus-4.7

### 📥 User Query

> 这个就是现在 actspace 的样子，还有点小问题：
> 1. 为什么 New Agent 离顶部有那么一大片空白？
> 2. 为什么没有 Workspaces 父级标题，agent-harness-dev 之类的英国是在 Workspaces 下面呀？
> 3. 字体有点小，能拿到 Cursor 的字体吗？
>
> 还有一些交互问题（对照 Cursor 截图）：
> - 鼠标悬浮 Workspaces 出现下拉箭头 + 排序 + 创建文件夹图标。
> - 鼠标悬浮会话出现图钉 + 归档图标。
> - 鼠标悬浮 actspace-agent 这种 workspace 上，文件夹图标转换为下拉图标，左侧显示 + 号，表示创建 Agent。
> - Pinned 中的鼠标悬浮，图钉按钮是深色的。
> - Cursor 点击顶部收起按钮，sidebar 整体消失（不是 rail），actspace 当前不是这样。
>
> 可以执行计划，同时帮我增加一个菜单——在 Usage 下面增加一个叫 Kairos 的菜单。

### 🛠 Changes Overview

**Scope:** `packages/desktop/renderer`、`docs/design-docs/frontend-ui`、`docs/exec-plans/active`、`docs/histories`

**Key Actions:**

- **折叠按钮对齐 Cursor：rail → hidden**：`WorkbenchLayout` 的 `leftMode` 从 `"expanded" | "rail"` 改为 `"expanded" | "hidden"`，rail 模式（60px 窄边）退役。`SplitView` 增加 `leftHidden?: boolean`，true 时不渲染 `.split-view-left` 与 `.split-view-left-separator`，`gridTemplateColumns` 切换为只有 main（+ 可选 right）；`displayedLeftWidth` 隐藏时为 0；拖拽到 `LEFT_HIDE_SNAP_WIDTH (148px)` 以下时 snap 到 hidden。`loadStoredLayout` 在反序列化时把老用户 `leftMode: "rail"` 映射成 `hidden`，避免破坏偏好。
- **SidebarChromeRow 抽到 WorkbenchLayout 顶层**：把折叠按钮 + 搜索按钮组合从 `Sidebar` 内部抽出，`export function SidebarChromeRow` 写在 `Sidebar.tsx` 同文件，由 `WorkbenchLayout` 在 `SplitView` 外层渲染。CSS 改为 `position: fixed; top: 14px; left: 86px; z-index: 60`，这样 sidebar 折叠到 hidden 后这两个按钮仍然挂在窗口左上角（红绿灯右边）可见可点，是重新展开 sidebar 的唯一入口。aria-label 在 hidden 态变为 `Expand session sidebar`。
- **Workspaces 父级分类标题**：之前是把多个 `<WorkspaceSection>` 平铺，没有「Workspaces」父级。现在包一层 `<section className="nav-section nav-section-workspaces">`，标题文案 `Workspaces`、可折叠（默认展开，点击 chevron 整片收起所有 workspace folders）；hover 标题时右侧露出 `Sort workspaces (coming soon)` 与 `New workspace folder (coming soon)` 两个图标按钮（点击 noop，title 标注 coming soon）。
- **新增 Kairos 主入口**：`SidebarView` 类型扩展为 `"chat" | "lab" | "usage" | "kairos"`；Sidebar 顶部主入口区在 Usage 下面加 `Kairos` 按钮，图标 `<Sparkles>`；`WorkbenchLayout` 增加 `kairos` view 分支，渲染 `PlaceholderView`（标题 "Autonomous timing & triggers"，文案定位 Kairos 为 "actspace 的时机引擎"——定时任务、事件触发、自主 Agent 节奏与配额）。Kairos 一词取自希腊语「合适的时刻」。
- **WorkspaceSection 文件夹行 hover 交互**：默认显示 `<Folder>` 图标 + workspace 名；hover 标题区时 Folder 图标淡出、`<ChevronDown>`/`<ChevronRight>` 淡入（按 expanded/collapsed 状态切换）；同时左侧 grid 第 1 列露出 `<Plus>` 按钮（点击在该 workspace 起新 Agent）；右侧 actions 保留 `<MoreHorizontal>`（原 SquarePen 新建按钮挪到左侧 + 号，避免重复）。
- **SessionRow 加 Archive 占位按钮**：每行 hover 时行尾露出 Archive + Pin 两图标（左 Archive、右 Pin），`Archive` 按钮 `aria-label="Archive session"`、`title="Archive (coming soon)"`，点击只 `stopPropagation` + 调用可选 `onArchive(sessionId)` 回调；App 层目前不挂回调，等于完全占位（按 plan 中 `archive_scope=ui_only` 的决定，后端 Archive 实装留作 follow-up）。
- **Pinned 区图钉填充深色**：已 pin 的 session 用 `<Pin fill="currentColor" />` 呈现填充实心；颜色规则从原本的 `var(--color-brand)` 改成 `var(--color-text)`（深色），与 Cursor Pinned 区视觉一致——填充深色对应"已固定"的强权重，蓝色留给状态点。
- **修复 New Agent 顶部空白**：原本 sidebar padding-top（Electron 52px）+ chrome-row absolute + primary-actions margin-top: 22px 三重叠加，导致 New Agent 离顶部 ~74px。新方案：chrome row 改 fixed 外移，sidebar 不再为 chrome row 留位置；`--window-sidebar-top-safe` 统一为 44px（macOS / vite mock 都一样）、`.sidebar-primary-actions { margin-top: 6px }`。chrome row 下沿 36px、primary actions 上沿 50px，气口 14px。
- **字体栈对齐 Cursor**：`--font-ui` 与 `--font-display` 不再把 `"SF Pro Text"` 放最前（避免英文走 SF Pro Text、中文 fallback PingFang SC 之后基线和字号不齐）。新字体栈：`-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Segoe UI", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif`，macOS 系统自动用 San Francisco，与 Cursor 完全一致。body 加 `line-height: 1.45`、`font-feature-settings: "cv11", "ss01"`、`-webkit-font-smoothing: antialiased`。sidebar 关键字号微调：主入口 / 会话标题 / Settings 13.5px、分组标题 12px、Workspace 文件夹名 12.5px。
- **前端测试扩展**：`sidebar.test.tsx` 从 6 例扩到 13 例，覆盖四主入口（含 Kairos）、Workspaces 父级渲染与折叠、Archive 按钮回调、Workspace + 号回调、Pin 切换、see more/less、状态点、`mode="hidden"` 时 Sidebar 渲染为 null；新增 SidebarChromeRow 单独的 describe 覆盖 PanelLeft / Search 按钮 + Expand 文案切换。`app-streaming-user-message.test.tsx` 6 处 mock window.actspace 补 `getUsageStatistics: async () => null`（工作树里另一份 Usage 统计 IPC 改动引入的接口，跟本任务不直接相关但挡了 typecheck）。
- **设计文档重写**：`左侧会话栏规范.md` 改成 hidden 折叠 + 浮动 chrome row 描述，补 Workspaces 父级 + Workspace 文件夹 hover 交互 + Archive 占位 + Kairos 入口 + 字体策略 + 字号基准；`exec-plans/active/sidebar-cursor-alignment.md` plan 进度项已在上一轮就全部勾选，本轮无需再动。

### 🧠 Design Intent (Why)

**为什么 rail 模式退役**：原本 60px 的 icon-only rail 看起来像个折中——既不真的"折叠"也不真的"展开"。和 Cursor 对照后用户明确希望"点击折叠按钮 sidebar 直接消失"，那 rail 就是无用的中间态。砍掉 rail 后 toggle 从三态枚举（含拖拽 snap）简化为二态，state 管理与 CSS 都更干净。但要付出代价：sidebar 隐藏后必须有一个一定能点回去的入口，这就是为什么把 chrome row 浮到 sidebar 外面。

**为什么 SidebarChromeRow 抽到 WorkbenchLayout 顶层**：原本 chrome row 是 sidebar 内部的 absolute 元素，跟着 sidebar 渲染。一旦 sidebar 不渲染（hidden 态），chrome row 也跟着没了——用户就再也无法重新展开 sidebar，UX 死锁。两条解：
1. 让 sidebar 永远渲染（哪怕 0 宽度）—— 但 sidebar 内部有 padding / drag region / focus trap，0 宽度仍然占据布局逻辑。
2. 把 chrome row 抽出来作为窗口级浮动元素 —— 与 Cursor 的视觉模型一致（红绿灯 / 折叠 / 搜索属于窗口栏，不属于 sidebar）。

选了方案 2。`position: fixed top:14 left:86 z-index:60` 让它始终挂在红绿灯右边那个稳定位置，无论 sidebar / main / right panel 怎么变都不动。这也跟用户感知"Cursor 是把这些按钮放在窗口顶部全局区"是对得上的。

**为什么 Workspaces 要包父级**：扁平把多个 workspace folder 直接堆在 sidebar 上，看起来像是「Workspaces 分组」和「Pinned/Scheduled」是平级的——但实际上 Workspaces 是一类容器（里面有多个 folder），Pinned/Scheduled 是单独的 section。结构不对会让用户误以为「actspace-agent 是和 Pinned 同层级的分类」。Cursor 的层级是清楚的：`Workspaces ▼ → folder ▼ → 会话`，我们对齐。

父级标题上的 Sort / New folder 两个按钮是为视觉层级配套——Cursor 的 Workspaces 父级 hover 时有这两个，actspace 跟着放、但点击 noop。这两件事在 actspace 没有合理映射（Workspaces 按 cwd 自动归类、没有手动新建），但保留视觉占位让 UI 看起来"完整"，等以后真的有功能再接进来。

**为什么 Kairos 用希腊语命名**：Lab / Usage 是描述性单词，Kairos 是概念性命名——意为「在合适的时刻做合适的事」。actspace 后续计划里有「定时唤起 Agent」「事件触发 Agent」「自主 Agent 的节奏护栏」一类功能，这些都围绕"时机"展开。叫 Kairos 比叫 `Scheduler` 或 `Triggers` 更概括，且不会跟 Sidebar 中的 `Scheduled` 分区直接撞名（Scheduled 分区是会话级的定时回执，Kairos 是 Agent 级的时机引擎，层级不同）。

**为什么 SF Pro Text 不再放最前**：以前以为"先 SF Pro Text 再 PingFang SC 再 -apple-system"是更精细的 fallback。但实际上：
- macOS 上 `-apple-system` 等价于 `BlinkMacSystemFont`，会自动选 San Francisco（即 SF Pro 系列），不需要显式写 `SF Pro Text`。
- 显式写 `SF Pro Text` 会让浏览器优先匹配那个具体字体文件，但 SF Pro Text 没有中文字形，中文落回 PingFang SC。问题是 SF Pro Text 和 PingFang SC 的 x-height / 字号比例不同，混排时基线和大小看着就"飘"。
- Cursor 本身的 CSS 也是用 `-apple-system, BlinkMacSystemFont, ...` 开头，让系统选最合适的 SF 变体（SF Pro Text、SF Pro Display 由系统按字号自动切换）。

字体栈对齐 + body 加 `cv11/ss01` feature settings 后，sidebar 在 macOS 上跟 Cursor 看起来几乎一致。

**为什么 listSessionRecords 用显式 if 赋值这条上一轮的坑还在**：本轮没碰 listSessionRecords，但 plan 里提了一下。这是个值得复习的小坑——条件 spread 在 TS strict 模式下会让 `pinned?: boolean` 被推断成 `pinned?: true`，跟接口类型不兼容。改成 `if (meta.pinned) item.pinned = true;` 这种朴素写法 TS 不会做字面量收窄。

### 📁 Files Modified

**前端组件：**
- `packages/desktop/src/renderer/components/Sidebar.tsx`（整体重写：SidebarChromeRow export、Kairos 入口、Workspaces 父级、Workspace folder hover、Archive 按钮、Pin fill、mode 类型改 expanded/hidden）
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`（leftMode hidden / SidebarChromeRow 挂载 / Kairos view / SplitView leftHidden 传参 / localStorage 旧 rail 映射）
- `packages/desktop/src/renderer/components/SplitView.tsx`（新增 leftHidden prop，hidden 时不渲染 left pane 与 separator）

**样式：**
- `packages/desktop/src/renderer/styles.css`（字体栈、`--window-sidebar-top-safe: 44px`、SidebarChromeRow position:fixed、`.sidebar-primary-actions margin-top: 6px`、关键字号 13.5/12/12.5px、`.nav-section-workspaces` / `.workspace-folder-row` / `.workspace-add-button` / `.workspace-folder-icon` 双图标切换、`.session-row-actions` / `.session-row-archive` / Pinned `is-active` 深色）

**测试：**
- `packages/desktop/src/renderer/test/sidebar.test.tsx`（13 例：四主入口含 Kairos、Workspaces 父级渲染与折叠、Archive 回调、Workspace + 号回调、Pin 切换、see more、状态点、hidden 模式不渲染、SidebarChromeRow PanelLeft + Search + Expand 文案）
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`（6 处 mock window.actspace 补 getUsageStatistics stub）

**文档：**
- `docs/design-docs/frontend-ui/左侧会话栏规范.md`（整体重写：hidden 折叠 + 浮动 chrome row + Workspaces 父级 + Workspace folder hover + Archive 占位 + Kairos 入口 + 字体策略 + 字号基准）

### ✅ Verification

- `pnpm typecheck`：shared / agent-core / desktop（含 electron tsconfig）三个 workspace 全过。
- `pnpm test`：agent-core 33 文件 / 262 用例通过，desktop 3 文件 / 27 用例通过（含新增 sidebar test 13 例）。
- `pnpm check:docs`：文档骨架检查通过。
- Vite 浏览器 mock 验证（CDP）：
  - chrome row position=fixed top=14 z-index=60 ✓
  - sidebar primary-actions 上沿 50px / chrome row 下沿 36px / 气口 14px ✓
  - 点击 PanelLeft → sidebar 完全消失（snapshot 里所有 sidebar 元素都没了，main content 占满），chrome row 仍可见 ✓
  - 再点 PanelLeft → sidebar 完整回来 ✓
  - 点击 Kairos → 切换到 Autonomous timing & triggers 占位页 ✓
  - Workspaces 父级 + Sort/New folder 按钮 / Workspace folder + 号 / Archive + Pin 双按钮 / Pinned 区填充图钉 全部在 snapshot 里出现 ✓

### 🔮 Follow-ups

- Archive 后端实装（SessionMeta.archived / archiveSession IPC / listSessions 过滤 archived），目前前端按钮纯占位。
- Workspaces 父级 Sort / New folder 真实功能（需要先决定 actspace 是否要支持「手动 Workspace 管理」）。
- Lab / Usage / Kairos 三个占位页要接真页面，路由钩子已经留好。
- 全局搜索面板的真实实现，sidebar 上的搜索按钮目前只是占位。
- 当前没有为 `is-rail` 相关 CSS 选择器做清理（它们存在但因为 mode 不会再传 rail 永远不触发），下一轮 sidebar 调整时一起删。
