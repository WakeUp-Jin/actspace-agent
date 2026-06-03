# 右侧面板与文件渲染规范

## 定位

右侧面板是当前会话的对象浏览工作区，用于查看文件、预览结果和 Review 变更结果。

它属于聊天态工作台的可调对象区；右侧开关、宽度边界和中间聊天区保护规则见 `工作台布局与面板交互规范.md`。

## 文档范围

本文是右侧对象浏览区的单一前端事实来源，覆盖面板外壳、Tab 系统、文件渲染、Workspace 文件浏览、Context 完整只读视图、Reply HTML 和 HTML 沙箱安全。Review / Diff 的数据来源、baseline 和无 Git 工作区策略见 `core-review-change-sources.md`。工作台左右面板 resize、collapse 和标题栏让位仍见 `front-工作台布局与面板交互规范.md`；颜色硬约束见 `front-主题与配色规范.md`。

## 交互模型

- 顶部使用短高度横向 Tab。
- 每个 Tab 对应一个对象实例，不对应固定页面。
- 点击消息中的文件、链接、图片或 diff 时，在右侧打开对应 Tab。
- 支持多个 Tab 并列打开与切换。
- 首版重点只保留文件预览和 Git-first Review 两条主线。
- 面板打开后允许调整宽度，关闭后把宽度归还给中间聊天区。
- 首版关闭右侧面板时不保留右侧 rail。
- 右侧 Tab 行位于隐藏标题栏 chrome 的同一高度区间，必须保证 tab 按钮能高于 `.chrome-center` 拖拽区接收点击；同时继续给右上角 PanelRight 按钮预留 padding，避免 tab 命中区压住关闭右侧面板入口。

## Tab 溢出处理（2026-05-30，参考 Cursor 编辑器标签）

chrome-right 现有两个浮层控件（`+` 新建对象 + PanelRight 折叠），Tab 行必须预留**两个控件**宽度（`pr-[calc(2*var(--window-chrome-control-size)+28px)]`），否则 tab 会滑到 `+` 下方造成按钮重叠。

Tab 过多时**不加可见水平滚动条**（用户明确反对），改用 Cursor 式的三层兜底：

- Tab 保持内容宽度（标题截断到 160px），不挤压成不可读窄条。
- Tab 行横向可滚动但**隐藏滚动条**（`.scrollbar-none`，见 `electron.css`）；macOS 触控板/滚轮仍可滚动；切换/新增 tab 时激活 tab 自动 `scrollIntoView`。
- 溢出时（`ResizeObserver` 检测 `scrollWidth > clientWidth`）在 tab 行右侧、预留区左缘显示一个**溢出下拉 ⌄**，列出全部 tab 供点选 / 关闭——这是无滚动条时的可达性兜底。

## Tab 类型

- `Markdown`：Markdown 文件渲染。
- `HTML`：HTML 预览。
- `Image`：图片渲染。
- `PDF`：PDF 预览。
- `CSV`：表格预览。
- `Text`：纯文本或代码文件查看。
- `Review`：Git-first review diff；V1 默认展示当前 Git repository 的 uncommitted changes，Session / Last Turn 视角属于 V2。
- `Kairos`：聊天态右侧紧凑状态视图；具体布局和数据边界见 `front-Kairos监控页规范.md`。
- `Context`：完整只读上下文视图；见 `front-右侧面板与文件渲染规范.md`。
- `Reply HTML`：当前会话已生成的可视化 HTML 文件浏览器（见下文）。

## 「+ 新建对象」菜单（2026-05-30）

- 隐藏标题栏 chrome 右段、右侧折叠（PanelRight）按钮**左侧**放一个 `+` 按钮（参考 Cursor 顶栏的 +）。
- 点开是一个轻量菜单，可往右侧面板新增三种对象：`Reply HTML` / `Kairos` / `Context`，各自用稳定 Tab id 去重（重复打开只聚焦不堆叠）。
- 菜单与右侧折叠按钮同属 chrome-right，`-webkit-app-region: no-drag`；Kairos 全屏页下与右侧折叠按钮一起隐藏。
- **`+` 仅在右侧面板打开时显示**（`view === "chat" && isRightPanelOpen`）：`+` 的语义是「往面板里加对象」，面板关着时无意义；面板关闭时 chrome-right 只保留 PanelRight 折叠按钮。

## Reply HTML 视图（2026-05-30，下拉选择器版）

把**当前会话**里通过「消息可视化」生成过的 HTML 聚合到一处（数据见 `front-右侧面板与文件渲染规范.md` 的缓存 sidecar）。**渲染区占满**，文件列表收进一个下拉选择器，不再用常驻侧栏挡住渲染图：

- 顶部操作栏（左起）：**文件选择器**（按钮显示当前文件名 + chevron，点击弹出可滚动浮层，列表项只显示文件名，参考模型选择器）、**刷新**按钮。
- 主体：复用沙箱 `HtmlRenderView` 渲染选中文件（半可信 → `trust="chat"`，自带预览/源码切换）。
- 无文件时选择器禁用显示「暂无文件」，渲染区给空态提示去某条回复点「可视化」。
- 数据走 `visualize:list` IPC（倒序 + 派生 `title`），renderer 不直接读 FS；浏览器 mock 无 IPC 时优雅降级为空态。
- 设计取舍：聚合入口与「每条回复下的可视化按钮」互补——后者按需看单条，前者集中浏览本会话全部产物。

## 文件渲染规则

不同文件类型使用不同渲染组件。

- `md`：默认渲染为可读文档，可切源码。
- `html`：渲染为可交互预览。
- `csv`：渲染为表格视图。
- `pdf`：渲染为分页阅读视图。
- `图片`：直接预览。
- `review` / `diff`：展示 Git Review 聚合改动；V2 可切换到当前会话累计改动，不放在单条消息里替代消息流中的局部 diff。

## Markdown 渲染

右侧面板是正式 Markdown 渲染栈的入口，聊天消息区是否迁移到同一栈属于 V2。

V1 渲染栈：

- `react-markdown` + `remark-gfm`，支持表格、任务列表、删除线和自动链接。
- `rehype-highlight` 负责同步代码高亮；Shiki 作为 V2 可选升级。
- 不引入 `rehype-raw`，Markdown 中的原始 HTML 不直接执行。
- 链接只放行 `http` / `https` / `mailto`，外链使用 `target="_blank" rel="noreferrer"`。
- 复用 `.markdown-prose` 和 `styles/markdown.css`，代码块使用 `markdown-code-block`。
- Preview / 源码 两态切换，切换状态只属于当前 Tab。

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
- iframe 只允许单向 `postMessage` 回传运行时错误和内容高度；父窗口校验 `event.source === iframe.contentWindow` 后处理。
- 注入最小 `color-scheme: light dark;` 基线样式，不强行覆盖产物自带样式。

聊天行内 HTML 小片段先用 DOMPurify 净化；需要脚本或复杂结构时升级为 iframe 路径。V1 不支持相对资源、多文件 artifact、页面内导航、keep-alive 池、双向交互桥或 CDP。

V2 方向：注册独立 origin（自定义协议或本地端口）、受控 `localResourceRoots`、安全打开 `allow-scripts allow-same-origin`、支持相对资源、多文件产物、截图 / inspect / 调参和更细 CSP nonce。

## Workspace 文件浏览器

右侧面板提供一个轻量的 Workspace 文件浏览器：树 rail 常驻在浏览态左栏，点文件在右侧以普通 Tab 打开。树根来自顶部 Workspace 选择器的当前选择；发送消息前该选择只停留在 renderer 本地状态，发送时才写入当前 session 的 `workspaceRoot`，随后与 Agent 文件工具操作的根一致。

结构为纵向三段：

1. Tab 条横跨整条右面板。
2. Workspace 操作栏展示树栏折叠按钮和当前文件的 workspace 相对路径。
3. 两栏 `[文件树 | 文件预览区]`，文件树无独立头部。

呈现由当前 Tab 决定：

- 激活工作区文件 Tab（文件类且有 `relativePath`）时进入 shell。
- 激活对象 Tab（Kairos / Context / Reply HTML / 聊天生成 HTML 等）时退出 shell，整面板展示对象视图。
- `isFileTreeOpen` 表示显式进入浏览态；`isFileTreeCollapsed` 只折叠树栏，不关闭内容区。

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

type WorkspaceFileRenderKind = "markdown" | "html" | "image" | "text";

type WorkspaceReadFileResult = {
  relativePath: string;
  renderKind: WorkspaceFileRenderKind;
  content?: string;
  dataUrl?: string;
  language?: string;
  size: number;
  truncated?: boolean;
  error?: "not_found" | "not_a_file" | "too_large" | "binary" | "escapes_root";
};
```

main 侧服务规则：

- renderer 不直接访问文件系统；树展开和文件读取都走 preload + IPC。
- 顶部 Workspace 选择器允许用户在发送前多次切换；选择动作不迁移 session，只有发送消息时才把最终选择写入 session meta。
- UI 浏览强约束在 `workspaceRoot` 内，`..` 逃逸返回 `escapes_root`。
- 固定忽略 `node_modules`、`.git`、`.pnpm-store`、`dist`、`.next`、`.turbo`、`coverage`、`.DS_Store`。
- 单目录最多列出 1000 条，目录在前、文件在后，各自按名称升序。
- 文本类上限 2MB，图片类上限 5MB；大文件返回 `too_large` 或截断提示。
- 图片用 data URL，HTML 文件用 `trust="file"` 的 strict CSP 沙箱。
- text 类按扩展名确定 highlight.js 语言，不使用 `highlightAuto` 猜测。

V1 不做写 / 删 / 重命名、`.gitignore` 解析、快速打开、多 root、PDF/CSV 预览和 Kairos 配置编辑。V3 若做 Kairos 配置编辑，保存必须走 `kairos:read-config` / `kairos:write-config` 这类带 schema 校验的专用通道。

## Context 完整只读视图

Context Tab 展示主聊天 agent 当前会话喂给模型的完整上下文。它和 Kairos 上下文 Sheet 是不同组件：数据源不同、入口不同，但视觉语言（竖色条段头、可折叠分区、源文件 chip）保持同源。

入口：

- Composer 的 Context 弹窗右上角放展开 / 详情图标按钮。
- 点击后打开右侧 Context Tab。
- V1 只读，不使用 Edit / Pencil 图标。

数据来源：

- `@actspace/shared` 的 `ContextState` 与 `ContextStateEntry[]`。
- 分区顺序和配色来自 `CONTEXT_BUCKET_REGISTRY`。
- `context-state.json` 持久化只保存 token 统计，逐条正文不落盘。
- 打开 Context 视图时调用 `context:describe` 现场重算逐条全文，不调用 LLM。
- describe 结果优先；describe 未返回时退回持久化快照；两者皆无显示空态。

分区顺序：

1. System prompt
2. Tools
3. Rules
4. Skills
5. Summarized conversation
6. Conversation
7. 未来 MCP / Subagents / Recent files

视觉与交互：

- 分区头使用 `--act-context-*` 同色竖线 + 分区名 + 条目数 / token。
- 展开内容是主题感知 `bg-surface` 白底卡片 + `border-line` 细边，不整行染色。
- entry 正文默认夹 3 行；超过阈值提供「展开全文 / 收起」。
- Conversation 默认折叠，V1 最多展示 20 条，导出使用 renderer Blob 下载 `.md` / `.json`。
- 空 bucket 保留分区头，让用户知道有哪些上下文类型；展开后按状态显示「正在重建」「暂无法生成」「暂未使用」等文案。

V1 不做增删改、pin、include 切换、source 跳转、搜索过滤和 token 占比可视化。逐条全文只在内存 / IPC 传输，不持久化。

## 消息可视化转换（Markdown -> HTML）

助手回复上的「可视化」按钮把该条回复的 Markdown 用主模型转换成自包含 HTML，然后在右侧 HTML Tab 渲染。

核心约束：转换是一次真实模型调用，成本高，必须缓存。第一次点击才生成并持久化，之后命中缓存直接渲染。

入口与状态：

- `TurnActions` 的「...」按钮左侧放可视化按钮。
- `idle` / `error` 用 `Wand2`，`generating` 用旋转 `Loader2`，`ready` 用 `Eye`。
- 状态机：`idle -> generating -> ready`；失败进入 `error` 可重试。
- 已生成内容提供显式「重新生成」入口，只有显式触发才重算。

缓存与数据流：

- 缓存键 = `messageId | turnId` + `sourceHash`。
- sidecar 存 HTML、sourceHash、model、generatedAt、usage 和派生 title。
- renderer 点击 -> IPC -> main -> agent-core LLM 服务用主模型转换 -> main 写 sidecar -> renderer 打开 / 聚焦 HTML Tab。
- `visualize:list({ sessionId })` 读取同一 sidecar，供 Reply HTML 聚合视图按 createdAt 倒序浏览本会话全部产物。
- usage 计入使用统计；缓存命中不新增模型调用。

生成提示词要求输出单个自包含 HTML 文档；如果模型输出 ```html 围栏，解析围栏内内容；解析失败不污染缓存。产物按半可信处理，一律走 HTML sandbox 路径，不因为「是自己模型生成的」就放宽权限。

## 首版边界

- 先支持 `md`、`html`、`图片` 三种文件预览优先级。
- Git-first Review 作为第二主线；无 Git 时提示创建 Git repository，Session Review 只作为 V2 的 Last Turn / Session 视角。
- 其他类型后续再补，不抢首版设计重点。

## 定稿图

- [右侧 Markdown 定稿图](public/front/right-panel-markdown-final.png)
- [右侧 HTML 定稿图](public/front/right-panel-html-final.png)
- [右侧 Image 定稿图](public/front/right-panel-image-final.png)
- [右侧 Diff / Review 定稿图](public/front/right-panel-diff-final.png)

## 定稿图

![Markdown 定稿图](public/front/right-panel-markdown-final.png)

![HTML 定稿图](public/front/right-panel-html-final.png)

![Image 定稿图](public/front/right-panel-image-final.png)

![Diff / Review 定稿图](public/front/right-panel-diff-final.png)

## Review / Diff 展示边界

- 聊天区保留单次工具调用或编辑动作的局部 diff。
- 右侧 `Review` Tab 的 V1 来源是 Git provider，默认展示 `Uncommitted` scope。
- 右侧 `Review` Tab 按文件浏览，适合审核当前 repo 真实修改结果。
- V1 Review 采用 Codex-style 极简文件级 accordion：顶部是一条单行操作栏，左侧显示 `Uncommitted` scope 和总 `+N -M`，右侧放更多、搜索、diff display、刷新等图标按钮；`N Uncommitted Changes` 保留在 `aria-label`、tooltip 或可访问说明中，不做大 summary card。
- 文件列表是主体；每个文件一行显示 chevron、状态图标、path 和 `+N -M`，视觉行尾只保留增删统计。`New` / `Deleted` / `Renamed` / `Modified` 通过状态图标、颜色和文件行 `aria-label` / accessible name 表达，不再作为固定可见文字标签列。
- 点击文件行展开 / 收起该文件的具体 unified diff。
- 默认只展开第一个有 diff body 的文件，其余折叠，避免大变更一次性铺满右侧面板；文件行必须键盘可达并用 `aria-expanded` 表达展开状态。
- Session / Last Turn diff 属于 V2 scope，只表示 Agent 会话改动，不能代表完整工作区状态。
