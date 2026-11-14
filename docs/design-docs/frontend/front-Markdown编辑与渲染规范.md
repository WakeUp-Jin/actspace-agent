# Markdown 编辑与渲染规范

管「文档」面板正文区的 Markdown 编辑与渲染：预览和源码两种模式**都能编辑**，共用同一份文档（CodeMirror 6 + Lezer）；预览是实时预览，语法标记平时隐藏，光标进入时露出。面板的树、操作栏、草稿、保存、新鲜度、离开确认见 [front-文档面板规范.md](front-文档面板规范.md)。原型 demo 已随实现落地删除，参考实现是 `apps/desktop/src/renderer/components/markdown-editor/`。

| 范围 | 说明 |
| --- | --- |
| 包含 | 「文档」面板的预览、源码、大纲、查找、文中路径与链接的打开 |
| 不包含 | 聊天消息区的 Markdown（`react-markdown` 的 `MarkdownProse`，见 [front-聊天区Markdown渲染规范.md](front-聊天区Markdown渲染规范.md)）；轨迹详情里的 Markdown；图片 Tab、远程 Host 文本 Tab |

强调色只在这里改：编辑器默认用信息蓝，应用全局默认强调色不变（仍是近黑）。

## 1. 样式决定

- **排版**：Codex 排版（见 §6.1）；字体用系统字体 `--font-sans` / `--font-mono`，不另引字体；粗体 700（600 在苹方里与正文几乎分不出）；源码模式等宽 12px、行高 1.4；图片居中；引用条用强调色。
- **强调色**：`--md-accent = var(--act-color-link)`，即 `var(--act-palette-*-accent, var(--act-color-info))`：用户选了调色板就用调色板色，没选（`data-accent="default"`）就是信息蓝。
- **链接颜色**：在 ActSpace 里打开的目标（行内代码里的路径、指向本地文件的链接）用强调色 + 文件图标；网页链接用 `--act-color-link`。两者颜色同值，区别只在文件图标和打开方式。
- **提示框**：GitHub 写法 `> [!NOTE|TIP|IMPORTANT|WARNING|CAUTION]`，依次显示 说明 / 提示 / 重要 / 注意 / 警告，语义色 info / success / 正文色 / warning / danger（定义在共享的 `components/markdown-common/callouts.ts`，聊天区同用）。

## 2. 架构

CM6 + Lezer 是唯一的编辑和解析核心，不再用 `react-markdown` 渲染预览。

```text
DocsReader（React，面板外壳）
 └─ MarkdownEditor.tsx（React 薄壳：挂载 / 卸载、同步草稿、桥接宿主）
     └─ core/（纯 TS，不 import React，可单测）
         config / syntax / inline*.ts / blocks / widgets/ / paths / links / outline / host / layer-bridge …
```

- 两种模式是同一个 `EditorView` 上的两套扩展，切换只重新配置 Compartment，不重建 view：撤销历史、光标、选区、滚动位置都保留。
- widget 复用现有渲染器：Mermaid 用 `messages/mermaid-renderer.ts`，代码块配色用 `.act-code-hl` 的 `--md-hl-*` 变量，打开文件用 `files/open-workspace-path.ts`。代码块高亮用 Lezer `@codemirror/language-data` 按语言懒加载；`right-panel/highlight.ts`（highlight.js）继续服务代码文件视图和聊天区，这里不用。
- core 不直接调 `api/*`、React Context 或 `window`，外部能力都经宿主接口（`MarkdownEditorHost`，由 `MarkdownEditor.tsx` 实现，测试时传假宿主）：`openPath({ relativePath, line? })`（已规范化并做越界检查）、`openUrl(url)`（只传 http / https / mailto）、`loadImage(relativePath)`（返回 data URL，读不到返回 null）、`renderMermaid(source)`（失败 reject 并带 `MermaidRenderError`）。
- 懒加载：编辑器整体（CM6 + Lezer + core）经 `React.lazy` 在第一次打开文档正文时加载；代码块语言包遇到该语言时加载；KaTeX（JS + CSS + 字体，打包进应用不走 CDN）在文档第一次出现公式时 `import()`；Mermaid 沿用现有懒加载。

## 3. 数据流

- 草稿以 `RightPanelContext.docsDoc.draft` 为准，读取、保存、新鲜度、离开确认规则不变。
- 编辑器 → 草稿：文档变化后每帧最多同步一次（`requestAnimationFrame` 合并）。草稿 → 编辑器：只在「外部替换」时整份写入并清空撤销历史（换文档、点「重新加载」、恢复暂存草稿、首次读取完成）；用户自己输入引起的草稿变化不回写，避免循环；保存只更新 `original` 与 `mtime`，不算外部替换。
- Agent 改了同一个文件：沿用「已变化」提示条，不打断编辑；保存以人为准，不做冲突检测。
- 超过 2MB 读取上限而被截断的文件，两种模式都只读，提示「文件过大，请用默认应用编辑」。撤销历史切换模式时保留，面板卸载或换文档时丢失。

## 4. 预览模式：逐元素规则

「露出」指光标或选区碰到该节点，只露出这个节点的标记，同一行别的标记不动。编辑器**失去焦点时一律不露出**（纯阅读状态）。

| 元素 | 平时 | 露出时 |
| --- | --- | --- |
| 标题 `#` / Setext 下划线 | 隐藏标记，按级别排字号 | 显示（淡色） |
| 粗体、斜体、删除线、行内代码的标记 | 隐藏 | 显示（淡色） |
| 行内代码 | 灰底等宽 | 同左，加上露出的反引号 |
| 行内代码里的路径 | 强调色 + 文件图标，单击打开 | 显示反引号；单击仍会打开 |
| 链接 `[文字](url)` | 只显示文字：本地文件强调色 + 文件图标，网页链接用链接色；单击直接打开（不需要 ⌘） | 显示完整语法，url 淡色；改链接文字用方向键移进去或切源码 |
| 裸 URL、`<自动链接>` | 链接色，可点 | — |
| 图片 `![]`（工作区相对路径） | 隐藏源码，下方居中显示图片，最大宽度 100% | 显示源码，图片仍在下方 |
| 远程图片 | 显示原文（淡色），悬停提示「远程图片不加载」，不发网络请求 | — |
| 无序列表 | 圆点，三层依次实心点、空心点、方点 | `-` / `*` / `+` 原文 |
| 有序列表 | 序号原文（淡色） | — |
| 任务列表 | 可点击复选框，单击改写 `[ ]` ↔ `[x]`；完成项划线变淡 | 显示 `[ ]` 原文 |
| 引用 | 左侧 4px 强调色竖条，`>` 隐藏，嵌套时叠加 | 显示 `>` |
| 提示框 | 首行 `[!TYPE]` 换成中文标签，竖条与标签用语义色 | 显示 `[!TYPE]` |
| 分隔线 | 一条细线 | 显示 `---` |
| 表格 | 隐藏 `\|` 和分隔行，行内伪表格、列宽均分，单元格原地编辑，表头加粗带底色；预览里不能加列 | 光标所在单元格显示两侧 `\|` |
| 代码块 | 隐藏围栏，顶部一条头（语言名 + 复制），按语言高亮 | 显示两行围栏，代码头收起 |
| 未闭合的代码块 | 按代码块显示，不隐藏 | — |
| Mermaid | 只显示图，图上有「查看大图」 | 显示源码，图在下方实时更新（防抖 300ms）；出错时在图的位置显示错误并保留上一张图 |
| 块公式 `$$` / 行内公式 `$…$` | KaTeX 居中 / 行内显示 | 显示源码 |
| Frontmatter | 属性卡片：键淡色，值正文色；复杂值（数组、对象、多行）按原文；点一下露出源码编辑，光标离开变回卡片 | YAML 源码（淡色等宽） |
| 原始 HTML | 按原文显示，不执行 | — |

- 公式语法：块公式是独占一行的 `$$` 开头和结尾；行内公式开头 `$` 后不能是空格，结尾 `$` 前不能是空格且后面不紧跟数字（`$5 和 $10` 不是公式）；`\$` 不算公式。KaTeX `throwOnError: false`，写错的公式显示原文并标危险色。
- 代码块「复制」复制代码原文，不含围栏。

## 5. 源码模式

等宽 12px、行高 1.4，左侧行号（只有源码模式有行号）；只做语法着色，不做隐藏、替换或 widget（标题加粗，标记和链接 url 淡色，代码块按语言着色）；自动换行；大纲、查找、⌘S、列表续行都可用。

## 6. 排版与颜色

### 6.1 排版（Codex 原样）

| 项目 | 值 |
| --- | --- |
| 正文 | 14px（`--text-act-md`），行高 1.4，每行上下各加 2px，字重 430 |
| 标题 | H1 24px（`--text-act-title`）、H2 20px（`--text-act-xl`）、H3 18px、H4–H6 14px；字重 500 |
| 行内代码、代码块 | 12px（`--text-act-xs`），代码块左右内边距 12px |
| 引用 | 竖条 4px，左内边距 12px |
| 正文区 | 左右各 16px，顶部 12px，底部留 64px 便于最后一行滚到中间编辑；预览最大宽度 760px 居中，源码模式通栏 |

字号都用 `var(--text-act-*)`，H3 的 18px 是 `--text-act-head`。

### 6.2 颜色映射

全部用主题变量，浅色深色自动翻转，不写字面量（`check:frontend-theme` 必须通过）：

| 用途 | 变量 |
| --- | --- |
| 编辑器强调色 `--md-accent`；引用竖条、文件路径、本地链接、文件图标 | `var(--act-color-link)` |
| 网页链接 | `--act-color-link` |
| 正文、标题 | `--act-color-text` |
| 露出的语法标记、列表序号、行号 | `--act-color-text-faint` |
| 行内代码 | `--act-color-inline-code-bg` / `-border` / `-text` |
| 代码块底色、边框 | `--act-color-code-bg-top` / `-bottom` / `--act-color-code-border` |
| 代码高亮 | `.act-code-hl` 的 `--md-hl-*`，CM 高亮标签映射到这套变量 |
| 表头 | `--act-color-table-head-bg` / `-text` |
| 分隔线、表格线 | `--act-color-border` |
| 选区 | `--act-color-selection` |
| 提示框 | info / success / text / warning / danger 对应的 `--act-color-*` |
| 公式出错 | `--act-color-danger` |

## 7. 文中路径与链接

### 7.1 识别

- 行内代码路径：整段行内代码是一个路径（可带 `:行号` 或 `:行号-行号`），包含 `/` 或以常见扩展名结尾，不含空格且不是 URL，才识别；版本号（`1.2.3`）和没有扩展名的短片段（`a/b`）不识别。规则只写一份在 `components/markdown-common/paths.ts`，聊天区共用。
- 本地链接：链接目标没有协议、不以 `#` 开头。普通文字里的路径不识别。

### 7.2 解析

| 写法 | 相对于 |
| --- | --- |
| 行内代码路径 | 工作区根目录；`./`、`../` 开头的相对于当前文档所在目录 |
| Markdown 链接、图片 | 当前文档所在目录 |
| 工作区内的绝对路径 | 去掉工作区根前缀变成相对路径 |
| 工作区外绝对路径、`~` 开头、越出工作区的 `..` | 不识别，按普通文字或链接显示，不可点 |

解析后用 `isSafeWorkspaceRelativePath` 检查；主进程再做一次 `escapes_root`，前端检查只是为了不显示成可点。

### 7.3 打开（单击直接打开）

| 目标 | 怎么打开 |
| --- | --- |
| `#标题` | 当前文档内平滑滚动到对应标题（slug 按 GitHub 规则） |
| 本地 Markdown | `openWorkspacePath` 在文档面板打开；带行号的打开后滚到该行并选中整行 |
| 本地图片、其他文件 | `openWorkspacePath`：图片开图片 Tab，其他文件交系统默认应用，打不开时弹兜底对话框 |
| `http` / `https` / `mailto` | `window.open`，主进程 `setWindowOpenHandler` 转给 `openExternalSafely`（与聊天区同一条路） |
| 其他协议（`javascript:`、`file:` 等） | 不可点，按普通文字显示 |

- 行号只对 Markdown 生效：docs Tab 的一次性请求 `select` 带可选 `line`，读取完成后由文档面板滚动。其他文件交给外部应用，忽略行号。
- 点击位置用 `view.posAtDOM(event.target)` 定位，不用 `posAtCoords`（折行加隐藏标记时后者会落到下一行）。鼠标拖选时不触发打开；按住 ⌘ 或 Shift 单击也不打开，留给选区操作。

## 8. 交互

- **键盘**：⌘S / Ctrl+S 保存（只读时不响应）；Enter 在列表、任务列表、引用里自动续行，空列表项再按 Enter 结束列表；空列表项开头 Backspace 删除列表标记；Tab / Shift+Tab 在列表里缩进 / 反缩进，其他位置插入两个空格，按 Esc 后再按 Tab 焦点移出编辑器；⌘Z / ⌘⇧Z 撤销 / 重做；⌘F 打开编辑器内查找（`@codemirror/search`，面板在顶部、中文文案，⌘G / ⇧⌘G 下一个 / 上一个，Esc 关闭）；方向键按原子范围跨过 widget（复选框、圆点、公式、图片、Mermaid 图各算一个字符）。
- **大纲**：从 Lezer 语法树取 h2、h3，两种模式都可用；点击滚动到标题所在行并留 12px 顶部间距；没有标题显示「没有标题」；浮层样式在 `DocsOutline.tsx`。
- **复制与粘贴**：复制和剪切得到 Markdown 原文，与预览显示无关；粘贴按纯文本插入，不把 HTML 转成 Markdown。
- **焦点**：失焦时所有节点回到「平时」样子；从操作栏切换模式后焦点和光标留在编辑器里，可直接接着打字。

## 9. 安全

- 原始 HTML 一律按原文显示，不插入 DOM，不执行；widget 只用 `textContent` 或清理后的内容写 DOM（Mermaid SVG 走 `sanitizeMermaidSvg`；KaTeX `trust: false` 并限制 `maxSize`、`maxExpand`）。
- 外链只放行 `http`、`https`、`mailto`，统一经 `openExternalSafely`，不新开窗口、不让主窗口导航出去；本地路径与图片前端检查 + 主进程 `workspace-access.ts` 解析并检查 `escapes_root`，越界的不显示成可点也不加载；远程图片不加载、不发网络请求。
- 渲染器目前没有 CSP；以后加 CSP 时要允许 CM6 注入 `<style>`（`style-src` 需 nonce 或 `'unsafe-inline'`）以及 KaTeX 字体。

## 10. 性能与体积

- 行内装饰只算可见区域（ViewPlugin + `visibleRanges`），滚动时增量计算；块级 widget 用 StateField，只在文档 / 语法树变化或光标进出块使需露出的块集合变化时重算，光标在块外移动不重建。
- Lezer 增量解析，后台解析有时间预算，大文件首屏先出来、其余空闲时补齐；Mermaid 按源码 + 主题缓存；图片按路径缓存 data URL（换文档清空）；公式按 TeX 源码缓存 KaTeX 输出。
- 目标：1MB 样本文档打开后首屏 300ms 内可交互（不含懒加载 chunk 下载）；连续输入每次按键处理 ≤ 16ms。编辑器 chunk 不进首屏主包，KaTeX 单独成 chunk。

## 11. 工程约束

- 样式在 `styles/markdown-editor.css`，由 `styles/index.css` 以 `@import "./markdown-editor.css" layer(components);` 引入；CM 类名只能写全局 CSS，这是样式架构允许的例外，归属写在文件头注释里。
- CM 运行时注入的自带主题（`@codemirror/view`、`@codemirror/search` 的 baseTheme）不在 cascade layer 里，会压过 `layer(components)` 里的同名属性（与选择器优先级无关）。`core/layer-bridge.ts` 用一个 `EditorView.theme` 把这些属性设为 `revert-layer` 回退到样式文件取值；样式文件给 CM 自带主题也设置的元素和属性加规则时，要把属性补进桥接主题。
- 颜色只用 §6.2 的变量；字号只用 `var(--text-act-*)`（H3 局部变量除外）；KaTeX 的 CSS 由懒加载 chunk 自己 import，不进全局；单个文件 ≤ 500 行（`inline*.ts` 按元素类别拆分）；组件只 import `api/<域>`，不新增 IPC。

## 12. 不做

聊天消息区和轨迹详情的 Markdown 迁移到 CM6；预览里加列、拖动表格、合并单元格；远程图片、粘贴或拖入图片、新建文件；普通文字里的路径识别；原始 HTML 渲染（仅指文档面板；聊天区按白名单渲染，见聊天区规范 3.6）、脚注弹层、Wiki 链接 `[[...]]`、目录生成；悬停标题出现 `#` 锚点（光标进入标题本来就露出 `#`）；协同编辑、保存冲突检测、自动保存；文件监听；拼写检查；Vim、Emacs 键位。
