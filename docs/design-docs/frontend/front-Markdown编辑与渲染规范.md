# Markdown 编辑与渲染规范

更新：2026-11-03。状态：已实施（执行计划见 [20261102-md-render](../../exec-plans/completed/20261102-md-render.md)，执行摘要见 [exec-runs](../../exec-runs/20261102-md-render/execution-summary.md)）。

来源：

- 交互 demo 在 [md-render-demo/](md-render-demo/README.md)，截图在 `md-render-demo/shots/`。
- 样式和 D1–D12 由用户在 2026-11-02 逐项确认。
- 架构选的是方案 B。
- 设计参照 Codex App 的 Markdown 编辑器，它也用 CodeMirror 6。

## 1. 定位与范围

本文规定「文档」面板正文区的 Markdown 编辑与渲染：

- 预览和源码两种模式**都能编辑**，共用同一份文档。
- 预览模式是“所见即所得”的实时预览。语法标记平时隐藏，光标进入时露出。

面板的树、操作栏、草稿、保存、新鲜度、离开确认等规则，仍以[文档面板规范](front-文档面板规范.md)为准。本文只取代其中“预览 / 源码编辑器 / 渲染要求”这几部分。

| 范围 | 说明 |
| --- | --- |
| 包含 | 「文档」面板的预览、源码、大纲、查找、文中路径与链接的打开 |
| 不包含 | 聊天消息区的 Markdown（继续用 `react-markdown` 的 `MarkdownProse`，同一计划另行改造，见 [聊天区 Markdown 渲染规范](front-聊天区Markdown渲染规范.md)）；轨迹详情里的 Markdown；图片 Tab、远程 Host 文本 Tab |

强调色只在这里改：Markdown 编辑器默认用信息蓝，**应用全局的默认强调色不变**，仍是近黑。

## 2. 已确认的决定

### 2.1 预览规则 D1–D12

| # | 决定 | 说明 |
| --- | --- | --- |
| D1 | 按语法节点露出标记 | 光标进入哪个节点（如 `**粗体**`），只露出这个节点的标记，同一行别的标记不动。 |
| D2 | 无序列表显示成圆点 | 三层依次是实心点、空心点、方点。光标碰到时还原成 `-`。 |
| D3 | 任务列表显示可点击的复选框 | 点一下把 `[ ]` 改写成 `[x]`，或改回来。已完成的项划线、变淡。 |
| D4 | 表格显示成行内伪表格，单元格原地编辑 | 隐藏 `\|` 和分隔行，每行的列宽均分。预览里不能加列。 |
| D5 | 代码块围栏平时隐藏，光标进入时露出 ```` ``` ```` | 平时顶部是一条头：语言名 + 复制按钮。 |
| D6 | 单击链接直接打开 | 不需要按 ⌘。要改链接文字，用方向键移进去，或者切到源码。 |
| D7 | Frontmatter 显示成属性卡片 | 点一下卡片露出源码编辑，光标离开后变回卡片。 |
| D8 | Mermaid 实时 | 平时只显示图。光标进入围栏时露出源码，图在源码下方实时更新。 |
| D9 | 数学公式用 KaTeX 渲染 | 光标进入公式时露出源码。 |
| D10 | 只渲染工作区里的本地图片 | 远程地址显示原文，不发网络请求。 |
| D11 | 源码模式显示行号 | 只在源码模式下有行号。 |
| D12 | 行内代码里的路径识别成文件 | 显示为强调色 + 文件图标，带 `:行号` 的跳到那一行。普通文字里的路径不识别。 |

### 2.2 样式

- **排版**：照搬 Codex 的排版（见 §7.1）。用户看过宽松版，觉得不好看。
- **字体**：系统字体，即 `--font-sans` / `--font-mono`，不另引字体。
- **粗体**：用 700。600 在苹方里和正文几乎分不出来。
- **源码模式**：等宽 12px，行高 1.4。
- **图片**：居中显示。
- **引用条**：用强调色。
- **链接颜色（方案 C）**：在 ActSpace 里打开的目标，用强调色 + 文件图标；网页链接用链接色。按 §7.2 的映射，这两种颜色在任何强调色下都是同一个值，所以两者的区别只在文件图标和打开方式。
  - 在 ActSpace 里打开的目标：行内代码里的路径、指向本地文件的链接。
- **默认强调色**：信息蓝，与 `--act-color-link` 同一条规则：`var(--act-palette-*-accent, var(--act-color-info))`。
  - 用户选了调色板，就用调色板的颜色。
  - 没选（`data-accent="default"`），就用信息蓝。
- **提示框**：支持 GitHub 写法 `> [!NOTE|TIP|IMPORTANT|WARNING|CAUTION]`。

| 写法 | 显示 | 颜色 |
| --- | --- | --- |
| `[!NOTE]` | 说明 | info |
| `[!TIP]` | 提示 | success |
| `[!IMPORTANT]` | 重要 | 正文色 |
| `[!WARNING]` | 注意 | warning |
| `[!CAUTION]` | 警告 | danger |

## 3. 架构

### 3.1 方案 B：CM6 + Lezer 是唯一的编辑和解析核心

```
DocsReader（React，面板外壳，不变）
 └─ MarkdownEditor.tsx（React 薄壳：挂载 / 卸载、同步草稿、桥接宿主）
     └─ core/（纯 TS，不 import React，可单测）
         ├─ config.ts     组装扩展；Compartment 切换 预览 / 源码、只读、主题
         ├─ syntax.ts     Lezer markdown + GFM + 数学扩展（MathBlock / MathInline）+ 代码块语言懒加载
         ├─ inline.ts     ViewPlugin：只算可见区域的行内与行装饰（标记隐藏、链接、路径、列表、引用、表格、提示框）
         ├─ blocks.ts     StateField：块级 widget（Frontmatter、Mermaid、块公式）
         ├─ widgets/      各个 WidgetType（复选框、圆点、代码头、图片、公式、Mermaid、属性卡、提示框标签、文件图标）
         ├─ paths.ts      路径解析（相对当前文档）；识别规则来自共享的 components/markdown-common/paths.ts
         ├─ links.ts      点击路由：路径 / 本地链接 / #锚点 / 外链
         ├─ outline.ts    从语法树取 h2 / h3（纯函数）
         └─ host.ts       宿主接口类型
```

- 编辑、解析、渲染都在 CM6 里完成，**不再用 `react-markdown` 渲染预览**。
- 两种模式是同一个 `EditorView` 上的两套扩展，切换时只重新配置 Compartment，不重建 view。撤销历史、光标、选区、滚动位置都保留。
- widget 复用现有的渲染器，不另写一套：
  - Mermaid 用 `messages/mermaid-renderer.ts`；
  - 代码块配色用 `.act-code-hl` 的 `--md-hl-*` 变量；
  - 打开文件用 `files/open-workspace-path.ts`。
- 代码块高亮用 Lezer `@codemirror/language-data`，按语言懒加载，与 CM 的高亮体系是同一套。`right-panel/highlight.ts`（highlight.js）继续服务代码文件视图和聊天区，这里不用它。

### 3.2 宿主接口

core 不直接调用 `api/*`、React Context 或 `window`。需要外部能力时都经过宿主接口，由 `MarkdownEditor.tsx` 实现：

```ts
interface MarkdownEditorHost {
  /** 在 ActSpace 里打开工作区文件；relativePath 已规范化、已做越界检查。 */
  openPath(target: { relativePath: string; line?: number }): void;
  /** 打开外链（只会传 http / https / mailto）。 */
  openUrl(url: string): void;
  /** 读取工作区本地图片，返回 data URL；读不到返回 null。 */
  loadImage(relativePath: string): Promise<string | null>;
  /** 渲染 Mermaid；失败时 reject，带 MermaidRenderError。 */
  renderMermaid(source: string): Promise<MermaidRenderResult>;
}
```

这样 core 能在 vitest + jsdom 里单测，测试时传一个假的宿主即可。

### 3.3 懒加载

| 内容 | 什么时候加载 |
| --- | --- |
| 编辑器整体（CM6 + Lezer + core） | `React.lazy`，第一次打开文档面板正文时 |
| 代码块的语言包 | `language-data` 遇到该语言时 |
| KaTeX（JS + CSS + 字体） | 文档里第一次出现公式时，动态 `import()`；打包进应用，不走 CDN |
| Mermaid | 沿用 `mermaid-renderer.ts` 现有的懒加载 |

## 4. 数据流

- **草稿以 `RightPanelContext.docsDoc.draft` 为准**，读取、保存、新鲜度、离开确认的规则都不变。
- **编辑器 → 草稿**：文档变化后，每帧最多同步一次，用 `requestAnimationFrame` 合并。
- **草稿 → 编辑器**：只在“外部替换”时整份写入，同时清空撤销历史。用户自己输入引起的草稿变化不会回写编辑器，避免循环。外部替换有四种：
  1. 换了一篇文档；
  2. 点了「重新加载」；
  3. 恢复暂存的草稿；
  4. 首次读取完成。

  保存后只更新 `original` 和 `mtime`，正文不变，所以不算外部替换。
- **Agent 改了同一个文件**：沿用“已变化”提示条，不打断编辑。保存时以人为准，不做冲突检测。
- **截断的文件**（超过 2MB 读取上限）：两种模式都设为只读，提示“文件过大，请用默认应用编辑”。
- **撤销历史**：切换模式时保留；面板卸载或换文档时丢失，与现在一样。

## 5. 预览模式：逐元素规则

“露出”指光标或选区碰到该节点（D1）。编辑器**失去焦点时一律不露出**，即纯阅读状态，光标留在哪里都不影响显示。

| 元素 | 平时 | 露出时 |
| --- | --- | --- |
| 标题 `#` | 隐藏 `#` 和后面的空格，按级别排字号 | 显示 `#`（淡色） |
| Setext 标题（`===` / `---` 下划线） | 隐藏下划线那一行 | 显示下划线 |
| 粗体、斜体、删除线、行内代码的标记 | 隐藏 | 显示（淡色） |
| 行内代码 | 灰底等宽 | 同左，加上露出的反引号 |
| 行内代码里的路径（D12） | 强调色 + 文件图标，单击打开 | 显示反引号；单击仍会打开（D6） |
| 链接（`[文字]` 加 `(url)`） | 只显示文字。本地文件用强调色 + 文件图标，网页链接用链接色 | 显示完整语法，url 淡色 |
| 裸 URL、`<自动链接>` | 链接色，可点 | — |
| 图片（`![]` 加相对路径，D10） | 隐藏源码，在下方居中显示图片，最大宽度 100% | 显示源码，图片仍在下方 |
| 远程图片 | 显示原文（淡色），悬停提示“远程图片不加载” | — |
| 无序列表（D2） | 圆点，三层依次是实心点、空心点、方点 | `-` / `*` / `+` 原文 |
| 有序列表 | 显示序号原文（淡色） | — |
| 任务列表（D3） | 复选框，单击改写 `[ ]` ↔ `[x]`；已完成的项划线变淡 | 显示 `[ ]` 原文 |
| 引用 | 左侧 4px 强调色竖条，`>` 隐藏，嵌套时竖条叠加 | 显示 `>` |
| 提示框 | 首行 `[!TYPE]` 换成“说明 / 提示 / …”标签，竖条和标签用对应语义色 | 显示 `[!TYPE]` |
| 分隔线 | 一条细线 | 显示 `---` |
| 表格（D4） | 隐藏 `\|` 和分隔行，单元格均分列宽，表头加粗、带底色 | 光标所在的单元格显示两侧的 `\|` |
| 代码块（D5） | 隐藏围栏，顶部显示“语言名 + 复制”，按语言高亮 | 显示两行围栏，代码头收起 |
| 未闭合的代码块 | 按代码块显示，不隐藏 | — |
| Mermaid（D8） | 只显示图，图上有“查看大图” | 显示源码，图在下方实时更新（防抖 300ms）；出错时在图的位置显示错误，并保留上一张图 |
| 块公式 `$$`（D9） | KaTeX 居中显示 | 显示源码 |
| 行内公式 `$…$` | KaTeX 行内显示 | 显示源码 |
| Frontmatter（D7） | 属性卡片：键淡色，值正文色；复杂值（数组、对象、多行）按原文显示 | 显示 YAML 源码（淡色等宽） |
| 原始 HTML | 按原文显示，不执行 | — |

补充：

- **公式语法**：块公式是独占一行的 `$$` 开头和结尾。行内公式是 `$…$`：开头的 `$` 后面不能是空格，结尾的 `$` 前面不能是空格、后面不能紧跟数字。这样 `$5 和 $10` 不会被当成公式。转义写法 `\$` 不算公式。
- **出错时显示原文**：KaTeX 用 `throwOnError: false`，写错的公式显示原文并标成危险色。Mermaid 出错的类型沿用 `MermaidErrorKind`。
- **复制按钮**：代码块的「复制」复制代码原文，不含围栏。

## 6. 源码模式

- 等宽 12px，行高 1.4，左侧显示行号（D11）。
- 只做语法着色，不做任何隐藏、替换或 widget：标题加粗，标记淡色，链接 url 淡色，代码块按语言着色。
- 自动换行，与预览模式一致。
- 大纲、查找、⌘S、列表续行在源码模式下都可用。

## 7. 排版与颜色

### 7.1 排版（Codex 原样）

| 项目 | 值 |
| --- | --- |
| 正文 | 14px（`--text-act-md`），行高 1.4，每行上下各加 2px，字重 430 |
| 标题 | H1 24px（`--text-act-title`），H2 20px（`--text-act-xl`），H3 18px，H4–H6 14px；字重都是 500 |
| 粗体 | 700 |
| 行内代码、代码块 | 12px（`--text-act-xs`），代码块左右内边距 12px |
| 引用 | 竖条 4px，左内边距 12px |
| 正文区 | 左右各 16px，顶部 12px，底部留 64px，方便最后一行滚到中间编辑 |
| 源码模式 | 12px，行高 1.4 |

H3 的 18px 在全局字号档位里没有对应的 token。规定只在 `markdown-editor.css` 里定义一个局部变量 `--md-h3-size: 18px`，不新增全局 token。其余字号都用 `var(--text-act-*)`。

正文最大宽度沿用文档面板现在的 760px，居中显示。

### 7.2 颜色映射

所有颜色都用主题变量，浅色、深色自动翻转，不写死字面量。

| 用途 | 变量 |
| --- | --- |
| 编辑器强调色 `--md-accent` | `var(--act-color-link)`（即调色板强调色，未选时为信息蓝） |
| 引用竖条、文件路径、本地链接、文件图标 | `--md-accent` |
| 网页链接 | `--act-color-link` |
| 正文、标题 | `--act-color-text` |
| 露出的语法标记、列表序号、行号 | `--act-color-text-faint` |
| 行内代码 | `--act-color-inline-code-bg` / `-border` / `-text` |
| 代码块底色、边框 | `--act-color-code-bg-top` / `-bottom` / `--act-color-code-border` |
| 代码高亮 | `.act-code-hl` 的 `--md-hl-*` 变量，CM 高亮标签映射到这套变量 |
| 表头 | `--act-color-table-head-bg` / `-text` |
| 分隔线、表格线 | `--act-color-border` |
| 选区 | `--act-color-selection` |
| 提示框 | info / success / text / warning / danger 对应的 `--act-color-*`（类型、标签、语义色定义在共享的 `components/markdown-common/callouts.ts`，聊天区同用） |
| 公式出错 | `--act-color-danger` |

## 8. 文中路径与链接

### 8.1 识别

- **行内代码路径（D12）**：同时满足以下三条，才识别为路径：
  1. 整段行内代码是一个路径，可带 `:行号` 或 `:行号-行号`；
  2. 包含 `/`，或者以常见的文件扩展名结尾；
  3. 不含空格，不是 URL。

  版本号（`1.2.3`）、`a/b` 这种没有扩展名的短片段不识别。规则写在共享模块 `components/markdown-common/paths.ts`，聊天区也用它；单测覆盖 demo 里的全部正反例。
- **本地链接**：链接目标没有协议、不以 `#` 开头，就是本地链接。
- **普通文字里的路径**：不识别。

### 8.2 解析

| 写法 | 相对于 |
| --- | --- |
| 行内代码路径 | 工作区根目录；以 `./`、`../` 开头的相对于当前文档所在目录 |
| Markdown 链接、图片 | 当前文档所在目录 |
| 工作区内的绝对路径 | 去掉工作区根目录前缀，变成相对路径 |
| 工作区外的绝对路径、`~` 开头、越出工作区的 `..` | 不识别，按普通文字或普通链接显示，不可点 |

- 解析后的路径用 `isSafeWorkspaceRelativePath` 检查。
- 主进程仍会再做一次 `escapes_root` 检查，前端检查只是为了不显示成可点。

### 8.3 打开（D6：单击直接打开）

| 目标 | 怎么打开 |
| --- | --- |
| `#标题` | 在当前文档内平滑滚动到对应标题。标题 slug 按 GitHub 规则生成。 |
| 本地 Markdown | 用 `openWorkspacePath` 在文档面板里打开。带行号的，打开后滚动到那一行并选中整行。 |
| 本地图片、其他文件 | 用 `openWorkspacePath`：图片开图片 Tab，其他文件交给系统默认应用，打不开时弹兜底对话框（沿用现有规则）。 |
| `http` / `https` / `mailto` | 用 `window.open`。主进程的 `setWindowOpenHandler` 会转给 `openExternalSafely`，与聊天区外链走同一条路。 |
| 其他协议（`javascript:`、`file:` 等） | 不可点，按普通文字显示。 |

- **行号只对 Markdown 生效**。实现方式：「文档」Tab 的一次性请求 `select` 加一个可选的 `line` 字段，由文档面板在读取完成后滚动到该行。其他文件交给外部应用，行号忽略。
- **点击位置**：用 `view.posAtDOM(event.target)` 定位，不用 `posAtCoords`。在折行加上隐藏标记的情况下，`posAtCoords` 会落到下一行（demo 里踩过这个坑）。
- **选中文字时不打开**：鼠标在链接上拖动选择时不触发打开；按住 ⌘ 或 Shift 单击也不打开，留给选区操作。

## 9. 交互

### 9.1 键盘

| 按键 | 行为 |
| --- | --- |
| ⌘S / Ctrl+S | 保存（沿用 `onSave`）；只读时不响应 |
| Enter | 列表、任务列表、引用自动续行；空的列表项按 Enter 结束列表（`markdownKeymap`） |
| Backspace | 在空列表项的开头时，删掉列表标记（`markdownKeymap`） |
| Tab / Shift+Tab | 在列表里缩进 / 反缩进；其他位置插入两个空格。按 Esc 之后再按 Tab，焦点移出编辑器（CM 默认的无障碍做法） |
| ⌘Z / ⌘⇧Z | 撤销 / 重做 |
| ⌘F | 打开编辑器内查找（`@codemirror/search`），面板放在顶部，文案改成中文。⌘G、⇧⌘G 跳到下一个 / 上一个，Esc 关闭 |
| 方向键 | 在被替换的 widget 之间按原子范围移动：复选框、圆点、公式、图片、Mermaid 图都算一个字符 |

### 9.2 大纲

- 从 Lezer 语法树取 h2、h3，**两种模式下都能用**，取代现在从 DOM 读标题的做法。
- 点击后滚动到标题所在行，标题与顶部留 12px 间距。
- 没有标题时显示“没有标题”。
- 浮层的样式和位置不变（`DocsOutline.tsx` 只换数据来源和滚动方式）。

### 9.3 复制与粘贴

- 复制和剪切复制的是 **Markdown 原文**，与选区在预览里显示成什么样无关。
- 粘贴按纯文本插入，不把粘贴进来的 HTML 转成 Markdown。

### 9.4 焦点

- 失去焦点时，所有节点回到“平时”的样子（§5），即纯阅读状态。
- 从操作栏切换模式后，焦点和光标留在编辑器里，可以直接接着打字。

## 10. 安全

- 原始 HTML 一律按原文显示，不插入 DOM，也不执行。
- 所有 widget 都用 `textContent` 或经过清理的内容写入 DOM：
  - Mermaid SVG 走 `sanitizeMermaidSvg`；
  - KaTeX 用 `trust: false`，并限制 `maxSize` 和 `maxExpand`。
- 外链只放行 `http`、`https`、`mailto`，统一经 `openExternalSafely`，不新开窗口，也不让主窗口导航出去。
- 本地路径与图片：
  - 前端用 `isSafeWorkspaceRelativePath` 检查；
  - 主进程经 `workspace-access.ts` 解析并检查 `escapes_root`；
  - 越界的不显示成可点，也不加载。
- 远程图片不加载，不发任何网络请求（D10）。
- 渲染器目前没有 CSP。以后加 CSP 时要允许 CM6 注入 `<style>`（`style-src` 需要 nonce 或 `'unsafe-inline'`），以及 KaTeX 的字体。

## 11. 性能与体积

- **行内装饰只算可见区域**（ViewPlugin + `visibleRanges`），滚动时增量计算。
- **块级 widget 用 StateField**，只在两种情况下重算：
  - 文档或语法树变了；
  - 光标进出了某个块，使需要露出的块集合发生变化。

  光标在块外移动时不重建。demo 里每次选区变化都整篇重算，正式实现不能照抄。
- **解析**：Lezer 增量解析，后台解析有时间预算（CM 默认）。打开大文件时首屏先出来，后面的部分在空闲时补齐。
- **Mermaid**：沿用渲染缓存，按源码 + 主题缓存。
- **图片**：按路径缓存 data URL，换文档时清空。
- **公式**：按 TeX 源码缓存 KaTeX 输出。
- **性能目标**：
  - 用 1MB 的样本文档测量；
  - 打开时，首屏在 300ms 内可交互（不含懒加载 chunk 的下载）；
  - 连续输入时，每次按键的处理时间在 16ms 以内。

  实测数字写进执行摘要。
- **体积**：编辑器 chunk 预计压缩前约 600KB（与 demo 的 bundle 相当），不进首屏主包。KaTeX 约 270KB，单独成 chunk。

## 12. 工程约束

- **样式写在哪里**：`styles/markdown-editor.css`，在 `styles/index.css` 里用 `@import "./markdown-editor.css" layer(components);` 引入。CM 的类名只能用全局 CSS 写，这是 [Tailwind 样式架构](front-tailwind-style-architecture.md)允许的例外，归属写在文件头注释里。
- **和 CM 自带主题的层叠关系**：CM 运行时注入的自带主题（`@codemirror/view`、`@codemirror/search` 的 baseTheme）不在 cascade layer 里，会压过 `layer(components)` 里的同名属性，与选择器优先级无关（字体、`.cm-line` 内边距、表格行 `display`、预览居中等都会失效）。`core/layer-bridge.ts` 用一个 `EditorView.theme` 把这些属性设为 `revert-layer`，回退到样式文件的取值。样式文件给 CM 自带主题也设置的元素和属性加规则时，要把属性补进桥接主题；`docs/exec-runs/20261102-md-render/tools/check-editor-css.mjs` 在浏览器里检查计算样式。
- **颜色**：只用 §7.2 的变量，`check:frontend-theme` 必须通过。
- **字号**：只用 `var(--text-act-*)`，唯一的例外是 H3 的局部变量 `--md-h3-size`。
- **KaTeX 的 CSS**：由懒加载的 chunk 自己 import，不进全局。
- **文件拆分**：单个文件不超过 500 行。`inline.ts` 按元素类别拆成多个文件，由一个入口汇总。
- **调用 main**：组件只 import `R/api/<域>`，宿主接口的实现也一样。不新增 IPC。

## 13. 删除

| 删除 | 原因 |
| --- | --- |
| `components/right-panel/docs/MarkdownSourceEditor.tsx` | 源码模式改由 CM6 实现 |
| `components/right-panel/MarkdownRenderView.tsx`（`MarkdownPreviewBody`） | 预览改由 CM6 实现。它唯一的使用方是 `DocsReader` |
| `styles/markdown.css` 里的 `.markdown-doc` 规则 | 只服务于上一项。`.markdown-prose` 和 `.act-code-hl` 保留，聊天区和代码视图还在用 |
| `test/markdown-source-editor.test.tsx`、`test/markdown-render-view.test.tsx` | 被测组件已删除，行为由新测试覆盖 |
| `right-panel/highlight.ts` 注释里关于 Markdown fenced code 的说明 | 改成只描述代码视图和聊天区 |

保留的：

- `react-markdown`、`remark-gfm`、`rehype-highlight`、`highlight.js` 这些依赖：聊天区和轨迹详情还在用。
- `messages/markdown-blocks.ts`：聊天区在用。

## 14. 不做

- 聊天消息区和轨迹详情的 Markdown 迁移到 CM6。
- 预览里加列、拖动表格、合并单元格（D4 的取舍）。
- 远程图片、粘贴或拖入图片、新建文件。
- 普通文字里的路径识别。
- 原始 HTML 渲染（只指文档面板；聊天区按白名单渲染，见聊天区规范 §5.6）、脚注弹层、Wiki 链接 `[[...]]`、目录生成。
- 悬停标题时出现的 `#` 锚点（原文档面板规范“渲染做精”里的一项）：光标进入标题时本来就会露出 `#`，再加一个是重复的。
- 协同编辑、保存冲突检测、自动保存。
- 文件监听：沿用文档面板的两级新鲜度信号。
- 拼写检查。
- Vim、Emacs 键位。

## 15. 实施位置

| 内容 | 位置（`apps/desktop/src/renderer/` 下） |
| --- | --- |
| React 外壳 | `components/markdown-editor/MarkdownEditor.tsx`（`React.lazy` 入口：`components/markdown-editor/index.ts`） |
| 核心 | `components/markdown-editor/core/config.ts`、`syntax.ts`、`inline*.ts`、`blocks.ts`、`paths.ts`、`links.ts`、`outline.ts`、`host.ts` |
| widget | `components/markdown-editor/core/widgets/*.ts` |
| 样式 | `styles/markdown-editor.css` |
| 面板集成 | `components/right-panel/docs/DocsReader.tsx`、`DocsOutline.tsx` |
| 行号跳转 | `components/right-panel/RightPanelContext.tsx`（docs Tab 的 `select` 加上 `line`）、`components/files/open-workspace-path.ts` |
| 依赖 | `apps/desktop/package.json`：`@codemirror/state`、`view`、`language`、`commands`、`search`、`lang-markdown`、`language-data`、`@lezer/markdown`、`@lezer/highlight`、`katex` |
| 浏览器 mock | `mock/docs-fixture.ts`（示例文档 + 本地图片） |
| 测试 | `test/markdown-editor-*.test.ts(x)`、`test/docs-panel.test.tsx` |

## 16. 测试与验收

**单元测试**（vitest + jsdom）：

- `paths.ts`：识别和解析的正反例（含版本号、URL、带空格、越界、工作区内绝对路径、`:行号-行号`）。
- 装饰：按 §5 的每一行，断言“平时 / 露出 / 失焦”三种状态下的装饰。
- 数学扩展：块公式、行内公式的边界（含 `$5 和 $10`、`\$`）。
- `outline.ts`：Setext 标题、代码块里的 `#` 不算标题。
- 复选框点击改写原文；表格单元格编辑；链接点击路由；提示框识别。

**组件测试**：

- `DocsReader` 切换模式时保留光标和撤销历史。
- 未保存圆点、⌘S、截断文件只读。
- 重新加载会整份替换内容并清空撤销历史。
- 换文档、大纲在两种模式下都能跳转。

**性能**：用 1MB 样本记录打开和输入的耗时（§11）。

**浏览器 mock**：

- 在 `mock/docs-fixture.ts` 里加一篇覆盖 §5 全部元素的示例文档，内容取自 demo 示例；再加一张本地图片，由 mock 的 `readFile` 返回 data URL。
- 用默认 mock 场景截图，浅色、深色、480px 窄窗各一张，与 demo 截图对照。

**Electron 实机**（Codex CU 验收）：

- 真实工作区打开文档、编辑、保存。
- 点击路径和本地链接、带行号跳转、外链交给系统浏览器。
- Mermaid、公式、本地图片。
- 切换强调色、深色主题。
- Agent 同时改文件时出现提示条。

## 17. Demo 截图

| 截图 | 内容 |
| --- | --- |
| `md-render-demo/shots/01-preview-top.png` | 文件头属性卡、标题、正文 |
| `02-lists-tasks.png` | 圆点列表、任务复选框 |
| `03-quote-callouts.png` | 引用、五种提示框 |
| `04-code-table.png` | 代码块头、行内伪表格 |
| `05-mermaid-math.png` | Mermaid、KaTeX |
| `06-paths.png` | 行内代码路径、本地链接、网页链接 |
| `07-source.png` | 源码模式与行号 |
| `08-dark.png` | 深色主题 |
