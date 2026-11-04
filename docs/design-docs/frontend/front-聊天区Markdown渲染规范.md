# 聊天区 Markdown 渲染规范

更新：2026-11-03。状态：已实施（执行计划见 [20261102-md-render](../../exec-plans/completed/20261102-md-render.md) 的 T17–T28，执行摘要见 [exec-runs](../../exec-runs/20261102-md-render/execution-summary.md)）。

来源：

- 对比 demo 在 [chat-md-demo/](chat-md-demo/README.md)：左边是现在的 `MarkdownProse` 原样渲染，右边是各个改进版本。用户最终选定「A 书页」。
- 2026-11-02 用户逐项确认：采用 12 条问题中的改进 1–10；排版选 A；单个换行保留；三处使用方全部统一；「文档」面板保持 Codex 排版；聊天区并进 md-render 计划。
- 流式跳动的原因来自逐帧实测（§7.4）。

## 1. 定位与范围

本文规定聊天区 Markdown 的渲染、排版和流式效果。渲染组件仍是 `components/messages/MarkdownProse.tsx`，在原位改造，组件名和使用方式不变。

| 范围 | 说明 |
| --- | --- |
| 包含 | 用 `MarkdownProse` 渲染的两处：助手回复（`AssistantReply`）、右侧子 Agent 面板（`SubagentsPanel`：本地 / Fork 子智能体的对话记录，Codex / Claude Code 的最终结果） |
| 不包含 | 「文档」面板（CodeMirror 6，见 [Markdown 编辑与渲染规范](front-Markdown编辑与渲染规范.md)）；轨迹详情里的 Markdown（`trajectory/details/shared.tsx`）；用户消息；生成图片的轮尾列表（`TurnOutputArtifacts`） |

与「文档」面板的关系：

- **共用**：路径识别规则、提示框的写法和语义色、链接和路径的颜色规则（都是 `--act-color-link`）、代码高亮配色 `.act-code-hl`。
- **各自不同**：
  - 排版：文档面板是编辑场景，用 Codex 排版；聊天区是阅读场景，用 A 书页。
  - 原始 HTML：文档面板按原文显示；聊天区按白名单渲染（§5.6）。
  - 技术栈：文档面板用 CM6，聊天区继续用 `react-markdown`。

## 2. 已确认的决定

| # | 决定 | 说明 |
| --- | --- | --- |
| C1 | 继续用 `react-markdown` + 顶层分块 | 正常流式每次更新约 0.4ms，没有必要换成 CM6。只加插件和组件覆盖。 |
| C2 | 排版用「A 书页」 | 西文衬线 + 中文苹方，16.5px，行高 1.78，留白多（§6）。B–E 和 A1–A5 都试过，用户选 A。 |
| C3 | 单个换行保留成换行 | Agent 常用单个换行分行（“先… / 再… / 最后…”），用 `remark-breaks`。 |
| C4 | 三处使用方全部统一 | 只有一套实现，不加开关。 |
| C5 | 「文档」面板保持 Codex 排版 | 不和聊天区对齐。 |
| C6 | 生成图片不并入 Markdown | 它是工具产物，存在会话存储里，由轮尾列表负责；Markdown 只管回复文字里写的图片。 |
| C7 | 改进 1–10 全部采用 | 见 §5，每一条都对应 demo 里看到的问题。 |
| C8 | 流式效果按 A | 新块淡入、末尾三层渐显、呼吸圆点光标、平滑输出（§7）。 |
| C9 | 流式写出来的代码块不自动收起 | 只有一开始就完整的代码块（历史回复）才折叠（§5.2）。 |

## 3. 现状问题（改进 1–10 的来源）

| # | 现在 | 改成 |
| --- | --- | --- |
| 1 | 行内代码里的路径不能点 | 识别成文件，强调色 + 文件图标，单击打开，带行号的跳行（§5.1） |
| 2 | `> [!WARNING]` 显示原文 | 提示框（§5.3） |
| 3 | `$…$`、`$$…$$` 显示原文 | KaTeX 渲染（§5.4） |
| 4 | `<details>`、`<kbd>`、表格里的 `<br>` 显示成文字 | GitHub 白名单渲染（§5.6） |
| 5 | 表格最小宽度写死 420px，数字列被挤断 | 外层横向滚动，表头和右对齐列不换行（§6.6） |
| 6 | 任务列表圆点和复选框同时出现，复选框很淡 | 去掉圆点，强调色复选框，完成项划线（§6.7） |
| 7 | 没标语言的代码块被自动识别（报错日志被认成 dart，满屏乱色） | 不再自动识别，按纯文本显示，标签写「文本」（§5.2） |
| 8 | 长代码块整块铺开 | 超过 22 行折叠到 18 行（§5.2） |
| 9 | 相对路径图片是裂图；远程图片直接加载，会被追踪 | 本地图片从工作区读取；远程图片不加载（§5.5） |
| 10 | 只要出现一个脚注或引用式链接定义，整条回复退回一块，流式时每次整条重解析（3KB 回复每次 10ms，30KB 回复每次 34ms） | 定义全局收集，不再退回一块（§8.2） |

## 4. 架构

```
MarkdownProse（content, onOpenWorkspaceFile）
  ├─ 平滑输出：流式时按帧放出积压的文字（§7.3）
  ├─ 分块：splitMarkdownBlocks + 合并未闭合的 <details>（§8.1）
  ├─ 全局定义：脚注、引用式链接定义（§8.2）
  └─ 每块一个 react-markdown
       remark：gfm → math* → callouts → codeMeta → breaks
       rehype：raw* → sanitize* → inlinePaths → katex* → highlight → streamTail（只在流式的最后一块）
       components：a / pre / code / img / table 覆盖
```

带 `*` 的插件按需加载（§9.2）。

**宿主接口**：组件通过一个 context 拿到宿主能力，`MarkdownProse` 的 props 不变：

| 能力 | 来源 | 没有时 |
| --- | --- | --- |
| `openPath(path, line?)` | `useWorkspaceFileLinks().openWorkspaceFile`，扩展为带行号 | 路径和本地链接按普通文字显示，不可点 |
| `loadImage(path)` | 本机：`workspacesApi.readFile` 拿 `dataUrl`；远端会话：不加载 | 显示占位 |
| `openUrl(url)` | 链接 `target="_blank"`，由主进程 `setWindowOpenHandler` 交给 `openExternalSafely`（沿用现状） | — |
| 流式状态 | `ReplyStreamingContext`（沿用） | 默认不在流式 |

`onOpenWorkspaceFile` 的签名改成 `(path: string, line?: number) => void`。行号只在打开 Markdown 时生效，跳到「文档」面板对应的行（依赖 T11）；其他文件交给系统应用，行号忽略。

现在只有 `AssistantReply` 传了 `onOpenWorkspaceFile`，`SubagentsPanel` 没传，里面的路径不能点。按 C4，它也接上 `useWorkspaceFileLinks`。

## 5. 元素规则

### 5.1 路径与链接

- **识别规则和「文档」面板相同**（[Markdown 编辑与渲染规范](front-Markdown编辑与渲染规范.md) §8.1）。规则只写一份，放在共享模块 `components/markdown-common/paths.ts`，两边都从这里引用。
- **解析**：聊天没有“当前文档”，所以行内代码路径和本地链接一律相对于工作区根目录。
  - 工作区内的绝对路径：去掉根目录前缀。
  - 工作区外的绝对路径、`~` 开头、含 `..`：不识别，按普通行内代码或普通链接显示。
- **显示**：路径是强调色等宽字，底色为强调色 9%，前面有 12px 文件图标；悬停时底色加深到 16%。长路径可以在任意位置断行，断行后每段都带底色（`box-decoration-break: clone`）。悬停提示“在 ActSpace 中打开（第 N 行）”。
- **本地链接**：链接文字前面加文件图标，单击打开。
- **网页链接**：只放行 `http`、`https`、`mailto`，走系统浏览器。其他协议不可点。
- **`#片段`**：只在当前回复内查找、滚动、转移焦点（沿用现状）。

### 5.2 代码块

| 项目 | 规则 |
| --- | --- |
| 头部 | 左边是语言显示名（TypeScript、Shell…；没标语言写「文本」），后面可以跟文件名标题；右边是「换行」和「复制」 |
| 文件名标题 | 支持 ```` ```ts title="path/to/a.ts" ````。标题是路径时可以点开（同 §5.1），过长时用省略号 |
| 按钮显隐 | 鼠标悬停或键盘聚焦到代码块时才出现 |
| 换行 | 切换自动换行，只影响当前代码块 |
| 复制 | 复制代码原文，不含围栏；之后 1.2 秒内显示「已复制」 |
| 高亮 | 只按标注的语言高亮。**不再自动识别语言**，没标语言的按纯文本显示 |
| 折叠 | 代码块挂载时就已闭合、而且超过 22 行：只显示前 18 行，底部渐隐，下方显示按钮「展开全部 N 行」；展开后按钮变成「收起」 |
| 流式中 | 围栏还没闭合时，头部右边显示「写入中 · N 行」加一个脉冲圆点，不显示按钮。代码块跟着内容自然变高，不封顶、不内部滚动。写完后换成按钮，**不自动收起** |
| Mermaid | 渲染规则不变（见 [front-chat-mermaid-diagrams](front-chat-mermaid-diagrams.md)）。外壳的圆角、底色跟随新代码块 |

折叠只针对历史回复。刚流式写完的代码块不能突然收起：用户可能正在读，收起会让内容整段跳走。

### 5.3 提示框

- **写法**：GitHub 写法 `> [!NOTE|TIP|IMPORTANT|WARNING|CAUTION]`，标签依次是 说明 / 提示 / 重要 / 注意 / 警告。
- **语义色**：info / success / 正文色 / warning / danger，和文档面板一致。
- **样式**：左侧 2px 语义色竖条，左内边距 18px；首行显示标签，用 UI 字体 12.5px、600 字重、字距 0.04em、语义色。
- **标签的实现**：标签用 CSS `::before` 生成，不进入 DOM 文本。这样批注、复制得到的文字不包含标签。

### 5.4 公式

- **语法规则和文档面板相同**：
  - 块公式是独占一行的 `$$` 开头和结尾。
  - 行内公式是 `$…$`：开头的 `$` 后面不能是空格，结尾的 `$` 前面不能是空格、后面不能紧跟数字。这样 `$5 和 $10` 不算公式。
  - `\$` 不算公式。
- **实现**：`remark-math` 默认会把 `$5 和 $10` 识别成公式。在它后面加一个 remark 插件，把不符合上面规则的行内公式还原成文字。
- **KaTeX 参数**：`throwOnError: false`、`trust: false`、`strict: "ignore"`，并限制 `maxSize` 和 `maxExpand`。写错的公式显示原文，并标成危险色。
- **显示**：
  - 行内公式字号是正文的 1.05 倍。
  - 块公式居中；比较宽时在公式内部横向滚动，不撑宽正文。
- **流式中**：没闭合的公式按原文显示。

### 5.5 图片

| 来源 | 显示 |
| --- | --- |
| 工作区内的相对路径（本机会话） | 经 `loadImage` 读成 data URL 后显示：居中，最大宽度 100%，圆角 12px。按路径缓存，同一个回复不会重复读取 |
| 读取失败、太大、格式不支持 | 一行淡色占位文字“图片：说明文字（找不到文件）” |
| 远端会话 | 一行占位文字，单击用 `openPath` 打开 |
| `http` / `https` 远程图片 | **不加载**，不发任何网络请求。显示“图片：说明文字（远程地址，不加载）”，悬停提示“远程图片不加载” |
| 原始 HTML 里的 `<img>` | 同上，走同一个图片组件 |

注意：远程图片现在是会直接加载的，改成不加载是有意为之的行为变化。目的是隐私，不让回复里的远程地址追踪用户。

### 5.6 原始 HTML

- **启用方式**：用 `rehype-raw` 解析，再用 `rehype-sanitize` 按 GitHub 的 `defaultSchema` 白名单清理。
- **允许的元素**：`details`、`summary`、`kbd`、`sub`、`sup`、`br`、`ins`、`del`、`img`、`a` 等。
- **一律去掉**：`script`、`style`、`iframe`、事件属性（`on*`）、`style` 属性、`javascript:` 等协议。
- **id 和 name 前缀**：`clobber` 置空，改由 `clobberPrefix` 给每条回复的 id 和 name 加稳定前缀，沿用现有的脚注命名空间。
- **额外放行的属性**：只有本组件自己加的：
  - 代码的 `language-*`、`math-*` 类名；
  - `data-path`、`data-line`、`data-meta`；
  - 提示框的类名和 `data-callout-label`。
- **跨块的成对标签**：`<details>` 里面常有空行，会被分块切开。遇到没闭合的 `<details>`，就把后面的块并进来，直到 `</details>`（§8.1）。
- **样式**：`<details>` 是带边框的圆角框，摘要行用淡色；`<kbd>` 是带下边框的等宽小键帽。

### 5.7 其他元素

- **单个换行**：显示成换行（C3）。
- **任务列表复选框**：只读，不能点。聊天回复是历史记录，不是可编辑的文档。

## 6. 排版：A 书页

所有颜色都用主题变量，浅色、深色自动翻转。以下尺寸以正文字号为基准，用 em 表示的都跟着正文缩放。

### 6.1 字体与正文

| 项目 | 值 |
| --- | --- |
| 正文字体 | 新增 token `--act-font-reading`：`ui-serif, "New York", "Iowan Old Style", Charter, Georgia, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", serif`。效果是西文用衬线，中文落到苹方或雅黑 |
| 正文字号 | 16.5px。全局字号档位里没有这一档，只在 `markdown.css` 里定义局部变量 `--md-chat-size: 16.5px`，不新增全局 token |
| 行高 | 1.78 |
| 块间距 | 14px |
| 粗体 | 650 |
| 文字颜色 | `--act-color-text` |

### 6.2 标题

- 字体与正文相同，字重 600，行高 1.35，字距 -0.005em，上外边距 14px。
- 字号：H1 1.55em，H2 1.3em，H3 1.12em，H4 1em。

### 6.3 列表

- 项间距 7px，左缩进 1.6em。
- 圆点和序号用 `--act-color-text-faint`。

### 6.4 行内代码

| 项目 | 值 |
| --- | --- |
| 字体 | 等宽，0.82em |
| 内边距 | 0.14em 0.4em |
| 边框 | 1px `--act-color-inline-code-border`，圆角 5px |
| 底色 | `--act-color-surface-subtle` |
| 路径 | 字号和内边距相同，颜色见 §5.1 |

### 6.5 引用

左侧 2px `--act-color-border` 竖条，左内边距 18px，文字用 `--act-color-text-muted`。

### 6.6 表格

| 项目 | 值 |
| --- | --- |
| 字体 | UI 字体 14px；数字用等宽数字（`tabular-nums`） |
| 外框 | 不要外框和底色，外层容器负责横向滚动 |
| 表头 | 正文色，600 字重；下边框 1px `--act-color-border-strong` |
| 行 | 每行下边框 1px `--act-color-border`，最后一行不加 |
| 单元格 | 内边距上下 10px、右 16px、左 0。表头和右对齐的列不换行 |
| 流式中 | 固定列宽（沿用现状），结束后恢复自动列宽 |

### 6.7 任务列表

- 去掉圆点，左缩进收到 0.2rem。
- 复选框 14px，圆角 4px，边框 1.5px `--act-color-border-strong`。
- 勾选状态：底色用 `--act-color-link`，里面一个白色对勾。
- 已完成的项：文字用 `--act-color-text-faint`，加删除线。

### 6.8 代码块

| 项目 | 值 |
| --- | --- |
| 外壳 | 不要边框，圆角 `--radius-lg`（12px），底色 `--act-color-surface-subtle` |
| 头部 | 高 36px，左内边距 18px，UI 字体 12px，`--act-color-text-faint`；和代码之间不画分隔线 |
| 代码 | 等宽 `--act-font-mono-size`，行高 1.65；内边距左右 18px、上 0、下 16px |
| 折叠 | 底部 64px 用遮罩渐隐；按钮是 UI 字体 12px，`--act-color-text-muted` |

### 6.9 其他

- **分隔线**：1px `--act-color-border`，上下各 6px。
- **`<details>`**：UI 字体 15px。
- **链接**：沿用现在的样式，链接色加淡色下划线，悬停时下划线变成链接色。

### 6.10 和现行规范的差异

这些规范要同步修改：

- [全局视觉语言规范](front-全局视觉语言规范.md)：原文“AI 输出正文继续跟随 UI 字体”改成：聊天区 AI 输出用阅读字体 `--act-font-reading`，其余界面不变。
- [中间消息区规范](front-中间消息区规范.md)：行内代码的“无边框、3px 圆角”改成 §6.4 的规则。

## 7. 流式输出

### 7.1 效果

| 效果 | 规则 |
| --- | --- |
| 新块淡入 | 流式中新出现的顶层块从透明淡入，420ms，ease-out，只改透明度、不位移 |
| 末尾渐显 | 只作用于正在生成的最后一块：从末尾往前数，第 1–10 个字透明度 0.22，第 11–22 个字 0.5，第 23–36 个字 0.8；公式内部不参与 |
| 光标 | 0.5em 的呼吸圆点（`--act-color-text-muted`，1.1 秒一个周期），紧跟在最后一个可见字后面 |
| 减少动态效果 | 系统开了“减少动态效果”时，取消淡入和呼吸，末尾渐显照常（它不是动画，只是静态透明度） |

### 7.2 稳定性约束

这几条是硬性要求。违反任何一条，内容高度都会一帧一跳：

1. **光标位置**：光标放在结尾空白（含换行）之前，不能落在结尾换行符后面。落在后面会多出一行，下一帧又收回去。
2. **代码块里不放光标**。代码块头部已经有「写入中」提示。
3. **流式中的代码块**：自然变高，不封顶、不内部滚动；写完不自动收起（C9）。
4. **平滑输出的切点**：不能停在半截语法上，见 §7.3。
5. **表格**：流式中固定列宽（沿用现状）。

### 7.3 平滑输出

网络上的 token 是一批一批到的，一次几十个字，间隔几百毫秒。平滑输出按帧把积压的文字匀速放出来：

- 每帧放出“剩余积压 ÷ 12”个字符，向上取整，至少 1 个。积压越多放得越快，大约 200ms 追平。
- **切点不停在半截语法上**：
  - 当前行有没闭合的反引号或 `**`；
  - 停在链接语法中间（方括号或圆括号还没写完）；
  - 表格行、代码围栏的开头行没写完。

  遇到这几种情况，切点往后挪到这段语法结束。只有后文已经到达时才挪；后文还没到，就停在原处等。
- **流式结束**：网络流结束后，剩下的积压继续按帧放完；放完之前，仍按流式显示（淡入、渐显、光标）。
- **不平滑的情况**：内容变短（重新生成、切换回复），或者不在流式中。这时直接显示全部内容。

### 7.4 实测依据

数据来自 demo 回放：约 800 帧，逐帧记录正文高度。

| | 原版 | 改进版（修复前） | 改进版（修复后） |
| --- | --- | --- | --- |
| 正文高度回缩次数 | 2 | 36 | 9–16 |
| 其中在代码块里的 | 0 | 23 | 0–2 |

修复后剩下的回缩都很小，每次 7–14px（最后一帧那次约 50px，原版收尾时也有一次约 30px）。原因是像 `` `xxx` `` 这样的行内语法，在闭合符号到达前显示原文，到达后才变成格式，那一行会重新折行。这是 Markdown 的固有行为，原版也一样，只是原版不平滑、帧数少，所以不明显。

## 8. 分块

### 8.1 顶层分块

- 沿用 `splitMarkdownBlocks`：除了最后两块，其他块冻结复用，只重新解析尾部。
- 在它后面加一步 `mergeHtmlBlocks`：遇到含 `<details` 但没有 `</details>` 的块，把后续块并进来，直到闭合为止。

### 8.2 脚注与引用式链接定义（改进 10）

现在只要出现 `CROSS_BLOCK_SYNTAX`（脚注或引用式定义），整条回复就退回一块。改成：

- **收集**：分块时把整条回复里的定义收集起来：引用式链接定义 `[x]: url`、脚注定义 `[^x]: …`。
- **追加**：块里引用了哪些定义，就把这些定义追加到该块的源码末尾再解析。这些定义不在块内显示。
- **脚注区**：每块自己生成的脚注区都去掉，整条回复只在最后渲染一次脚注区，编号按定义在全文中第一次被引用的顺序排。
- **重渲染**：块的 memo 依赖它用到的定义内容。某个定义到达或变化时，只重渲染引用了它的块。
- **id 前缀**：沿用每条回复稳定的 `clobberPrefix` 命名空间，不同回复之间脚注不会串跳。

## 9. 性能与体积

### 9.1 目标

- 正常流式每次更新的渲染耗时，和现在同一量级（约 0.4ms，不含平滑输出带来的帧数增加）。
- 有脚注或引用式定义的长回复，流式时不再随回复长度线性变慢。
- 平滑输出每帧只重渲染最后一块。

### 9.2 按需加载

数学和原始 HTML 的插件比较大，按需加载，不进主包：

| chunk | 内容 | 什么时候加载 |
| --- | --- | --- |
| 数学 | `remark-math`、`rehype-katex`、KaTeX 和它的 CSS | 某个块的源码里第一次出现 `$` |
| 原始 HTML | `rehype-raw`、`rehype-sanitize` | 某个块的源码里第一次出现像 HTML 标签的文本（`/<\/?[a-z][\w-]*[\s>/]/i`） |

- **加载完成前**：这一块按现状显示，公式和 HTML 都是原文。加载完成后，只重渲染需要它们的块。
- **KaTeX 共用**：KaTeX 与「文档」面板编辑器共用同一个懒加载 chunk。
- **体积目标**：主包增加不超过 10KB（gzip）。构建前后的数字写进执行摘要。

## 10. 安全

- 原始 HTML 只按白名单渲染（§5.6），渲染前一定先清理。
- 链接协议只放行 `http`、`https`、`mailto`。
- 远程图片不加载（§5.5）。
- 本地路径和图片：前端用 `isSafeWorkspaceRelativePath` 检查；主进程经 `workspace-access.ts` 再检查一次 `escapes_root`。
- KaTeX 用 `trust: false`。

## 11. 与批注的兼容

回复批注依赖「可批注可见文本」，规则见 `response-annotation-text.ts` 和 [composer 文件提及与回复批注规范](front-composer-file-mentions-and-response-annotations.md)。

- **不改变可见文本的部分**：
  - 末尾渐显的 `span` 和光标：只拆分文本节点，不改变文字；光标是空元素。
  - 文件图标是 SVG，提示框标签是 CSS 生成的内容，都不产生文本。
- **公式**：KaTeX 的输出要排除在可批注文本之外（加 `data-annotation-exclude`），否则 MathML 和 HTML 两份文字会重复计入。
  - 排除的节点和代码块一样算「不支持的节点」：选区跨过公式时不出现「添加到对话」（批注规范「选区为空…或跨越不支持节点时，不显示添加操作」）。所以公式不会进入批注文本，代价是含公式的句子不能整句批注。
- **单个换行**：`remark-breaks` 把换行变成 `<br>`，但文本节点里的换行字符还在，可批注文本保持不变。
- **旧批注**：已有批注如果落在含公式或原始 HTML 的旧回复上，可见文本变了，可能变成无法定位，这是可以接受的。定位失败时，沿用“前后文唯一匹配”的兜底。

## 12. 工程约束

- **样式位置**：写在 `styles/markdown.css` 的 `.markdown-prose` 下。
  - 颜色只用主题变量。
  - 字号用 em，或局部变量 `--md-chat-size`。
  - 圆角用 `--radius-*`。
- **新增 token**：`--act-font-reading` 写在 `tokens.css`，浅色和深色共用。
- **文件拆分**：单个文件不超过 500 行。插件和组件拆到 `components/messages/markdown/` 下。
- **共享模块**：`components/markdown-common/paths.ts`（路径识别和解析）、`callouts.ts`（提示框的类型、标签、语义色）。「文档」面板编辑器也从这里引用。
- **稳定引用**：`MarkdownProse` 和 `AssistantReply` 仍用 `memo`。新加的 context 值和插件数组必须是稳定引用，否则整页历史回复每帧都会重渲染（[会话状态与数据流规范](front-会话状态与数据流规范.md)）。

## 13. 不做

- 聊天区迁移到 CM6。
- 任务复选框可点击。
- 远程图片加载，或“点击后加载”。
- 普通文字里的路径识别。
- 带行号打开非 Markdown 文件（比如交给编辑器跳行）。
- 代码块行号。
- 生成图片的缩略图和轮尾列表的中文化：这不属于 Markdown，另行处理（C6）。
- 轨迹详情里的 Markdown。

## 14. 实施位置

| 内容 | 位置（`apps/desktop/src/renderer/` 下） |
| --- | --- |
| 外壳 | `components/messages/MarkdownProse.tsx` |
| 插件 | `components/messages/markdown/remark-callouts.ts`、`remark-code-meta.ts`、`remark-math-guard.ts`、`rehype-inline-paths.ts`、`rehype-stream-tail.ts`、`lazy-plugins.ts`、`definitions.ts`（脚注与引用式定义）、`merge-html-blocks.ts` |
| 组件 | `components/messages/markdown/CodeBlock.tsx`、`MarkdownLink.tsx`、`InlineCode.tsx`、`MarkdownImage.tsx`、`MarkdownTable.tsx` |
| 平滑输出 | `components/messages/markdown/smooth-text.ts`（`useSmoothText`、`snapCut`） |
| 宿主 | `components/messages/markdown/host.ts`（context）；`components/conversation/use-workspace-file-links.ts`（`openWorkspaceFile` 加 `line`）；`AssistantReply.tsx`、`right-panel/SubagentsPanel.tsx` 接上打开文件 |
| 共享 | `components/markdown-common/paths.ts`、`callouts.ts` |
| 样式 | `styles/markdown.css`、`styles/tokens.css`（`--act-font-reading`） |
| 依赖 | `apps/desktop/package.json`：`remark-math`、`rehype-katex`、`rehype-raw`、`rehype-sanitize`、`remark-breaks`、`unist-util-visit`（`katex` 与文档面板共用） |
| 测试 | `test/chat-markdown-*.test.ts(x)`，并更新现有的 `markdown-prose`、`markdown-blocks`、批注相关测试 |

## 15. 测试与验收

**单元测试**：

- 路径：识别与解析的正反例，与文档面板共用同一组用例。
- 提示框：五种类型；首行只有标签；标签后面紧跟正文。
- 公式：`$5 和 $10`、`\$`、未闭合、块公式、写错的公式。
- 原始 HTML：`<details>` 跨块合并；`<script>`、`onerror`、`javascript:` 链接、`style` 属性都被去掉；`<img>` 远程地址不加载。
- 脚注和引用式定义：
  - 不再退回一块；
  - 编号按全文顺序；
  - 只有一个脚注区；
  - 定义晚到时，只重渲染引用它的块。
- `rehypeStreamTail`：
  - 光标不落在结尾换行后面；
  - 代码块里没有光标；
  - 公式内部不渐显；
  - 渐显的层数和字数。
- `snapCut`：反引号、`**`、链接、表格行、围栏行，后文到达和没到达两种情况。
- 代码块：
  - 挂载时已闭合且超过 22 行才折叠，流式写出来的不折叠；
  - `title=` 解析；
  - 复制不含围栏；
  - 没标语言不高亮。

**组件测试**：

- 流式中最后一块有渐显和光标；流式结束、积压放完后都消失。
- 平滑输出：内容变短时直接显示全部。
- 路径点击带上行号；没有宿主时不可点。
- 批注：现有测试全部通过；公式被排除在可批注文本之外。

**稳定性**：

- 在浏览器 mock 的流式场景里逐帧记录高度。
- 代码块内的高度回缩次数必须是 0。
- 全文的回缩次数写进执行摘要。

**浏览器 mock**：

- 在流式 mock 场景里加一条覆盖 §5 全部元素的回复，内容取自 demo 的 `sample-chat.txt`。
- 截图：浅色、深色、窄窗（子 Agent 面板宽度）。
- 对照 demo 的 A 书页。

**Electron 实机**（Codex CU 验收）：

- 真实会话里的长回复流式输出：代码块不跳；末尾渐显和光标正常。
- 点击路径、带行号的路径、本地链接、外链。
- 公式、`<details>`、本地图片、远程图片占位。
- 右侧子 Agent 面板（子 Agent 记录也在这里打开）。
- 深色主题和切换强调色。
- 选中文字批注。
