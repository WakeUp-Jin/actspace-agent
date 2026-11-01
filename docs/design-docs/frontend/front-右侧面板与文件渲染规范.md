# 右侧面板与文件渲染规范

> 2026-09-09 文案更新：日常界面展示名称以[中文文案规范](front-desktop-chinese-ui.md)为准；保留 Chat、Plan、Thinking、Effort 和工具执行展示。本文英文名称仍可用于指代内部概念，协议与行为不变。

## 定位

右侧面板是当前会话的对象浏览工作区，用于阅读工作区文档、预览结果和查看「改动」（Review）。

它属于聊天态工作台的可调对象区；右侧开关、宽度边界和中间聊天区保护规则见 `工作台布局与面板交互规范.md`。

## 文档范围

本文是右侧对象浏览区的单一前端事实来源，覆盖面板外壳、对象启动页、Tab 系统、文件打开与渲染、Markdown 渲染栈和 Context 面板；工作区 Markdown 的树、阅读与编辑见[文档面板规范](front-文档面板规范.md)。Review 作为右侧对象 Tab 直接在面板内展示；五种 scope、upstream Branch、结构化 diff 和 Review Options 统一见 `docs/design-docs/core-review-change-sources.md`。工作台左右面板 resize、collapse 和标题栏让位仍见 `docs/design-docs/frontend/front-工作台布局与面板交互规范.md`；颜色硬约束见 `docs/design-docs/frontend/front-主题与配色规范.md`。

## 交互模型

- 顶部使用横向 Tab：在 44px chrome 行内垂直居中，Tab 高 30px、圆角 8px、字号 13px；标题左侧留白与右侧关闭按钮间距均为 10px，相邻 Tab 间距 4px。关闭按钮始终保留位置，悬停显现不改变标签宽度。
- 每个 Tab 对应一个对象实例，不对应固定页面。
- 点击消息中的文件、链接、图片或 diff 时，在右侧打开对应 Tab。
- 支持多个 Tab 并列打开与切换。
- 首版重点只保留文件预览和 Git-first Review 两条主线。
- 面板打开后允许调整宽度，关闭后把宽度归还给中间聊天区。
- 首版关闭右侧面板时不保留右侧 rail。
- 右侧 Tab 行位于隐藏标题栏 chrome 的同一高度区间，必须保证 tab 按钮能高于 `.chrome-center` 拖拽区接收点击；同时继续给右上角 PanelRight 按钮预留 padding，避免 tab 命中区压住关闭右侧面板入口。
- 没有对象 Tab 时，Tab 行仍显示稳定的面板身份：默认显示 `Objects`，打开「文档」后显示 `文档`；不能让右栏顶部只剩一组悬空图标。
- `<= 600px` 且右侧面板作为全宽覆盖层时，Tab 行左侧必须避开 macOS 窗口控制与左侧 chrome 入口；全局中间标题 / Workspace 操作同时退场，不能覆盖 Tab 命中区。

## 对象启动页（2026-07-17）

右侧面板没有打开对象时，不默认塞入业务 Tab，而是展示一个参考 Cursor 空面板入口密度的对象启动页。启动页只借用“方块入口 + 大留白”的形式，入口名称与数量由 Actspace 当前真实对象决定。

当前固定展示四个入口，另有「侧边对话」入口与已收起列表（见「侧边对话」一节）：

- `文档`：打开「文档」面板，创建或聚焦稳定的右侧文档 Tab（id 固定为 `docs`，见[文档面板规范](front-文档面板规范.md)）。
- `改动`：打开当前 workspace 的 Review（界面名称 2026-11-01 起叫「改动」），并创建/聚焦稳定的右侧 Review Tab。
- `Context`：打开主 Agent 当前会话的 Context 面板 Tab（占用、路径、明细、趋势和事件，只读）。

布局与状态规则：

- 默认宽度下使用双列网格，入口数量为奇数时最后一个自然落在最后一行，不保留空占位。
- 卡片使用中性 surface、语义边框和统一 Lucide 线性图标；当前状态使用中性 selected 层级，focus-visible 使用高对比主题 token，颜色只承担语义状态或数据可视化，不把各入口做成彩色功能卡。
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

- `Docs`：「文档」面板（工作区 Markdown 的树 + 预览 / 源码编辑），单一实例，id 固定为 `docs`。Markdown 不再生成独立的文件 Tab。
- `Image`：图片渲染。
- `Text`：说明文字（读取失败、远端 Host 文本预览等），用 `CodeRenderView` 显示，见「代码视图能力」。本机工作区里的代码、HTML、CSV 等文件不再生成 Tab，见「文件打开路由与兜底对话框」。
- `Review`（界面名称「改动」）：完整代码审阅工作台入口；只查看改动（2026-11-01 起不含暂存、还原、已查看、复制 apply、创建 PR 和「最近一轮」），具体契约见 `docs/design-docs/core-review-change-sources.md`。
- `Context`：Context 面板；见本文「Context 面板」一节。
- `sideChat`：侧边对话；见「侧边对话」一节。

## 「+ 新建对象」菜单（2026-05-30，2026-06-04 补 Review）

- 隐藏标题栏 chrome 右段、右侧折叠（PanelRight）按钮**左侧**放一个 `+` 按钮（参考 Cursor 顶栏的 +）。
- 点开是一个轻量菜单，可往右侧面板新增对象：`侧边对话`（排第一，仅本地运行目标）/ `文档` / `改动` / `Context`。对象 Tab 使用稳定 id 去重（重复打开只聚焦或刷新，不堆叠）。`文档` 打开单一的「文档」Tab（id `docs`）。
- `改动` 入口复用 Composer 的 Review 打开逻辑，首次默认选择当前 workspace 的 Git `Uncommitted` scope；后续打开恢复该 workspace 最近 selection。
- 菜单与右侧折叠按钮同属 chrome-right，`-webkit-app-region: no-drag`。
- **`+` 仅在右侧面板打开时显示**（`view === "chat" && isRightPanelOpen`）：`+` 的语义是「往面板里加对象」，面板关着时无意义；面板关闭时 chrome-right 只保留 PanelRight 折叠按钮。

## 文件渲染规则

应用内只渲染 **Markdown 和图片**，其余文件交给系统（2026-11-01 功能减法 P3，设计见 `docs/design-docs/架构优化/01-功能减法设计.md` 第 2 节）。

- `md` / `markdown`：默认渲染为可读文档，可切源码；源码态复用 `CodeRenderView`（有行号、有 markdown 高亮），不是裸 `<pre>`。
- `图片`（png、jpg、jpeg、gif、webp、svg）：直接预览，超过 5MB 提示过大。
- `html` / `htm`：不在应用内渲染，交给系统默认浏览器。HTML 渲染视图和 iframe 沙箱已删除。
- 其他所有文件（含代码、CSV、PDF）：交给系统默认应用，main 的 `readWorkspaceFile` 只返回 stat（`renderKind: "external"`），不读内容。
- `review` / `diff`：进入完整 Review Workbench；结构化 file/hunk/line renderer 共用，不放在单条消息里替代消息流中的局部 diff。

### 文件打开路由与兜底对话框（2026-11-01）

所有「点一个本机工作区文件」的入口（交付卡主体、本轮改动的「打开整个文件」、聊天里的文件链接和读文件工具行）都走同一个路由 `components/files/open-workspace-path.ts`，组件里经 `useOpenWorkspacePath()` 调用：

| 扩展名（大小写不敏感） | 行为 |
|---|---|
| `.md` / `.markdown` | `workspaces.readFile` 后打开 `markdown` Tab |
| `.png` `.jpg` `.jpeg` `.gif` `.webp` `.svg` | `readFile` 后打开 `image` Tab |
| 其他（含 `.html` / `.htm`） | `workspaces.openFile({ action: "open" })`，即系统默认应用 / 默认浏览器 |

远端 Host 会话不经过这个路由，仍用 `hooks/remoteArtifact.ts` 的文本 / 图片预览。

**打不开时的兜底。** macOS 上 `shell.openPath` 对没有关联应用的文件返回 `Failed to open path`（2026-11-01 实测，系统不弹框）。main 把这个错误映射为 `no_application`，路由返回 `{ ok: false, reason: "no_app" }`，`OpenFileFallbackProvider`（挂在 `WorkbenchLayout` 内）弹出 `OpenFileFallbackDialog`：

- 标题「没有可以打开「文件名」的应用」；
- 「选择应用打开」：用 `useFileApplications` 列出关联应用，选中后 `openFile({ action: "open", applicationId })`；列表为空时整块不显示；
- 「在 Finder 中显示」：`openFile({ action: "reveal" })`；
- 一行「推荐安装 VS Code 打开代码文件」加下载链接，只在 `listOpenTools` 明确返回 VS Code `available: false` 时出现。

只在用户点了却打不开的那一刻出现；不在启动时检测软件。调用方拿到 `no_app` 不需要再提示，只需要处理 `reason: "error"`。

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

检测到变化只打 stale 标记并显示提示条，内容替换必须由用户点提示条上的「重新加载」触发 —— 用户可能正在阅读或选中文本，内容被自动抽换比看到旧内容更糟。操作栏不再常驻刷新按钮（需要重读的真实场景只有「文件已变更」，那时提示条自带「重新加载」）。

> 2026-11-01：Markdown 已改在「文档」面板里读写，新鲜度由 `docs/use-docs-draft.ts` 实现同一套两级信号（Agent 编辑事件 + 挂载 / 窗口聚焦 / turn 结束时的 `statFile`），并带上未保存草稿的处理，见[文档面板规范](front-文档面板规范.md)「新鲜度」。本节其余内容现在只适用于图片 Tab 和远程 Host 的文件 Tab。

文件已删除、变为目录或符号链接逃出工作区时，`statFile` 返回的 `not_found`、`not_a_file`、`escapes_root` 也是快照失效信号，必须显示过期提示并提供显式重新加载。重读后显示已有的文件不可用说明，不继续把旧正文当作当前文件。检测及重读均使用 Tab 绑定的工作区，不能误标另一个工作区的同路径文件。临时 IPC 异常保留快照，等待下一次既有触发重查，不作为确定的文件失效。 读盘结果转换只从目标提取 `workspaceRoot` / `hostId`；调用方可能传入整个旧 Tab，不能展开目标对象而把旧正文、渲染类型或截断状态混入新结果。

`fs.watch` 实时监听属于 V2 体验增量；真要做时应 watch 已打开文件的**父目录**而非文件本身（Agent 与编辑器常用 rename 原子写，watch 文件路径会丢 inode）。

## Markdown 渲染

右侧面板是正式 Markdown 渲染栈的入口，聊天消息区是否迁移到同一栈属于 V2。

V1 渲染栈：

- `react-markdown` + `remark-gfm`，支持表格、任务列表、删除线和自动链接。
- `rehype-highlight` 负责同步代码高亮；Shiki 作为 V2 可选升级。
- fenced code 的语言集显式传 `languages`，与 `CodeRenderView` 共用 `right-panel/highlight.ts` 的那一份，而不是沿用 lowlight 默认的 `common`：后者缺 dockerfile / protobuf / dart / cmake / powershell 等，与代码 Tab 覆盖面不一致。这里换不来体积（`rehype-highlight` 无条件静态 import 了 `common`，摇不掉）。
- 不引入 `rehype-raw`，Markdown 中的原始 HTML 不直接执行。
- 链接只放行 `http` / `https` / `mailto`，外链使用 `target="_blank" rel="noreferrer"`。
- 复用 `.markdown-prose` 和 `styles/markdown.css`，代码块使用 `markdown-code-block`。`.markdown-doc` 把网格列设为 `minmax(0, 1fr)`，宽表格放进 `.markdown-table-wrap` 横向滚动，不撑宽整篇正文。
- Mermaid：闭合的 ` ```mermaid ` 围栏复用聊天区的 `MermaidDiagramBlock` 渲染成图，未闭合的围栏仍按代码块显示。
- 长文档按顶层块切分（`splitMarkdownBlocks`），每块 `memo`，编辑草稿时只重渲染改动的那一块。
- 渲染入口是 `MarkdownPreviewBody`（只含正文，不含滚动容器），由「文档」面板使用；预览 / 源码 的切换、大纲、编辑都在文档面板里，见[文档面板规范](front-文档面板规范.md)。原来的 `MarkdownRenderView` 工具栏壳已删除。

代码高亮配色必须随浅 / 深主题翻转。`hljs-*` token 颜色使用主题 token 或专用 CSS 变量，禁止写死 `#hex`、`text-black`、`bg-white` 这类非主题感知字面量。

V1 不做数学公式、标题锚点、原始 HTML 内联和聊天区解析器迁移。大纲在文档面板的浮层里，不是常驻 TOC。

## Workspace 文件浏览器（已由「文档」面板取代）

2026-11-01 起，右侧面板不再有通用的工作区文件树，唯一的文件阅读入口是只列 Markdown 的「文档」面板：布局、树、搜索、绿点、预览 / 源码编辑、新鲜度、空状态都见[文档面板规范](front-文档面板规范.md)。原来的树、`listDir` IPC、树状态（展开层级、目录列举缓存）和 shell 呈现规则随功能减法 P4 一并删除。

保留下来的是文件 Tab（图片、远程 Host 文本）上方的 Workspace 操作栏：左边是面包屑 `<workspace 名> › <相对路径>`，右边是「在外部应用中打开」菜单，下方按需挂「已变更」提示条。它不再有文件树开关和预览 / 源码切换。

### 在外部应用中打开（2026-07-30）

文件 Tab 操作栏右侧的外部打开入口使用共享的工具目录（`workspace-open:list-tools` / `workspace-open:open`），但目标是**当前文件**而不是 workspace 根：`WorkspaceOpenInput` 增了可选 `relativePath`，越界按 `escapes_root` 拒绝 —— 这个入口来自可点 UI，和文件浏览器同一条边界，不因为「只是调 `/usr/bin/open`」就放开整盘。

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

type WorkspaceFileRenderKind = "markdown" | "image" | "external";

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

会话生成图片不属于工作区文件，使用独立 Session Artifact IPC：

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
- 生成图片作为对象 Tab 打开，不带 workspace `relativePath`，避免被当成工作区文件处理。

完成态 Write/Edit 结果在 tool preview 中携带 workspace root 内的 `outputPath/outputRelativePath`。Turn Artifacts 只用相对路径调用 `readWorkspaceFile()`，并通过共享 `tabFromFile()` 打开右侧 Tab；Assistant Markdown 中无协议的安全相对链接使用同一路径。`..`、工作区外绝对路径和外部 URL 不进入该路由。

main 侧服务规则：

- renderer 不直接访问文件系统；文档清单、文件读取和保存都走 preload + IPC。
- 顶部 Workspace 选择器允许用户在发送前多次切换；选择动作不迁移 session，只有发送消息时才把最终选择写入 session meta。
- UI 浏览强约束在 `workspaceRoot` 内，`..` 逃逸返回 `escapes_root`。
- Markdown 清单 `listMarkdownFiles`：git 仓库用 `git ls-files --cached --others --exclude-standard`（遵守 `.gitignore`），否则有上限的递归遍历（跳过 `node_modules`、`.git`、`dist`、`build`、`out` 和 `.` 开头的目录，不跟随 symlink）；最多返回 5000 篇、遍历最多访问 50000 个目录项，超出标 `truncated`。只返回相对路径，不读内容。
- Markdown 保存 `writeMarkdownFile`：只写**已存在**的 `.md` / `.markdown`，经 realpath 包含校验后写临时文件再 rename，保持原子；越界返回 `escapes_root`，不新建文件。
- Markdown 上限 `WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES`（2MB），图片类 5MB。`external` 类不读内容，只返回 `size` / `mtimeMs`。**Markdown 超限是部分读**：返回上限内的**完整行** + `truncated: true`，不再整体拒绝（2026-07-30 起）。图片超限仍返回 `too_large`，因为部分图片字节无法解码。
- 图片用 data URL；HTML 不在应用内渲染，走「文件打开路由与兜底对话框」。
- `readWorkspaceFile` 与 `statWorkspaceFile` 都返回 `mtimeMs`，供右侧面板的新鲜度比对。

V1 不做新建 / 删除 / 重命名、快速打开、多 root 和 PDF 预览；写入只限文档面板里的 Markdown 保存。

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

- 会话行、「在轨迹中打开」和对话里压缩分隔线的「在轨迹中查看」调用 `revealInTrajectory(target)`。它由 `WorkbenchLayout` 通过 Context 提供，作用是把中间区域切到轨迹视图，用的是和标题栏「查看执行轨迹」按钮同一份按会话记忆的状态。右侧面板保持打开。
- 目标与轨迹记录的对应关系：

| 面板目标 | 轨迹记录 |
| --- | --- |
| `{ callId }`（工具调用 / 工具结果） | `kind === "tool"` 且 `callId` 相同 |
| `{ messageId }`（用户 / 助手 / 思考） | `messageId` 相同 |
| `{ compactionId }`（对话里的压缩分隔线） | `kind === "compaction"` 且 `compaction.compactionId` 相同 |
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

## 首版边界

- 应用内只渲染 `md`（在「文档」面板里）和 `图片`；其余文件交给系统默认应用（见「文件打开路由与兜底对话框」）。
- Git-first Review 作为第二主线；无 Git 时显示「当前目录不是 Git 仓库」。
- 其他类型后续再补，不抢首版设计重点。

## Review / Diff 展示边界

- 聊天区继续保留单次工具调用或编辑动作的局部 diff；Review Workbench 负责跨文件、跨 scope 的完整审阅。
- Composer、Environment 和右侧对象菜单都可以打开 Review；入口去重到同一 workspace Review 实例。
- 完整 Review 直接渲染在右侧对象面板，聊天主区和 Composer 保持可用。
- `Uncommitted`、`Unstaged`、`Staged`、`Committed`、`Branch` 使用真实 Git 数据。
- Review 内部以单列 Diff Canvas 为主；Changed Files 在 Review 容器不小于 `560px` 时停靠于右侧，更窄时切换为独占内容区的文件列表。它不使用遮罩覆盖 Diff；大 diff 继续按单文件与 capped 策略加载。
- 不换行时，Diff Canvas 是唯一的横向滚动所有者，行号、增删标记和代码随 Canvas 同步移动；禁止给每个 `<code>` 行单独设置横向滚动。开启 word wrap 后 Canvas 回到面板宽度并由代码列折行。
- unified/split、上下文折叠、Jump to file、Review Options 的完整规则以 `docs/design-docs/core-review-change-sources.md` 为准。

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
