# 右侧面板与文件渲染规范

> 2026-09-09 文案更新：日常界面展示名称以[中文文案规范](front-desktop-chinese-ui.md)为准；保留 Chat、Plan、Thinking、Effort 和工具执行展示。本文英文名称仍可用于指代内部概念，协议与行为不变。

## 定位

右侧面板是当前会话的对象浏览工作区，用于查看文件、预览结果和 Review 变更结果。

它属于聊天态工作台的可调对象区；右侧开关、宽度边界和中间聊天区保护规则见 `工作台布局与面板交互规范.md`。

## 文档范围

本文是右侧对象浏览区的单一前端事实来源，覆盖面板外壳、对象启动页、Tab 系统、文件渲染、Workspace 文件浏览、Context 面板、Reply 和 HTML 沙箱安全。Review 作为右侧对象 Tab 直接在面板内展示；六种 scope、upstream Branch、结构化 diff、Review Options 和 Git actions 统一见 `docs/design-docs/core-review-change-sources.md`。Terminal 在面板中的 Tab 语义由本文约束，PTY、会话生命周期、背压、进程清理与打包边界见 `front-右侧终端与会话生命周期规范.md`。工作台左右面板 resize、collapse 和标题栏让位仍见 `docs/design-docs/frontend/front-工作台布局与面板交互规范.md`；颜色硬约束见 `docs/design-docs/frontend/front-主题与配色规范.md`。

## 交互模型

- 顶部使用横向 Tab：在 44px chrome 行内垂直居中，Tab 高 30px、圆角 8px、字号 13px；标题左侧留白与右侧关闭按钮间距均为 10px，相邻 Tab 间距 4px。关闭按钮始终保留位置，悬停显现不改变标签宽度。
- 每个 Tab 对应一个对象实例，不对应固定页面。
- 点击消息中的文件、链接、图片或 diff 时，在右侧打开对应 Tab。
- 支持多个 Tab 并列打开与切换。
- 首版重点只保留文件预览和 Git-first Review 两条主线。
- 面板打开后允许调整宽度，关闭后把宽度归还给中间聊天区。
- 首版关闭右侧面板时不保留右侧 rail。
- 右侧 Tab 行位于隐藏标题栏 chrome 的同一高度区间，必须保证 tab 按钮能高于 `.chrome-center` 拖拽区接收点击；同时继续给右上角 PanelRight 按钮预留 padding，避免 tab 命中区压住关闭右侧面板入口。
- 没有对象 Tab 时，Tab 行仍显示稳定的面板身份：默认显示 `Objects`，进入工作区文件浏览态后显示 `Files`；不能让右栏顶部只剩一组悬空图标。
- `<= 600px` 且右侧面板作为全宽覆盖层时，Tab 行左侧必须避开 macOS 窗口控制与左侧 chrome 入口；全局中间标题 / Workspace 操作同时退场，不能覆盖 Tab 命中区。

## 对象启动页（2026-07-17）

右侧面板没有打开对象时，不默认塞入业务 Tab，而是展示一个参考 Cursor 空面板入口密度的对象启动页。启动页只借用“方块入口 + 大留白”的形式，入口名称与数量由 Actspace 当前真实对象决定。

当前固定展示五个入口，另有「侧边对话」入口与已收起列表（见「侧边对话」一节）：

- `Files`：进入 Workspace 文件浏览态，不新增对象 Tab。
- `Terminal`：创建或聚焦绑定当前会话 workspace / worktree 的交互式 shell；详见 `front-右侧终端与会话生命周期规范.md`。
- `Review`：打开当前 workspace 的 Review，并创建/聚焦稳定的右侧 Review Tab。
- `Context`：打开主 Agent 当前会话的 Context 面板 Tab（占用、路径、明细、趋势和事件，只读）。
- `Reply`：打开当前会话生成过的可视化回复聚合视图；HTML 是当前内部渲染格式，不进入入口名称。

布局与状态规则：

- 默认宽度下使用双列网格，第五个入口自然落在最后一行，不保留空占位。
- 卡片使用中性 surface、语义边框和统一 Lucide 线性图标；当前状态使用中性 selected 层级，focus-visible 使用高对比主题 token，颜色只承担语义状态或数据可视化，不把六个入口做成六种彩色功能卡。
- 关闭最后一个对象 Tab 后回到启动页；折叠面板时若仍有已打开对象，重新展开继续恢复原 Tab。
- 启动页和右上角 `+` 菜单打开的是同一组对象语义，不能出现名称或行为漂移。
- 启动页入口必须是键盘可达的原生按钮，具备明确 hover、pressed、focus-visible 和 disabled 状态。

## Tab 溢出处理（2026-05-30，参考 Cursor 编辑器标签）

chrome-right 现有两个浮层控件（`+` 新建对象 + PanelRight 折叠），Tab 行必须预留**两个控件**宽度（`pr-[calc(2*var(--window-chrome-control-size)+28px)]`），否则 tab 会滑到 `+` 下方造成按钮重叠。

Tab 过多时**不加可见水平滚动条**（用户明确反对），改用 Cursor 式的三层兜底：

- Tab 保持内容宽度（标题截断到 160px），不挤压成不可读窄条。
- 激活 Tab 使用 `surface-subtle` 的轻量中性底色和 medium 字重，不使用更深的全局 `selected` 填充；非激活 Tab 继续透明，hover 才使用 `hover-overlay`。
- Tab 行横向可滚动但**隐藏滚动条**（`.scrollbar-none`，见 `electron.css`）；macOS 触控板/滚轮仍可滚动；切换/新增 tab 时激活 tab 自动 `scrollIntoView`。
- 溢出时（`ResizeObserver` 检测 `scrollWidth > clientWidth`）在 tab 行右侧、预留区左缘显示一个**溢出下拉 ⌄**，列出全部 tab 供点选 / 关闭——这是无滚动条时的可达性兜底。

## Tab 类型

- `Markdown`：Markdown 文件渲染。
- `HTML`：HTML 预览。
- `Image`：图片渲染。
- `PDF`：PDF 预览。**未实现**，V2；当前 `.pdf` 走不到独立 Tab。
- `CSV`：表格预览。2026-07-30 实现（`CsvRenderView`）。
- `Text`：纯文本或代码文件查看（`CodeRenderView`，见「代码视图能力」）。
- `Review`：完整代码审阅工作台入口；支持 Git-first scope 与 `Last Turn` Agent 视角，具体契约见 `docs/design-docs/core-review-change-sources.md`。
- `Context`：Context 面板；见本文「Context 面板」一节。
- `Reply`：当前会话已生成的可视化回复浏览器（见下文）；内部当前由 HTML 产物承载。
- `Terminal`：用户交互式 shell；Tab 只保存 terminalId / sessionId / title，不保存 PTY、xterm 实例或输出缓冲。
- `sideChat`：侧边对话；见「侧边对话」一节。

## 「+ 新建对象」菜单（2026-05-30，2026-06-04 补 Review）

- 隐藏标题栏 chrome 右段、右侧折叠（PanelRight）按钮**左侧**放一个 `+` 按钮（参考 Cursor 顶栏的 +）。
- 点开是一个轻量菜单，可往右侧面板新增对象：`侧边对话`（排第一，仅本地运行目标）/ `工作区文件` / `Terminal` / `Review` / `Reply` / `Context`。非 Terminal 对象 Tab 使用稳定 id 去重（重复打开只聚焦或刷新，不堆叠）；Terminal 底层允许每会话多实例，标题按创建顺序区分。`工作区文件` 只切换工作区浏览态，不新增 Tab。
- `Review` 入口复用 Composer 的 Review 打开逻辑，首次默认选择当前 workspace 的 Git `Uncommitted` scope；后续打开恢复该 workspace 最近 selection。
- 菜单与右侧折叠按钮同属 chrome-right，`-webkit-app-region: no-drag`。
- **`+` 仅在右侧面板打开时显示**（`view === "chat" && isRightPanelOpen`）：`+` 的语义是「往面板里加对象」，面板关着时无意义；面板关闭时 chrome-right 只保留 PanelRight 折叠按钮。

## Reply 视图（2026-05-30，下拉选择器版；2026-07-17 收口名称）

把**当前会话**里通过「消息可视化」生成过的 HTML 聚合到一处（数据见 `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md` 的缓存 sidecar）。**渲染区占满**，文件列表收进一个下拉选择器，不再用常驻侧栏挡住渲染图：

- 顶部操作栏（左起）：**文件选择器**（按钮显示当前文件名 + chevron，点击弹出可滚动浮层，列表项只显示文件名，参考模型选择器）、**刷新**按钮。
- 主体：复用沙箱 `HtmlRenderView` 渲染选中文件（半可信 → `trust="chat"`，自带预览/源码切换）。
- 无文件时选择器禁用显示「暂无文件」，渲染区给空态提示去某条回复点「可视化」。
- 数据走 `visualize:list` IPC（倒序 + 派生 `title`），renderer 不直接读 FS；浏览器 mock 无 IPC 时优雅降级为空态。
- 设计取舍：聚合入口与「每条回复下的可视化按钮」互补——后者按需看单条，前者集中浏览本会话全部产物。

## 文件渲染规则

不同文件类型使用不同渲染组件。

- `md`：默认渲染为可读文档，可切源码；源码态复用 `CodeRenderView`（有行号、有 markdown 高亮），不是裸 `<pre>`。
- `html`：渲染为可交互预览。
- `csv` / `tsv`：渲染为表格视图，见「CSV 表格预览」。
- `pdf`：渲染为分页阅读视图。**未实现**，V2。
- `图片`：直接预览。
- `review` / `diff`：进入完整 Review Workbench；Git scope 与 `Last Turn` 共用结构化 file/hunk/line renderer，不放在单条消息里替代消息流中的局部 diff。

### 代码视图能力（2026-07-30）

`CodeRenderView` 是 `Text` Tab 与 Markdown 源码态的共同实现。

**这个视图没有工具栏**（2026-07-30 收口）：行号、折行、复制、查找四个开关曾经都摆在顶部一条 icon 栏里，实际效果是每个文件上方多出一层几乎不点的按钮。文件级动作统一收到 Workspace 操作栏，视图本身只负责把内容读清楚。

- **行号**：CSS grid 双列，一个逻辑行一个 grid row，所以折行的续行仍落在同一 row 内、不与行号错位。gutter `select-none` + `aria-hidden`，复制和读屏都不会带上行号；`sticky left-0` + 不透明底色，遇到不可断的超长 token 顶出横向滚动时钉在左边。
- **折行固定开启，不提供开关**：右侧面板本来就窄，长行横向滚动比折行更难读。实现约束：折行时 grid 必须是 `w-full`，`w-max` 会让宽度取 max-content、代码列等于「最长行宽」，`pre-wrap` 永远没有折行的机会（这个坑踩过，见执行计划决策记录）。
- **不做复制 / 文件内查找**：两者都是编辑器动作，放在只读预览的每个文件头上性价比太低。要整份内容就用操作栏的「在外部应用中打开」。搜索命中标记那套（`injectMatchMarks` + `mark.act-code-match` 配色）已随之删除，不留未用代码。
- **分块高亮**：超过 4000 行时先同步高亮首 500 行让首屏立刻可读，其余按 1000 行一批在空闲时推进，未高亮的行先按转义纯文本落地（不留空白）。已知代价：跨批的多行 token（块注释）会在批边界断开。行组件必须 `memo` —— 每批都换掉整个数组，不 memo 就等于每批重渲染全部行。
- **渲染行数上限 20000**：每个逻辑行是两个 DOM 节点，2MB 日志有 19 万行 = 38 万节点，实测 5 万行要 13.5s 才打开。超出部分不渲染，并在**内容末尾**（不是顶部）说明还有多少行未显示 —— 用户滚到底发现没了，答案就在原地。这是按行渲染换来行号所必须付的代价（旧的单 `<pre>` 实现不受影响）。

### 文件新鲜度与重新加载（2026-07-30）

文件内容是打开那一刻的快照，磁盘随后可能被 Agent、外部编辑器或 `git checkout` 改掉。检测用**两级信号**，不依赖后台文件监听服务：

1. **Agent 编辑事件**（主力，零新增设施）：`edit_diff` / `write_diff` 消息块自带 `filePath`，renderer 本来就实时收到。
2. **mtime 重校验**（兜底，O(1)）：只在 Tab 激活、窗口重获焦点、turn 结束三个时机各 `statWorkspaceFile` 一次，**不轮询**。

检测到变化只打 stale 标记并显示提示条，内容替换必须由用户点提示条上的「重新加载」触发 —— 用户可能正在阅读或选中文本，内容被自动抽换比看到旧内容更糟。操作栏不再常驻刷新按钮（理由见「Workspace 文件浏览器」的取舍）。

`fs.watch` 实时监听属于 V2 体验增量；真要做时应 watch 已打开文件的**父目录**而非文件本身（Agent 与编辑器常用 rename 原子写，watch 文件路径会丢 inode）。

### CSV 表格预览（2026-07-30）

- 首行当表头，表头 sticky，左侧行号列复用 gutter 样式。
- 解析走小状态机而不是 `split(",")`：字段内的分隔符、引号包裹、`""` 转义、CRLF 都要处理对 —— 错位的表格比纯文本更误导人。`.tsv` 按 `\t` 切。
- 行数不齐时按最大列数补空，单元格不会串列。
- 超过 2000 行只渲染前 2000 行并提示；解析不出多列时降级为纯文本视图并说明原因；随时可切「以纯文本查看」。

## Markdown 渲染

右侧面板是正式 Markdown 渲染栈的入口，聊天消息区是否迁移到同一栈属于 V2。

V1 渲染栈：

- `react-markdown` + `remark-gfm`，支持表格、任务列表、删除线和自动链接。
- `rehype-highlight` 负责同步代码高亮；Shiki 作为 V2 可选升级。
- fenced code 的语言集显式传 `languages`，与 `CodeRenderView` 共用 `right-panel/highlight.ts` 的那一份，而不是沿用 lowlight 默认的 `common`：后者缺 dockerfile / protobuf / dart / cmake / powershell 等，与代码 Tab 覆盖面不一致。这里换不来体积（`rehype-highlight` 无条件静态 import 了 `common`，摇不掉）。
- 不引入 `rehype-raw`，Markdown 中的原始 HTML 不直接执行。
- 链接只放行 `http` / `https` / `mailto`，外链使用 `target="_blank" rel="noreferrer"`。
- 复用 `.markdown-prose` 和 `styles/markdown.css`，代码块使用 `markdown-code-block`。
- 预览 / 源码 两态切换，切换状态只属于当前 Tab。**工作区文件**的切换按钮在 Workspace 操作栏上（对齐 Cursor 的 `View source` / `View preview`），视图本身不再挂工具栏；聊天生成的 markdown / html 没有操作栏，仍用视图内那组分段控件。同一个组件按受控（传 `mode` + `onModeChange`）/ 不受控自动切换这两种壳，状态按 Tab 记在 `RightPanelContext`。

代码高亮配色必须随浅 / 深主题翻转。`hljs-*` token 颜色使用主题 token 或专用 CSS 变量，禁止写死 `#hex`、`text-black`、`bg-white` 这类非主题感知字面量。

V1 不做数学公式、Mermaid、TOC、标题锚点、原始 HTML 内联和聊天区解析器迁移。

## HTML 渲染与沙箱安全

HTML 来源包括本地 `.html` 文件、聊天生成 HTML、Markdown 回复转 HTML 的可视化产物。HTML 默认视为不可信或半可信，必须经过 iframe sandbox 与 CSP 双闸。

关键规则：

- 整页 HTML 一律使用 `<iframe srcDoc={html} sandbox="allow-scripts">` 渲染。
- `srcDoc` 路径绝不同时开启 `allow-scripts` 与 `allow-same-origin`。
- renderer 不使用 `<webview>`，不向预览 iframe 暴露 preload、`window.actspace`、Node 或文件系统能力。
- CSP 注入到 `srcDoc` 的 `<meta http-equiv>`。
- `strict`（本地文件默认）：禁外联，只允许 data/blob 图片、inline style、data 字体和 inline script。
- `relaxed`（聊天生成 HTML 或用户主动信任外部静态资源）：允许 https 图片 / 样式 / 字体 / 脚本，但 `connect-src 'none'`，阻断数据外传。
- iframe 只允许单向 `postMessage` 回传运行时错误和布局尺寸；父窗口校验 `event.source === iframe.contentWindow` 后处理。
- iframe 同时回传内容宽度与自身视口宽度。内容宽度超过视口时视为固定画布：父层锁住自然画布宽度，只做等比缩小、不放大，并用缩放后的宽高承担布局占位；普通响应式页面继续使用 `width: 100%`。预览区、右侧面板或文件树宽度变化时由父层 `ResizeObserver` 重新计算比例，避免固定宽 HTML 被裁切或产生横向滚动。
- 注入最小 `color-scheme: light dark;` 基线样式，不强行覆盖产物自带样式。

聊天行内 HTML 小片段先用 DOMPurify 净化；需要脚本或复杂结构时升级为 iframe 路径。V1 不支持相对资源、多文件 artifact、页面内导航、keep-alive 池、双向交互桥或 CDP。

V2 方向：注册独立 origin（自定义协议或本地端口）、受控 `localResourceRoots`、安全打开 `allow-scripts allow-same-origin`、支持相对资源、多文件产物、截图 / inspect / 调参和更细 CSP nonce。

## Workspace 文件浏览器

右侧面板提供一个轻量的 Workspace 文件浏览器：树 rail 常驻在浏览态**右**栏，点文件在其左侧以普通 Tab 打开。树根来自顶部 Workspace 选择器的当前选择；发送消息前该选择只停留在 renderer 本地状态，发送时才写入当前 session 的 `workspaceRoot`，随后与 Agent 文件工具操作的根一致。

结构为纵向三段（2026-07-30 对齐 Cursor 重排）：

1. Tab 条横跨整条右面板。
2. Workspace 操作栏：**左**是面包屑 `<workspace 名> › <相对路径>`（根名弱化、文件路径主色），**右**是「查看源码 / 查看预览」文字按钮（仅 markdown、html 这类渲染态之外还有源码的文件出现）+ 两个图标动作 ——「在外部应用中打开」与「收起 / 展开文件树」（文件夹图标，展开态用 `bg-selected` 表示）。下方按需挂「已变更」与「已截断」两条提示条。
3. 两栏 `[文件预览区 | 文件树]`，文件树无独立头部；树顶有文件名过滤框与刷新按钮。

这一层的取舍：

- **文件树放右栏**，让预览区紧邻中间聊天区 —— 视线从消息移到代码不用跨过一条树栏，且树作为导航件靠外侧更符合「主内容居中」的重心。
- **操作栏只放两个动作**，刻意去掉了常驻的「重新读取当前文件」按钮：需要重新读取的真实场景只有「文件已变更」，而那时下方的 stale 提示条自带「重新加载」。常驻一个几乎不会被点的刷新图标只会让这一层看起来像第二条工具栏。文件树自己的刷新按钮保留（它刷的是目录列举缓存，是另一件事）。
- **过滤框常态无边框无填充**，只在 hover / 聚焦时浮出底色。200px 窄栏里，输入框边框会和下方每行树项的缩进线抢视觉层级，把最该看清的文件名压下去。
- **「查看源码」用文字而不是图标**，且显示的是**目标态**而不是当前态：这一层已经有两个 icon 按钮，第三个图标会让人分不清哪个是模式切换；单个文字按钮点一下去对面，比分段控件省一半宽度。它必须要求当前 Tab 有 `relativePath` —— 浏览态下激活的可能是聊天生成的 markdown（内容区显示的是占位页），那时按钮点了没有任何视图会响应。

呈现由当前 Tab 决定：

- 激活工作区文件 Tab（文件类且有 `relativePath`）时进入 shell。
- 激活对象 Tab（Context / Reply / 聊天生成 HTML 等）时退出 shell，整面板展示对象视图。
- `isFileTreeOpen` 表示显式进入浏览态；`isFileTreeCollapsed` 只折叠树栏，不关闭内容区。

树状态规则（2026-07-30）：

- 展开层级与目录列举缓存都**提升到 `RightPanelContext`**，不放在 `WorkspaceFileTree` 里 —— 该组件会随树栏折叠、切到对象 Tab 反复挂载卸载，状态留在组件里会被反复清空。
- 「上次是哪个 workspaceRoot」同样记在 Provider（`{ known, root }`）。只有 root **真的变化**才清空展开层级；`known: false` 表示还没有树挂载过，此时同步 root 不算换根。若把它记成组件内的 ref，重挂载时 ref 一起重建，每次挂载都会误判成换根，等于这层状态白提升。
- 过滤框只作用于**已加载层级**，不做递归搜索（跨文件快速打开属于 V2）。
- 当前打开的文件在树里高亮。

### 在外部应用中打开（2026-07-30）

操作栏右侧的外部打开入口使用共享的工具目录（`workspace-open:list-tools` / `workspace-open:open`），但目标是**当前文件**而不是 workspace 根：`WorkspaceOpenInput` 增了可选 `relativePath`，越界按 `escapes_root` 拒绝 —— 这个入口来自可点 UI，和文件浏览器同一条边界，不因为「只是调 `/usr/bin/open`」就放开整盘。

不同工具能接受的目标形态不同，main 侧按工具分派，三条各有单测锁住实际参数：

| 工具 | 传给 `open` 的目标 | 原因 |
| --- | --- | --- |
| VS Code / Cursor | 文件本身 | 编辑器就是用来打开文件的 |
| Finder | `open -R <文件>` | `-a Finder <文件>` 会用**默认应用运行**这个文件，不是定位它 |
| Terminal / iTerm2 | 文件的**父目录** | 终端只能接目录，给它文件等于让终端去执行/打开它 |

交互约定：图标点击后先出菜单、选中应用才真正打开，不做「点图标直接用上次的应用打开」—— 这一栏图标很小，误触会直接拉起外部程序。选择记在 localStorage，菜单里用「上次」标出。无 preload 时整个按钮不渲染，而不是渲染一个点了报错的按钮。顶部 chrome 不再提供 workspace 外部应用打开入口，避免与右侧文件级入口重复。

IPC 契约：

```ts
type WorkspaceListDirInput = {
  workspaceRoot?: string;
  relativePath?: string;
};

type WorkspaceDirEntry = {
  name: string;
  relativePath: string;
  kind: "dir" | "file";
  size?: number;
};

type WorkspaceListDirResult = {
  root: string;
  relativePath: string;
  entries: WorkspaceDirEntry[];
  error?: "not_found" | "not_a_directory" | "escapes_root" | "too_many_entries";
};

type WorkspaceReadFileInput = {
  workspaceRoot?: string;
  relativePath: string;
};

type WorkspaceFileRenderKind = "markdown" | "html" | "image" | "csv" | "text";

/** 文本预览字节上限。定义在契约层：main 用它决定读多少，renderer 要在提示条里复述同一个数。 */
const WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES = 2 * 1024 * 1024;

type WorkspaceReadFileResult = {
  relativePath: string;
  renderKind: WorkspaceFileRenderKind;
  content?: string;
  dataUrl?: string;
  language?: string;
  /** 磁盘上的完整字节数，不因截断变小。 */
  size: number;
  /** 文本超限，`content` 只含上限内的完整行；消费方必须显式告知用户内容不完整。 */
  truncated?: boolean;
  /** 最后修改时间（epoch ms），供已打开 Tab 做新鲜度比对；错误分支为 0。 */
  mtimeMs: number;
  error?: "not_found" | "not_a_file" | "too_large" | "binary" | "escapes_root";
};

/** 只取 size 与 mtime，不读内容；供三个时机的 O(1) 新鲜度重校验使用。 */
type WorkspaceStatFileInput = {
  workspaceRoot?: string;
  relativePath: string;
};

type WorkspaceStatFileResult = {
  relativePath: string;
  size: number;
  mtimeMs: number;
  error?: "not_found" | "not_a_file" | "escapes_root";
};

/** 在外部应用中打开。`relativePath` 为空表示打开 workspace 根本身。 */
type WorkspaceOpenInput = {
  workspaceRoot?: string;
  toolId: WorkspaceOpenToolId;
  relativePath?: string;
};

type WorkspaceOpenResult = {
  ok: boolean;
  workspaceRoot: string;
  toolId: WorkspaceOpenToolId;
  relativePath?: string;
  error?: "invalid_workspace" | "unsupported_platform" | "not_installed" | "open_failed" | "escapes_root";
  message?: string;
};
```

会话生成图片不属于 workspace 文件树，使用独立 Session Artifact IPC：

```ts
type SessionArtifactReadInput = {
  sessionId: string;
  artifactPath: string;
};

type SessionArtifactReadResult = {
  name: string;
  relativePath: string;
  mimeType?: "image/png" | "image/jpeg" | "image/webp";
  size: number;
  dataUrl?: string;
  error?: string;
};
```

- renderer 不能直接加载 `file://`，开发态 HTTP origin 会被 Electron 拒绝，本地绝对路径也不应成为 renderer 文件读取能力。
- `artifactPath` 是历史字段名，当前实际承载 opaque Artifact ID。main 通过 `DesktopArtifactStore.resolveForSession()` 同时校验 ID、SHA-256、大小、owner session 和真实 store 路径，不接受 renderer 传入任意绝对路径。
- 只允许 PNG / JPEG / WebP，按 Session 引用的 MIME 与 Artifact metadata 一致性确认，单图沿用生成工具 25 MB 上限。
- data URL 按需返回：Turn Artifacts 在用户点击时读取；历史 UserMessage 只为缺失预览的图片 attachment 执行 hydration。data URL 不写入 Journal，也不成为恢复事实。
- 生成图片作为对象 Tab 打开，不带 workspace `relativePath`，避免误进入 Workspace 文件浏览 shell。

完成态 Write/Edit 结果在 tool preview 中携带 workspace root 内的 `outputPath/outputRelativePath`。Turn Artifacts 只用相对路径调用 `readWorkspaceFile()`，并通过共享 `tabFromFile()` 打开右侧 Tab；Assistant Markdown 中无协议的安全相对链接使用同一路径。`..`、工作区外绝对路径和外部 URL 不进入该路由。

main 侧服务规则：

- renderer 不直接访问文件系统；树展开和文件读取都走 preload + IPC。
- 顶部 Workspace 选择器允许用户在发送前多次切换；选择动作不迁移 session，只有发送消息时才把最终选择写入 session meta。
- UI 浏览强约束在 `workspaceRoot` 内，`..` 逃逸返回 `escapes_root`。
- 固定忽略 `node_modules`、`.git`、`.pnpm-store`、`dist`、`.next`、`.turbo`、`coverage`、`.DS_Store`。
- 单目录最多列出 1000 条，目录在前、文件在后，各自按名称升序。
- 文本类上限 `WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES`（2MB），图片类 5MB。**文本超限是部分读**：返回上限内的**完整行** + `truncated: true`，不再整体拒绝（2026-07-30 起）。图片超限仍返回 `too_large`，因为部分图片字节无法解码。
- 图片用 data URL，HTML 文件用 `trust="file"` 的 strict CSP 沙箱。
- text 类语言判定顺序：**完整 basename**（`Dockerfile` / `Makefile` / `.gitignore` / `go.mod` …）→ **basename 前缀**（`Dockerfile.dev`、`.env.local` …）→ **扩展名**；一律确定性映射，不使用 `highlightAuto` 猜测，识别不出就不给 `language`（渲染回退纯等宽 + 行号）。
- 映射值域必须都是 highlight.js 真实存在的语言，两侧各有一条防漂移测试锁住：main 侧断言每个映射值 `hljs.getLanguage()` 拿得到，renderer 侧断言按需注册的实例覆盖 main 的全部映射值。否则文件会静默退回纯文本且没人会发现。（这条测试当场抓出 highlight.js 不内置 `hcl`，`.tf` / `.hcl` 因此映射到 `ini` 近似。）
- `readWorkspaceFile` 与 `statWorkspaceFile` 都返回 `mtimeMs`，供右侧面板的新鲜度比对。

V1 不做写 / 删 / 重命名、`.gitignore` 解析、快速打开、多 root 和 PDF 预览。

## Context 面板

后端数据形状以 [Context 面板后端数据需求](front-Context面板后端数据需求.md) 的当前契约为准。视觉与交互以本节规范、`ContextPanelParts` 当前组件和正式应用为准；旧 HTML 仅为设计过程记录，已备份迁出，见 [原型迁出清单](../retired-html-demos.md)。

Context Tab 回答三个问题：现在占了多少、由哪些条目组成、是怎么变成这样的。它只看占用，不负责读原文：会话里每条消息和工具输入输出的原文在轨迹视图里读，面板只给跳转。面板只读，参考 dsh-context 的信息结构。

### 入口

入口和之前一样：Composer 的 Context 弹层右上角「查看完整上下文」、对象启动页、「+ 新建对象」菜单，三者都打开或聚焦同一个 `context` Tab。

### 六个区块

自上而下排列，宽度跟随右侧面板，360px 时仍需可读。

1. **当前上下文**
   - 标题行右侧显示模型名。
   - 主数字为「≈ 已用 / 上限 tokens」和已用百分比。
   - 分段条按上限缩放，每段一个分类，未用部分是灰色轨道。有自动压缩阈值时，在阈值位置画一条刻度并标「自动压缩 ≈N」。
   - 下方是双列图例：色块、分类名、≈token、占已用百分比。点图例聚焦该分类，分段条和明细里其他分类变淡，再点一次取消。
   - 上限未知时不显示百分比和压缩刻度，分段条改按已用总量缩放。
2. **会话统计**
   - 2×3 格：轮次、步数、压缩次数、缓存命中率、累计 Token、费用。
   - 缓存命中率 = 缓存读 ÷（缓存读 + 未命中输入），累计 Token = 全部请求的输入 + 输出 + 缓存读写，两格都带 `?` 说明口径。
   - `costUsd` 为 null 时隐藏费用格，不自行估算。没有用量数据时，缓存和累计两格显示「—」。
3. **路径**（2026-10-18）
   - 回答「模型现在知道哪些文件」：活跃路径以一行「路径 — 说明」进入模型上下文（不含文件全文），睡眠路径只在索引里、模型仍可按需读取。契约见 [Step 刷新与路径展示交接](front-Context面板Step刷新与路径展示交接.md)。
   - 始终显示：标题、「第 N 压缩周期」和两格统计。活跃格写「n / 100」并带容量条，满额时容量条变警示色，卡片内再加一行「活跃路径已满…」；睡眠格写数量。两格兼当切换，选中格有底线。
   - 只有列表默认收起：两格下方一行小开关「› 显示活跃路径 · N 条」，展开后变成「⌄ 活跃 · 已显示 12 / N」，右侧出现「按目录 / 平铺」胶囊。收起时不请求路径。
   - 行内容：文件图标、文件名、平铺时的目录或分组时的说明、标签（「新」本周期加入；「待唤醒」「将睡眠」是下次压缩的预判）、「读 N」（本周期读取次数）、最近读取的相对时间。路径在工作区内时显示相对路径。悬停出现复制按钮。
   - 点行展开：完整路径（可选中、可复制）和说明、状态、本周期读取、最近读取、加入周期、来源。查看和复制都不读文件、不改变活跃 / 睡眠。
   - 每类先显示 12 项，「再显示 20 项（共 N）」，本地不够时按游标向后端要下一页（每页 50）。
   - 列表末尾注明「导航行已计入「补充上下文」，不重复计 Token」。
   - 预判标签由后端 `ContextPathEntry.nextCompaction` 给出，前端不复刻排序规则；规则在 `@actspace/shared` 的 `selectNextActivePathIds`，引擎压缩和面板预判共用。
   - `disclosure` 为 `unavailable` 时卡片只写「当前会话没有路径记录。」；`ready` 且两类都是 0 时写空态说明。过渡视图（main 返回 `null`）不显示这张卡。
4. **上下文明细**
   - 头部有一个对比开关，用 `ui/Select`，两个选项：「对比上次请求（第 N 轮 · 步 M）」和「不对比」。还没发过请求时没有可对比的基准，开关禁用。
   - 头部下面一行显示 ≈ 估算总量、上次请求的实际输入（服务商返回，有才显示）和条目总数，再下面是一条迷你色条。
   - 分类按 `CONTEXT_BUCKET_REGISTRY` 顺序排列。分类行显示：色块、名称、N 项、项数增减、token 增减、≈token、占比。
   - 打开时默认展开「工具」和「会话内容」两类。每类先显示 12 项，底部「再显示 20 项（共 N）」。
   - **非会话分类**：
     - 超过 3 项时出现搜索框和排序（按大小 / 按名称）。「工具」分类另有来源 chip，例如内置、MCP 服务名。
     - 条目行显示：标题、来源、新增 / 已移除标记、单条 token 增减、占本类的小进度条、≈token。
     - 点条目行展开预览：顶部一行写占本类和占全部的比例，下面是预览原文加「复制」。
     - 对比模式下，上次请求里有、本次没有的条目以删除线列在本类末尾。
   - **会话内容**：只列清单，不展开原文。
     - 每行显示：类型标签（用户 / 助手 / 工具调用 / 工具结果，思考段标「助手 · 思考」）、标题、新增标记、占比条、≈token。
     - 没有搜索框和排序，固定最新在前。保留类型 chip（可多选，带数量）。
     - 整行点击跳到轨迹里的对应记录，悬停时行尾出现 ↗。
     - chip 行右侧放「在轨迹中打开 ↗」，只选中一个类型时文字变成「在轨迹中打开最新<类型>」。
     - 条目没有子类型时（过渡数据源）不显示类型 chip；没有轨迹身份时这一行不可点。
5. **上下文趋势**
   - 每次请求一根柱：柱高是估算总量，柱内按分类分段。
   - 压缩发生的那次请求之前画分隔，轴上写「✂ 压缩 −N」。
   - 悬停柱子时，在图表上方显示一行说明：第 N 轮 · 步 M、≈估算、实际输入。不为每根柱子挂 Tooltip。
   - 柱子太多放不下时横向滚动，打开时滚到最右（最新）。
6. **上下文事件**
   - 按时间倒序列出注入、压缩、工具集变化、模型切换、模式切换。
   - 每行显示：类型标签、描述、轮次 / 步数位置、token 增减（增绿减红；模型切换这类没有增减的留空）。

### 数据来源

- 面板主数据走 `sessions.describeContextPanel({ sessionId })`，返回 `ContextPanelView`，类型定义在 `packages/shared/src/context-panel.ts`，形状与后端数据需求 §2 一致。这个查询由 Context 引擎 V2 的后端实现。实现之前，main 一律返回 `null`。
- 返回 `null` 时，renderer 用现有数据拼一个过渡视图：
  - ① 来自 `sessions.describeContext` 的 `ContextState`。
  - ② 来自会话 projection 的 `activity` 和 `usage`，这部分已经是真实数据。
  - ③ 只有当前条目：没有对比，会话内容没有子类型，也没有轨迹身份。
  - 路径、趋势、事件不显示，面板底部用一行说明：「趋势、事件和路径需要后端数据，暂未提供」。
- 浏览器 mock 的 `describeContextPanel` 返回完整数据，包括对比、趋势、事件和路径（87 活跃 / 342 睡眠），用来验收完整界面；`?mock=context-pagination` 另有活跃满 100、睡眠 1284 条多页、每页 400ms 延迟、首次读睡眠失败一次的路径场景。
- 会话 projection 的 `throughJournalSeq` 变化时重新拉取，返回结果按 `throughJournalSeq` 丢弃比当前旧的。拉取失败时面板顶部显示中文失败说明和「重试」，已显示的数据保留；原始技术错误放在可展开的「错误详情」中并允许换行，不能让 IPC 通道名前缀挤掉可操作的说明。
- 非会话条目的「展开全文」查询（`sessions.readContextEntry`）等后端提供，本期展开的内容就是 `preview`。

### 跳到轨迹

- 会话行和「在轨迹中打开」调用 `revealInTrajectory(target)`。它由 `WorkbenchLayout` 通过 Context 提供，作用是把中间区域切到轨迹视图，用的是和标题栏「查看执行轨迹」按钮同一份按会话记忆的状态。右侧面板保持打开。
- 目标与轨迹记录的对应关系：

| 面板目标 | 轨迹记录 |
| --- | --- |
| `{ callId }`（工具调用 / 工具结果） | `kind === "tool"` 且 `callId` 相同 |
| `{ messageId }`（用户 / 助手 / 思考） | `messageId` 相同 |
| `{ latest: "user" \| "assistant" }` | 最后一条该 kind 的记录 |
| `{ latest: "tool-call" \| "tool-result" }` | 最后一条 `kind === "tool"` 的记录 |
| `{ latest: null }` | 最后一条可见记录 |

- 轨迹视图收到目标后，复用现有的选中逻辑：展开所在 Turn 和 Call，滚动到该记录并选中，右侧详情随之打开。
- 找不到目标时，轨迹顶部显示一行可关闭的说明：「没有在已加载的轨迹里找到这条记录」。如果还有更早的历史没加载，说明里补一句可点「Load earlier history」。

### Composer 弹层对齐

- 弹层与面板共用 `R/context-format.ts` 的格式函数：token 统一用「≈」加 K / M，百分比不足 1% 时写「<1%」。
- 分类行补上占已用的百分比。
- 压缩次数从 projection 的 `activity.compactionCount` 接入，原来写死为 0。

### 不做

- 编辑上下文：pin、移除、包含 / 排除。
- 历史请求原文浏览与切换。
- 文件活动、耗时统计。
- 子 Agent 的 Context。
- 导出：旧视图的「导出 .md / .json」随这次重做去掉。会话原文已改到轨迹里看，导出出来的东西不完整；需要时再在明细头部加回。

## 消息可视化转换（Markdown -> HTML）

助手回复上的「可视化」按钮把该条回复的 Markdown 用主模型转换成自包含 HTML，然后在右侧 HTML Tab 渲染。

核心约束：转换是一次真实模型调用，成本高，必须缓存。第一次点击才生成并持久化，之后命中缓存直接渲染。

入口与状态：

- `TurnActions` 的「...」按钮左侧放可视化按钮。
- `idle` / `error` 用 `Wand2`，`generating` 用旋转 `Loader2`，`ready` 用 `Eye`。
- 状态机：`idle -> generating -> ready`；失败进入 `error` 可重试。
- 已生成内容提供显式「重新生成」入口，只有显式触发才重算。
- 输入只取当前 turn 的最终可见回复段；工具执行过程、工具间旁白和更早会话历史都不进入转换内容。

缓存与数据流：

- 缓存键 = `messageId | turnId` + `sourceHash`。
- sidecar 存 HTML、sourceHash、model、generatedAt、usage 和派生 title。
- renderer 点击 -> typed IPC -> main Host 的 v2 Runtime Projection / LLM service 解析当前模型和仅 main 可见的 credential reference -> Runtime 生成受控 artifact / projection -> renderer 打开或聚焦 HTML Tab。Desktop 路径不得回退到旧 Agent Core builder 或依赖环境变量读取 LLM Key。
- `visualize:list({ sessionId })` 读取同一 sidecar，供 Reply 聚合视图按 createdAt 倒序浏览本会话全部产物。
- usage 计入使用统计；缓存命中不新增模型调用。

生成提示词要求输出单个自包含 HTML 文档；如果模型输出 ```html 围栏，解析围栏内内容。`stopReason=error/aborted/length/toolUse`、空输出、缺少 doctype 或缺少 `</html>` 都按失败处理且不得写入缓存；历史空缓存不命中，也不出现在 Reply 聚合列表。产物按半可信处理，一律走 HTML sandbox 路径，不因为「是自己模型生成的」就放宽权限。

## 首版边界

- 先支持 `md`、`html`、`图片` 三种文件预览优先级。
- Git-first Review 作为第二主线；无 Git 时提示创建 Git repository，`Last Turn` 当前未接通数据源，显示不可用状态；不能用聊天工具 diff 冒充该 scope 已实现。
- 其他类型后续再补，不抢首版设计重点。

## Review / Diff 展示边界

- 聊天区继续保留单次工具调用或编辑动作的局部 diff；Review Workbench 负责跨文件、跨 scope 的完整审阅。
- Composer、Environment 和右侧对象菜单都可以打开 Review；入口去重到同一 workspace Review 实例。
- 完整 Review 直接渲染在右侧对象面板，聊天主区和 Composer 保持可用。
- `Uncommitted`、`Unstaged`、`Staged`、`Committed`、`Branch` 使用真实 Git 数据；`Last Turn` 当前未注入查询实现，必须如实显示不可用。
- Review 内部以单列 Diff Canvas 为主；Changed Files 在 Review 容器不小于 `560px` 时停靠于右侧，更窄时切换为独占内容区的文件列表。它不使用遮罩覆盖 Diff；大 diff 继续按单文件与 capped 策略加载。
- 不换行时，Diff Canvas 是唯一的横向滚动所有者，行号、增删标记和代码随 Canvas 同步移动；禁止给每个 `<code>` 行单独设置横向滚动。开启 word wrap 后 Canvas 回到面板宽度并由代码列折行。
- unified/split、上下文折叠、Jump to file、viewed、Review Options 和 Git actions 的完整规则以 `docs/design-docs/core-review-change-sources.md` 为准。

## Subagents（2026-09-06）

右侧对象面板新增 Subagents tab，按当前 Session 隔离列表，分 Running / Done；任务行显示描述、状态、持续时间。点击在同一个 tab 内打开执行详情，顶部返回列表。聊天中的 Agent 条目也打开此视图；本轮首次出现子任务时自动打开，用户关闭后不因后续更新重复抢焦点。

列表通过 `getSubagents` 每秒更新；详情通过 `getSubAgentTranscript` 读取规范 SessionEvent，运行中每 750ms 更新。组件卸载、切任务或切会话时取消后续刷新，迟到响应不更新新视图。详情复用会话 MessageBlock 渲染，支持正文、Thinking 和工具，不再附着在 Composer 上方。

## 侧边对话（2026-10-21）

设计见 `docs/design-docs/collaboration/side-chat-design.md`。右侧面板 Tab 类型 `sideChat`：`{ id: "side-chat:<sessionId>", title, sessionId, parentSessionId, inheritedTurnCount?, runningTurnExcluded? }`。视图为 `right-panel/side-chat/SideChatView.tsx`，外包 `SessionProjectionScope`（`session/SessionProjectionContext.tsx`）：通过 `bridge.watch` 给非选中会话一份投影，复用外层 store / bridge，不改变当前选中会话。

### 启动页与 `+` 菜单

- 启动页入口「侧边对话」，说明「另起一条线问，带上目前为止的上下文」；`+` 菜单里「侧边对话」排第一。
- 启动页另有分组「本会话的侧边对话 · 已收起」，列出本主会话下当前没有打开 Tab 的侧边对话（`sessions.listSideChats`），每项带「N 分钟前更新」等相对时间；点击重新打开为 Tab。
- 仅本地运行目标显示；远端目标隐藏入口。
- 打开失败时错误显示在主 Composer 的 notice：「主会话还没有完成的一轮…」/「侧边对话里不能再开侧边对话。」/「主会话暂时不能分出侧边对话，请稍后再试。」/「侧边对话没有打开，请重试。」

### Tab 规则

- Tab 栏只显示 `parentSessionId` 等于当前主会话的侧边对话；切换主会话后它们隐藏，若激活的是侧边对话则回到启动页。
- 图标：空闲为 GitFork，否则显示会话状态点（running / approval / unread / failed，复用 `SESSION_STATUS_META`）。
- 标题：侧边对话自己的会话标题（与父标题、`New chat` 不同时）；否则首个用户问题（最多 40 字）；再否则「侧边对话 N」。首次提问时视图会把会话重命名为该问题（`runtime.rename`），让已收起列表能认出它。
- 关闭按钮动词为「收起」：只收起 Tab，侧边对话仍保存。

### 面板内容

- 消息流顶部是居中的小分隔线（随内容滚走，不做框和按钮）：「继承主会话 N 轮」；打开时主会话正在运行则为「继承主会话 N 轮，不含进行中的第 N+1 轮」；重新打开的 Tab 从窗口计数（无后缀），数不出时为「继承主会话的上下文」。
- 继承的消息不显示：隐藏 `sourceSeq ≤ lineage.parentBoundarySeq` 的 block 及这些 run 的合成 block。
- 空状态「在这里另起一条线问，不打断主会话」，附 Plan 提示。「加载更早的消息」只针对分叉后的历史。
- Composer：surface 为 followup，默认 Plan（只读）模式；模型初始为主会话模型，可按侧边对话单独切换（存 `SessionLocalStore.selectedModelId`）；有权限模式控件；无消息队列（运行中输入锁定，按钮变停止）；无轮次导航、轨迹和批注。
