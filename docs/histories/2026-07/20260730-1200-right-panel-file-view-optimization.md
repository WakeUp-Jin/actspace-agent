## [2026-07-30 12:00] | Task: 优化右侧面板文件视图

### 🤖 Execution Context

- **Agent ID**: `Cursor Agent`
- **Base Model**: `Opus 5`
- **Runtime**: `Cursor worktree (actspace-agent/xeqt)`

### 📥 User Query

> 一起优化右侧视图 file 的部分：现在好像不能高亮一些语法，检查一下还有什么不足。（后续确认：P0–P4 全做；高亮引擎继续用 highlight.js，不换 Shiki；文件变化优先考虑走 fs-watch 插件；验证要求 typecheck/build/单测 + 浏览器 renderer 自查 + Electron 真机复核。）

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/desktop`（main / preload / renderer）、前端设计文档

**Key Actions:**

- **高亮覆盖面**: `LANGUAGE_BY_EXT` 从 20 个扩展名扩到覆盖 Web / 后端 / 配置 / 数据协议四类；新增 `LANGUAGE_BY_BASENAME` 与前缀规则，`Dockerfile` / `Makefile` / `.gitignore` / `.npmrc` / `go.mod` 这类无扩展名或 dotfile 首次能拿到语言。两侧各加一条防漂移测试锁住「映射值必须是 highlight.js 真实语言」。
- **Bundle 瘦身**: 新增 `right-panel/highlight.ts`，从 `highlight.js/lib/core` 按需注册 40 种语法替代全量入口的 192 种。renderer chunk 1,991 kB → 1,117 kB（gzip 617 → 335 kB，-44%）。Markdown fenced code 的 `rehype-highlight` 复用同一份语言表，与文件视图对齐覆盖面。
- **文件新鲜度**: 契约增 `mtimeMs` 与 `statWorkspaceFile`；renderer 用「Agent 编辑事件 + 三时机 mtime 重校验」两级信号标记 stale，显示提示条并由用户点「重新加载」触发替换，不自动抽换内容。未接 fs-watch 插件（理由见执行计划决策记录）。
- **代码阅读体验**: 抽出 `CodeRenderView`，补行号（grid 双列 + `sticky` gutter）、软换行开关（默认关）、整文件复制、文件内查找（字面量匹配、成环跳转、命中标记与语法高亮共存）。Markdown 源码态复用同一组件。
- **大文件**: 超阈值改分块异步高亮（首屏同步 500 行，其余空闲推进），`LineRow` 加 `memo`，并设 `MAX_RENDERED_LINES = 20000` 上限 + 工具栏明示未显示行数。
- **文本超限改部分读**: 2MB 以上文本不再整体拒绝，返回上限内的完整行 + `truncated`，UI 常驻截断提示。上限常量收敛到 `packages/shared/src/ipc.ts`。
- **CSV 预览**: 新增 `CsvRenderView` 补上设计文档早已声明但未实现的 tab 类型；解析走状态机处理引号包裹与字段内分隔符，可随时切纯文本查看。
- **文件树状态**: 展开层级、目录缓存与「上次 root」全部提升到 `RightPanelContext`，收起树栏或切到对象 Tab 再回来不再塌回根层；当前文件在树里高亮，并补过滤框、刷新按钮、`too_many_entries` 提示。

### 🧠 Design Intent (Why)

调研先推翻了「高亮坏了」这个前提：链路是通的，问题在覆盖面 —— 映射表只认 16 种语言，dotfile 与无扩展名文件根本拿不到语言，同时全量入口把 176 种用不到的语法打进了 bundle。所以本轮把「扩表 + 按需注册」当成一件事做，一次同时修覆盖面和体积。

新鲜度没有走 fs-watch 插件：它是用户可选安装的常驻进程，监听根与当前 session 的 `workspaceRoot` 无关，输出又是去抖后落盘的审计日志。内容新鲜度是正确性功能，不能建立在可选插件和三层延迟上；复用 renderer 本来就实时收到的 `edit_diff` / `write_diff` 事件、再用 O(1) stat 兜住外部编辑器，成本更低且总是可用。

行号选 CSS grid 双列而不是伪元素计数，是为了让软换行的续行天然落在同一 grid row 内、不与行号错位。按行渲染换来了行号和逐行搜索定位，代价是 DOM 节点翻倍，因此必须同时设渲染行数上限 —— 这和 `CsvRenderView` 的 2000 行上限是同一套取舍。

### 📁 Files Modified

- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/workspace-fs-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/components/RightPanel.tsx`
- `packages/desktop/src/renderer/components/right-panel/highlight.ts`
- `packages/desktop/src/renderer/components/right-panel/CodeRenderView.tsx`
- `packages/desktop/src/renderer/components/right-panel/CsvRenderView.tsx`
- `packages/desktop/src/renderer/components/right-panel/useFileFreshness.ts`
- `packages/desktop/src/renderer/components/right-panel/RightPanelContext.tsx`
- `packages/desktop/src/renderer/components/right-panel/WorkspaceFileTree.tsx`
- `packages/desktop/src/renderer/components/right-panel/MarkdownRenderView.tsx`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
- `docs/exec-plans/active/20260730-right-panel-file-view-optimization.md`
- `docs/learnings/2026-07/library-entry-points-decide-bundle-size.md`
- `docs/learnings/2026-07/file-freshness-pick-signals-not-watchers.md`
- `docs/learnings/2026-07/green-unit-tests-do-not-prove-rendered-behavior.md`

---

## [2026-07-30 18:20] | Task: 右侧文件视图布局对齐 Cursor（同一任务续）

### 📥 User Query

> 和 Cursor 还是有区别：① 文件树换到右边；② 顶部第二层设计太复杂、没必要；③ 文件树的搜索框人家更好看；④ 顶部加一个文件夹图标点击收起文件树；⑤ 还要一个打开文件的图标。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/desktop`（main / renderer）、前端设计文档

**Key Actions:**

- **文件树移到右栏**: 两栏顺序改为 `[文件预览区 | 文件树]`，rail 的分隔线从 `border-r` 改 `border-l`，空态文案同步改成「右侧文件树」。
- **操作栏简化**: 左侧改为面包屑 `<workspace 名> › <相对路径>`；右侧只留「在外部应用中打开」和「收起 / 展开文件树」两个图标。去掉常驻的「重新读取当前文件」按钮 —— stale 提示条自带「重新加载」，常驻刷新只是让这层看着更满。
- **文件夹图标开关树栏**: 原来的 `PanelLeftClose` / `PanelLeftOpen` 换成单个 `FolderTree` 图标，展开态用 `bg-selected` 表达状态，aria-label 与 `aria-expanded` 保持原样（既有测试与 CDP 脚本都按它定位）。
- **过滤框重做**: 去掉常态边框与填充，只在 hover / 聚焦时浮出底色，字号 11px → 12px。
- **打开当前文件**: 新增 `right-panel/OpenInAppMenu.tsx`，复用顶部 chrome 那套应用目录，但目标是当前文件；`WorkspaceOpenInput` 增可选 `relativePath`，越界返回新增的 `escapes_root`。main 侧按工具分派目标形态（编辑器给文件、Finder 用 `-R` 定位、终端给父目录），四条单测锁住实际 `open` 参数与两类拒绝路径。
- **抽公共件**: 应用图标、偏好读写与展示名回退表抽到 `workspace/workspaceOpenTool.tsx`，顶部 chrome 与右侧面板共用同一个 localStorage key。

### 🧠 Design Intent (Why)

树放右栏让预览区紧邻中间聊天区，视线从消息移到代码不用跨过一条导航栏；导航件靠外侧也更符合「主内容居中」的重心。

「打开文件」没有做成点图标就直接用上次的应用打开：这一栏图标只有 24px，误触会直接拉起外部程序，所以统一先出菜单。main 侧之所以要按工具分派目标，是因为 `open -a Finder <文件>` 实际是用默认应用**运行**该文件、`open -a Terminal <文件>` 更糟，把文件路径一律丢给 `open -a` 是个看起来能跑、实际行为错的实现。

### ⚠️ 未验证

本机 shell 仍卡死，这轮改动**没有**跑过 `pnpm typecheck` / 单测 / Electron 自查，需要在终端恢复后补验。

---

## [2026-07-30 19:10] | Task: 撤掉代码视图工具栏 + 源码切换移入操作栏（同一任务续）

### 📥 User Query

> 默认自动换行，不需要，这三个都不需要。
> 如果文件是 md 这种有源码的，按钮放这里，显示源码。

### 🛠 Changes Overview

**Scope:** `packages/desktop/src/renderer`、前端设计文档

**Key Actions:**

- **代码视图撤掉整条工具栏**: 查找、复制、软换行开关三个按钮全部移除，`Cmd/Ctrl+F` 接管也一并去掉。`CodeRenderView` 的 props 收敛为 `{ content, language }`。
- **折行改为固定开启**: 不再有开关，grid 恒为 `w-full`、行恒为 `whitespace-pre-wrap`。`RightPanelContext` 的 `isWrapEnabled` / `setWrapEnabled` 随之删除。
- **截断说明挪到内容末尾**: 「仅渲染前 20,000 行」原来挂在工具栏，工具栏没了之后改成内容末尾的一条 footer；「正在高亮…」直接去掉（内容本来就先按纯文本可读，转为高亮是自解释的）。
- **预览 / 源码切换移入操作栏**: 新增 `PreviewSourceButton`（文字按钮，显示目标态：预览时写「查看源码」，源码时写「查看预览」），挂在面包屑右侧。仅当当前 Tab 是 markdown / html **且**有 `relativePath` 时出现。
- **两种壳一个状态**: `MarkdownRenderView` / `HtmlRenderView` 改成受控（传 `mode` + `onModeChange`，不渲染自带工具栏）/ 不受控（自持状态 + 视图内分段控件）双形态。工作区文件走受控、按 Tab 记在 `RightPanelContext` 的 `isSourceShown`；聊天生成的 markdown / html 没有操作栏，仍走不受控。

### 🧠 Design Intent (Why)

那条 icon 栏是上一轮补能力时顺手加的，摆在**每个文件**上方就成了第二层 chrome：查找和复制都是编辑器动作，在只读预览里的使用频率撑不起常驻位置。折行则相反 —— 之前默认关闭的理由是「折行丢缩进层级」，但右面板只有几百 px 宽，横向滚动读代码的代价比丢缩进更大，所以直接固定折行、连开关一起省掉。

切换按钮做成文字而不是第三个图标，是因为同一栏里已有两个图标，再加一个就分不清哪个是模式切换；显示目标态（「查看源码」）而不是当前态，可以只用一个按钮代替分段控件，在窄栏里省一半宽度。

按钮必须要求 `relativePath`：浏览态下激活的可能是聊天生成的 markdown，那时内容区显示的是「选择文件查看」占位页，按钮点了没有任何视图会响应。

搜索去掉后，`highlight.ts` 的 `injectMatchMarks`（命中标记与 hljs 高亮共存的那段游走器）、它的四条单测、以及 `markdown.css` 里 `mark.act-code-match` 的两条配色一并删除，不留「以后可能用得上」的未用代码。顺手把 `CodeRenderView` 里与 `escapeHtml` 重复的 `escapeForFallback` 合并掉。

### ⚠️ 未验证

本机 shell 依然不可用（连 `uptime` 都无输出），这轮同样**没有**跑过 `pnpm typecheck` / 单测 / Electron 自查。
