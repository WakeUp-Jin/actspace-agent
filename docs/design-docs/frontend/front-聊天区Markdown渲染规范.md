# 聊天区 Markdown 渲染规范

管聊天区 Markdown 的渲染、排版、流式效果和 Mermaid 图表。组件是 `components/messages/MarkdownProse.tsx`，插件与子组件在 `components/messages/markdown/`。决策表、问题清单、流式实测与测试清单见 `docs/exec-plans/completed/design-archive/frontend/front-聊天区Markdown渲染-决策与验收.md`。

## 1. 范围

| 范围 | 说明 |
| --- | --- |
| 包含 | 用 `MarkdownProse` 渲染的两处：助手回复（`AssistantReply`）、右侧子 Agent 面板（`SubagentsPanel`，本地 / Fork 子智能体的对话记录与外部 Agent 最终结果）；两处共用同一套实现，没有开关 |
| 不包含 | 「文档」面板（CodeMirror 6，见 [front-Markdown编辑与渲染规范.md](front-Markdown编辑与渲染规范.md)）；轨迹详情里的 Markdown；用户消息；生成图片的轮尾列表 |

与「文档」面板的关系：共用路径识别规则（`components/markdown-common/paths.ts`）、提示框写法与语义色（`callouts.ts`）、链接 / 路径颜色规则（`--act-color-link`）、代码高亮配色 `.act-code-hl`、KaTeX 懒加载 chunk。各自不同：聊天区是阅读场景、排版见 §4、原始 HTML 按白名单渲染、技术栈 unified（remark / rehype，处理器常驻，见 `markdown/processor.ts`）；文档面板是编辑场景用 Codex 排版、原始 HTML 按原文显示、用 CM6。生成图片是工具产物，不并入 Markdown，只管回复文字里写的图片。

## 2. 架构

```text
MarkdownProse（content, onOpenWorkspaceFile）
  ├─ 平滑输出：流式时按帧放出积压的文字
  ├─ 降频解析：尾部最多每 100ms 解析一次，之间新放出的字作为原样尾巴显示
  ├─ 分块：splitMarkdownBlocks + 合并未闭合的 <details>
  ├─ 全局定义：脚注、引用式链接定义
  └─ 每块用常驻的 unified 处理器解析渲染（processor.ts）
       remark：gfm → math* → callouts → codeMeta → breaks
       rehype：raw* → sanitize* → inlinePaths → katex* → highlight → streamTail（只在流式的最后一块，放尾巴和渐显的占位）
       components：a / pre / code / img / table 覆盖，加上尾巴与渐显组件（StreamTail.tsx）
```

带 `*` 的插件按需加载。宿主能力经 context 注入，`MarkdownProse` 的 props 不变：

| 能力 | 来源 | 没有时 |
| --- | --- | --- |
| `openPath(path, line?)` | `useWorkspaceFileLinks().openWorkspaceFile`，带行号 | 路径和本地链接按普通文字显示，不可点 |
| `loadImage(path)` | 本机：`workspacesApi.readFile` 取 `dataUrl`；远端会话不加载 | 显示占位 |
| `openUrl(url)` | 链接 `target="_blank"`，主进程 `setWindowOpenHandler` 交给 `openExternalSafely` | — |
| 流式状态 | `ReplyStreamingContext` | 默认不在流式 |

行号只在打开 Markdown 时生效（跳到「文档」面板对应行），其他文件交给系统应用、忽略行号。`AssistantReply` 与 `SubagentsPanel` 都接上 `useWorkspaceFileLinks`。

## 3. 元素规则

### 3.1 路径与链接

- 识别规则与文档面板相同，只写一份放在 `components/markdown-common/paths.ts`。聊天没有「当前文档」，行内代码路径和本地链接一律相对工作区根目录：工作区内的绝对路径去掉根前缀；工作区外的绝对路径、`~` 开头、含 `..` 的不识别，按普通行内代码或链接显示。普通文字里的路径不识别。
- 路径显示：强调色等宽字，底色为强调色 9%（hover 16%），前有 12px 文件图标；长路径可在任意位置断行，每段都带底色（`box-decoration-break: clone`）；悬停提示「在 ActSpace 中打开（第 N 行）」。本地链接文字前加文件图标，单击打开。
- 网页链接只放行 `http`、`https`、`mailto`，走系统浏览器，其他协议不可点。`#片段` 只在当前回复内查找、滚动、转移焦点；脚注与回链用每条回复稳定的 `clobberPrefix` 命名空间，避免多回复同名脚注串跳。

### 3.2 代码块

| 项目 | 规则 |
| --- | --- |
| 头部 | 左边语言显示名（TypeScript、Shell…；没标语言写「文本」），可跟文件名标题；右边「换行」和「复制」 |
| 文件名标题 | 支持 ```` ```ts title="path/to/a.ts" ````；标题是路径时可点开（同 3.1），过长省略 |
| 按钮显隐 | 鼠标悬停或键盘聚焦到代码块时才出现 |
| 换行 / 复制 | 换行只影响当前代码块；复制代码原文（不含围栏），之后 1.2 秒显示「已复制」 |
| 高亮 | 只按标注的语言高亮，**不自动识别语言**，没标语言按纯文本 |
| 折叠 | 挂载时就已闭合且超过 22 行：只显示前 18 行，底部渐隐，下方按钮「展开全部 N 行」，展开后变「收起」 |
| 流式中 | 围栏未闭合时头部右边显示「写入中 · N 行」加脉冲圆点，不显示按钮；代码块自然变高，不封顶、不内部滚动；写完后换成按钮，**不自动收起**（刚写完的内容用户可能正在读，收起会让内容整段跳走） |

### 3.3 提示框

- GitHub 写法 `> [!NOTE|TIP|IMPORTANT|WARNING|CAUTION]`，标签依次为 说明 / 提示 / 重要 / 注意 / 警告；语义色依次 info / success / 正文色 / warning / danger，与文档面板一致。
- 左侧 2px 语义色竖条，左内边距 18px；首行显示标签（12px、600、字距 0.04em、语义色）。标签用 CSS `::before` 生成，不进入 DOM 文本，批注和复制得到的文字不含标签。

### 3.4 公式

- 块公式是独占一行的 `$$` 开头和结尾；行内公式 `$…$` 要求开头 `$` 后不是空格、结尾 `$` 前不是空格且后面不紧跟数字（所以 `$5 和 $10` 不算公式）；`\$` 不算公式。`remark-math` 默认会把 `$5 和 $10` 识别成公式，所以后面加一个 remark 插件把不合规的行内公式还原成文字。
- KaTeX：`throwOnError: false`、`trust: false`、`strict: "ignore"`，限制 `maxSize` 和 `maxExpand`；写错的公式显示原文并标危险色。行内公式 1.05 倍字号；块公式居中，过宽在公式内横向滚动，不撑宽正文；流式中未闭合的公式按原文显示。

### 3.5 图片

| 来源 | 显示 |
| --- | --- |
| 工作区内相对路径（本机会话） | 经 `loadImage` 读成 data URL：居中、最大宽 100%、圆角 12px；按路径缓存，同一回复不重复读取 |
| 读取失败、太大、格式不支持 | 一行淡色占位「图片：说明文字（找不到文件）」 |
| 远端会话 | 一行占位文字，单击用 `openPath` 打开 |
| `http` / `https` 远程图片 | **不加载**、不发任何网络请求，显示「图片：说明文字（远程地址，不加载）」，悬停提示「远程图片不加载」（隐私：不让回复里的远程地址追踪用户） |
| 原始 HTML 里的 `<img>` | 同上，走同一个图片组件 |

### 3.6 原始 HTML

- 用 `rehype-raw` 解析，再用 `rehype-sanitize` 按 GitHub `defaultSchema` 白名单清理；允许 `details`、`summary`、`kbd`、`sub`、`sup`、`br`、`ins`、`del`、`img`、`a` 等；一律去掉 `script`、`style`、`iframe`、`on*` 事件属性、`style` 属性、`javascript:` 等协议。
- `clobber` 置空，改由 `clobberPrefix` 给每条回复的 id / name 加稳定前缀。额外放行的属性只有本组件自己加的：`language-*`、`math-*` 类名，`data-path`、`data-line`、`data-meta`，提示框类名与 `data-callout-label`。
- `<details>` 里常有空行会被分块切开：遇到没闭合的 `<details>`，把后面的块并进来直到 `</details>`（`merge-html-blocks.ts`）。`<details>` 是带边框的圆角框，摘要行用淡色；`<kbd>` 是带下边框的等宽小键帽。

### 3.7 其他

- 单个换行显示为换行（`remark-breaks`）。任务列表复选框只读，不可点（聊天回复是历史记录，不是可编辑文档）。

### 3.8 Mermaid 图表

助手回复（含子 Agent 最终报告）中语言完整匹配 `mermaid`（不区分大小写、忽略首尾空白）且 fence 已闭合的代码块渲染为图表；`mer` 这类前缀和未闭合 fence 仍按普通代码块显示。

- 外壳与顶栏复用代码块样式（见 4.5），顶栏提供查看源码、复制源码、下载 PNG、放大；工具栏在画布外，避免深色 UI 下按钮压在浅色画布上。
- 图表颜色与应用主题解耦：固定使用 Codex 浅色预设（`mermaid-renderer.ts` 的主题注册表，偏好 `AppearancePrefs.mermaidTheme`，旧记录回落 `codex`），不随应用深浅主题翻转。聊天列即 `--conversation-content-width`，图表不越出列宽，过宽最多缩到 72%，再宽块内横向滚动。
- 渲染失败只在该块显示简短提示并展开源码，不影响同条回复其他内容；流式未闭合时保留代码块显示。
- 放大预览（`MermaidPreviewDialog.tsx`）：适配视口（不放大），档位 25%–500%，Ctrl/⌘ + 滚轮以光标为锚，拖拽平移，`+` / `-` / `0` 与 Esc，关闭后焦点归还；只做缩放 / 平移，不做源码编辑。
- 安全：源码按不可信输入处理。固定 Mermaid `strict` 配置，源码不能覆盖 `securityLevel` 等；剥离 `%%{init}%%`、frontmatter `config`、`click` / `link` / `callback`；禁用 HTML labels 与外链；DOMPurify 二次净化（只保留 `#` 内部 href）。上限：源码 20,000 字符、500 条边、10 秒渲染、SVG 2 MB；超限落入错误状态并允许查看源码。
- 性能：Mermaid 核心按需加载，同一源码 + 主题有 LRU（32）缓存与并发去重，每个实例重写 id 避免 marker / filter 冲突；SVG 只在当前 DOM，不写 Session、磁盘或 artifact，恢复会话时由正文重新渲染。不记录完整回复、源码或 SVG 到日志。

## 4. 排版

颜色全部用主题变量，浅色深色自动翻转。字号、行高、字重的总规则见 [视觉 token 规范 §5](front-视觉token规范.md#5-字体与字号)，这里只写聊天正文的取值。

### 4.1 字体与正文

| 项目 | 值 |
| --- | --- |
| 正文字体 | `--act-font-ui`，和界面同一套字体；不用衬线，没有单独的阅读字体 |
| 字号 / 行高 | 15px（`--text-act-base`）/ 1.7 |
| 块间距 / 粗体 | 12px / 600；文字色 `--act-color-text` |

### 4.2 标题、列表、引用、分隔线

- 标题：字重 600，行高 1.35，不加字距；H1 20px、H2 18px、H3 16px、H4 15px。H1 / H2 上外边距 14px（加块间距共 26px），H3 / H4 上外边距 8px；标题是第一个块时上外边距为 0。
- 列表：项间距 6px，左缩进 1.6em，圆点和序号用 `--act-color-text-faint`。任务列表去掉圆点（左缩进 0.2rem），复选框 14px、圆角 4px、边框 1.5px `--act-color-border-strong`，勾选时底色 `--act-color-link` 加白色对勾，完成项 faint 色加删除线。
- 引用：左侧 2px `--act-color-border` 竖条，左内边距 18px，文字 `--act-color-text-muted`。提示框标签 12px、600、字距 0.04em、语义色。
- 分隔线 1px `--act-color-border`，上下各 6px；`<details>` 14px；图片下的说明 13px faint；链接沿用链接色加淡色下划线，悬停下划线变链接色。

### 4.3 行内代码

等宽 0.87em（正文里约 13px），内边距 0.14em 0.4em，1px `--act-color-inline-code-border` 边框、圆角 5px、底色 `--act-color-surface-subtle`；路径字号和内边距相同，颜色见 3.1。`kbd` 0.8em。

### 4.4 表格

14px / 行高 1.6，数字等宽（`tabular-nums`）；无外框和底色，外层容器负责横向滚动；表头 12px、500、`--act-color-text-faint`、下边框 1px `--act-color-border-strong`，表头和内容靠字号与颜色区分，不靠加粗；每行下边框 1px `--act-color-border`（最后一行不加）；单元格内边距上下 8px、右 16px、左 0，表头和右对齐的列不换行；流式中固定列宽，结束后恢复自动列宽。

### 4.5 代码块外观

不要边框，圆角 12px（`--radius-lg`），底色 `--act-color-surface-subtle`；头部高 36px、左内边距 18px、12px faint，与代码之间不画分隔线；代码等宽 `--act-font-mono-size`、行高 1.65、内边距左右 18px / 上 0 / 下 16px；折叠时底部 64px 渐隐遮罩，按钮 12px muted。

## 5. 流式输出

| 效果 | 规则 |
| --- | --- |
| 新块淡入 | 流式中新出现的顶层块从透明淡入，420ms ease-out，只改透明度、不位移 |
| 末尾渐显 | 只作用于正在写的回复的最后一块：从末尾往前数，第 1–10 个字透明度 0.22，第 11–22 个字 0.5，第 23–36 个字 0.8；公式内部不参与 |
| 光标 | 0.5em 呼吸圆点（`--act-color-text-muted`，1.1 秒周期），紧跟最后一个可见字 |
| 减少动态效果 | 取消淡入和呼吸，末尾渐显照常（它只是静态透明度） |

「正在写的回复」指这一轮仍在流式、且是本轮最后一项的那条回复（`TurnView` 通过 `WritingReplyContext` 指定）。一轮里模型说完一句就去调工具时，这句后面已接了工具行，它已写完：平滑输出、末尾渐显和光标都不再给它，只有平滑输出积压没放完时继续放完。版面稳定规则（mermaid 保持代码块、表格固定列宽）仍按整轮算（`ReplyStreamingContext`），这一轮结束才换成最终形态。

稳定性硬约束（违反任一条，内容高度会一帧一跳）：

1. 光标放在结尾空白（含换行）之前，不能落在结尾换行符后面（否则多出一行，下一帧又收回）。
2. 代码块里不放光标（头部已有「写入中」）。
3. 流式中的代码块自然变高、不封顶不内部滚动，写完不自动收起。
4. 平滑输出的切点不停在半截语法上。
5. 表格流式中固定列宽。

平滑输出（`smooth-text.ts` 的 `useSmoothText` / `snapCut`）：网络 token 一批一批到，平滑输出按帧匀速放出积压——每帧放出「剩余积压 ÷ 12」个字符，向上取整、至少 1 个，约 200ms 追平。切点不停在当前行未闭合的反引号或 `**`、链接语法中间、表格行或代码围栏开头行没写完处；后文已到则挪到语法结束，没到就停在原处等。网络流结束后积压继续按帧放完，放完前仍按流式显示；内容变短（重新生成、切换回复）或不在流式时直接显示全部。

## 6. 分块与性能

- 沿用 `splitMarkdownBlocks`：除最后两块外冻结复用，只重解析尾部；其后 `mergeHtmlBlocks` 合并未闭合的 `<details>`。
- 脚注与引用式链接定义（`definitions.ts`）：分块时全局收集 `[x]: url` 和 `[^x]: …`；块里引用了哪些定义，就把它们追加到该块源码末尾再解析（定义本身不在块内显示）；每块自己生成的脚注区去掉，整条回复只在最后渲染一次脚注区，编号按定义在全文中第一次被引用的顺序；块的 memo 依赖它用到的定义内容，定义到达或变化只重渲染引用它的块。不再因出现脚注或引用式定义就退回整条一块。
- 尾部降频解析：流式时最后一块最多每 100ms 重新解析一次，遇到新的一行、平滑输出追平网络、回复写完时立即解析；两次之间新放出的字作为原样尾巴接在最后一块末尾（没闭合的代码块里接在代码区），末尾渐显和光标由尾巴组件负责。处理器按管线组合常驻，不每次重建。详见 [流式 Markdown 解析降频规范](front-流式Markdown解析降频规范.md)。
- 正常流式每次更新渲染耗时约 0.4ms；平滑输出每帧只重渲染最后一块，两次解析之间只重渲染尾巴组件。数学（`remark-math`、`rehype-katex`、KaTeX 与 CSS）在某块源码第一次出现 `$` 时按需加载；原始 HTML（`rehype-raw`、`rehype-sanitize`）在第一次出现像 HTML 标签的文本（`/<\/?[a-z][\w-]*[\s>/]/i`）时按需加载；加载完成前这一块按原文显示，加载后只重渲染需要的块。主包增量不超过 10KB（gzip）。
- `MarkdownProse` 与 `AssistantReply` 仍用 `memo`；新加的 context 值和插件数组必须是稳定引用，否则整页历史回复每帧重渲染（见 [front-会话状态与数据流规范.md](front-会话状态与数据流规范.md)）。

## 7. 安全

- 原始 HTML 只按白名单渲染且渲染前一定先清理；链接协议只放行 `http`、`https`、`mailto`；远程图片不加载；KaTeX `trust: false`。
- 本地路径和图片：前端用 `isSafeWorkspaceRelativePath` 检查，主进程经 `workspace-access.ts` 再检查一次 `escapes_root`。

## 8. 与批注的兼容

回复批注依赖「可批注可见文本」（`response-annotation-text.ts`，见 [front-composer-file-mentions-and-response-annotations.md](front-composer-file-mentions-and-response-annotations.md)）。

- 末尾渐显的 `span` 和光标只拆分文本节点、不改变文字；文件图标是 SVG，提示框标签是 CSS 生成内容，都不产生文本；`remark-breaks` 产生的 `<br>` 不改变可批注文本。
- KaTeX 输出要排除在可批注文本外（`data-annotation-exclude`，`rehype-math-exclude.ts`），否则 MathML 与 HTML 两份文字会重复计入。排除节点与代码块一样算「不支持的节点」：选区跨过公式时不出现「添加到对话」，代价是含公式的句子不能整句批注。
- 已有批注落在含公式或原始 HTML 的旧回复上可能无法定位，沿用「前后文唯一匹配」兜底。

## 9. 工程约束

- 样式写在 `styles/markdown.css` 的 `.markdown-prose` 下：颜色只用主题变量，字号用 `var(--text-act-*)`，行内元素用 em，圆角用 `--radius-*`（token 规则见 [front-视觉token规范.md](front-视觉token规范.md)）。
- 单文件不超过 500 行；插件与组件在 `components/messages/markdown/`（`remark-callouts`、`remark-code-meta`、`remark-math-guard`、`rehype-inline-paths`、`rehype-stream-tail`、`rehype-math-exclude`、`lazy-plugins`、`definitions`、`merge-html-blocks`、`CodeBlock`、`MarkdownLink`、`InlineCode`、`MarkdownImage`、`MarkdownTable`）。

## 10. 不做

聊天区迁移到 CM6；任务复选框可点击；远程图片加载或「点击后加载」；普通文字里的路径识别；带行号打开非 Markdown 文件；代码块行号；轨迹详情里的 Markdown。
