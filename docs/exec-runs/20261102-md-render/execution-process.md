# Markdown 编辑与渲染（文档面板 + 聊天区）— 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261102-md-render.md`
- **执行模式**：交互
- **开始时间**：2026-11-02 23:00
- **结束时间**：2026-11-03 18:30

## 执行时间线

### 步骤 1：准备

- **操作**：worktree `feat/md-render` 快进到本地 main `bfbb9fc1`（先暂存文档改动，快进后恢复，没有冲突）；`pnpm install`；构建 desktop 的依赖包。
- **基线**：desktop `typecheck` 通过；`test` 265 个文件 / 2206 项全部通过。

### 步骤 2：T1 依赖 + T17 共享模块

- **操作**：
  - 装依赖（版本固定）：CM6 的 `state`、`view`、`language`、`commands`、`search`、`lang-markdown`、`language-data`，`@lezer/markdown`、`@lezer/highlight`，`katex` 0.16.47（与 mermaid 依赖的版本一致），`remark-math`、`rehype-katex`、`rehype-raw`、`rehype-sanitize`、`remark-breaks`、`unist-util-visit`。pnpm 顺带把 `dependencies` 按字母重排了。
  - 新建 `components/markdown-common/paths.ts`（识别 `parseInlinePath`、链接分类 `classifyLinkTarget`、解析 `resolveWorkspacePath`）、`callouts.ts`、`katex.ts`（KaTeX 唯一懒加载入口和参数）。
  - `tokens.css` 加 `--act-font-reading`。
- **决定**：不含 `/` 的路径只认常见扩展名白名单，白名单里不放 `log`，避免把 `console.log` 识别成文件。
- **验证**：`test/markdown-common.test.ts` 35 项通过。

### 步骤 3：分派与 T27 的前置准备

- **分派**（两个子智能体并行，文件互不重叠）：
  - A（Opus high）：文档编辑器核心 T2–T8 + T13；
  - B（Opus high）：聊天区 T18–T22、T24–T26。
  - 主智能体先做 mock 和测量脚本。T9–T12 等 A 的第一轮验收后再做；T23 依赖 T11；T27、T28 在两边完成后做。
- **mock**：
  - 新增 `?mock=markdown` 场景（`mock/scenarios/markdown.ts`、`mock/markdown-fixture.ts`）。
    - 「Markdown 历史回复」：已完成的全元素回复。
    - 「Markdown 流式回放」：按真实网络节奏分批流出同一条回复，一批 12–82 字、间隔 60–280ms，用固定种子保证可复现。
  - 回复内容取自 chat-md-demo 的示例，补了脚注、引用式链接定义和 Mermaid。
  - `stream-player.ts` 的 `playReply` 加可选的 `batches`。
  - mock 读文件支持本地图片 `docs/assets/arch.svg`。
  - `FRONTEND_VERIFICATION.md` 的场景表加一行。
- **测量脚本**：`docs/exec-runs/20261102-md-render/tools/measure-stream.mjs`，逐帧记录最后一条回复的正文高度和每个代码块的高度。
- **原版基线**（改造前的 `MarkdownProse`，浅色，1280×900）：
  - 共 937 帧，其中流式 844 帧；
  - 正文回缩 1 次：流式结束、回复落盘那一帧，84px；
  - 代码块回缩 0 次。

### 步骤 4：A 第一轮验收（T2–T8、T13）

- 复跑 `markdown-common` + `markdown-editor-*`：9 个文件 283 项通过。读了 config、callbacks、focus、inline、blocks、links、syntax、widgets 和样式，没有阻塞问题。
- A 报告 `a.ts:12` 被 `classifyLinkTarget` 当成协议：在共享 `paths.ts` 里补了“裸文件名 + 行号”的判断，测试补 `a.ts:12`、`README.md:3-9`。
- 接受的偏差：IME 用 `view.compositionStarted`；空列表项的退格、回车沿用库行为；收尾围栏行 `font-size:0`；图片缓存键不含 mtime（第二轮在“重新加载”时清缓存）。
- 第二轮派给 A：T9–T12、T14 的 mock 部分。`.markdown-doc` 的删除、`codeText`/`fenceLanguage` 的清理、T23 留给主智能体。

### 步骤 5：B 验收（T18–T22、T24–T26）

- 复跑 B 的 16 个测试文件 269 项通过；看了 `replyText` 的替换，是按整段 `textContent` 精确匹配，没有放宽断言。
- 接受的偏差：
  - 脚注在块里追加占位定义 `[^x]: .`，脚注内容变化不让引用块重渲染；
  - sanitize 不放行 `data-path`/`data-line`（规范 §5.6 原写法会让回复自己写的属性变成可点路径），另加 `rehype-scope-ids` 给原始 HTML 的 id 加前缀；
  - 圆角 5px 用 `--radius-xs`（4px）；
  - `markdown.css` 732 行，规范要求写在这个文件里，T12 删 `.markdown-doc` 后会降下来。
- **逐帧测量发现两个问题，都是主智能体修的**：
  1. 测量工具改进：代码块按元素身份比较（Mermaid 换成图是另一个元素）；记录回缩前后的末尾文字。另加 `tools/serve-nowatch.mjs`：起一个不监听文件、不热更新的 dev server，避免同一 worktree 里别的改动重载页面、打断测量。
  2. **代码块回缩 2–4 次，每次 21px**：收尾围栏写到 "``" 时被当成代码多显示一行，下一帧闭合又收回。`snapCut` 改为：只有反引号 / 波浪号的行和围栏开头行，后文没到时退回行首等整行到达；流式结束（`complete`）后不再等。`nextCut` 在等待时不前进，`useSmoothText` 停下循环，等下一批文字或流式结束再继续。补 5 项测试；两条旧测试改成收尾围栏后带换行。
  3. **长代码块在落盘那一帧被折叠（802px → 473px）**：流式结束时整条回复会重新挂载（对话层的流式轮和落盘轮是不同的组件树，原版也是，原版基线那次 84px 回缩就来自这里），新挂载的代码块已闭合，被当成历史回复折叠，违反 C9。`CodeBlock` 增加“本次运行流式写过的代码”记录（语言 + 原文，最多 300 段）；回复流式中挂载、或记录里有的，不折叠。补 1 项测试，去掉修复后该测试失败。
- **新实现的测量结果**（1280×900）：

  | | 原版 | 新版浅色 | 新版深色 |
  | --- | --- | --- | --- |
  | 帧数（流式） | 937（844） | 966（873） | 966（873） |
  | 正文回缩 | 1 次（84px，落盘） | 5 次 | 4 次 |
  | 代码块回缩 | 0 | **0** | **0** |

  新版的回缩：3px（`[!WARNING` 标签写完变成提示框）、15px 和 22px（表格分隔行到达、表格成形）、34–40px（写了一半的块公式重新排版）、55px（这一轮结束后 Mermaid 由源码换成图，设计如此）。都是规范 §7.4 说的“行内语法闭合后重新排版”或设计内的切换。

### 步骤 6：A 第二轮验收（T9–T12、T14 mock）与 T23

- **A 第二轮**：读了编辑器外壳 `MarkdownEditor.tsx`、懒加载入口、面板接入、行号跳转，以及“⌘S 先补发还没通知的变化，保证存的是最新草稿”的修复，没有阻塞问题；全量 typecheck、test 通过。
- **T12 收尾**（主智能体）：删 `.markdown-doc` 样式、旧的 `MarkdownRenderView`、`MarkdownSourceEditor`，清理 `codeText` / `fenceLanguage` 旧导出和注释。删前删后聊天区截图逐字节一致（浅色、深色），先确认截图服务加载的是新样式，比对有效。
- **T23 宿主与行号**（主智能体）：
  - `parseInlinePath` 加 `absolute` 选项，工作区内的绝对路径去掉根目录后可点，工作区外的不可点；
  - `useWorkspaceFileLinks().openWorkspaceFile(path, line?)` 支持行号：本机打开 Markdown 时把行号交给「文档」面板（`docsPendingLine`）；
  - 新建 `ChatMarkdownHostProvider` 挂在工作台：对话区、右栏子 Agent 面板、子 Agent 记录弹窗都从这里拿 `openPath`、`loadImage`、`workspaceRoot`；
  - 本机读图逻辑提到 `components/files/read-workspace-image.ts`，编辑器宿主和聊天区宿主共用；
  - `test/chat-markdown-host.test.tsx` 8 项；反向验证：去掉行号传递、去掉工作区根，对应测试都失败。
- **编辑器路径测试和 T23 冲突**：`markdown-editor-paths.test.ts` 原来断言 `/work/space/a.ts` 不识别。回到编辑器规范 §8 原文：工作区内的绝对路径应当可点。按规范改测试：补 `/work/space/a.ts`、`/work/space/docs/b.md:7` 两个正例；`/etc/passwd`、`/work/space-x/a.ts`、`~/a.ts` 等仍不识别；加「没有工作区根时绝对路径一律不识别」。
- **验证**：typecheck 通过；全量 test 2660 项通过。

### 步骤 7：T14、T27 截图

- **截图脚本** `tools/shots.mjs`（Playwright + 本机 Chrome，2 倍像素）：
  - 聊天区：浅色、深色、紫色强调色、560px 窄窗，整条「Markdown 历史回复」一张；
  - 「文档」面板：`docs/markdown-showcase.md` 展开面板后逐屏截，浅色、深色、紫色强调色、编辑器约 480px 宽各一组，另加源码模式一张。
  - 截图在 `shots/` 下。`docs/exec-runs/**/*.png` 被 `.gitignore` 忽略，只留在本地，执行摘要里只写文件名、不写链接。
- **发现并修复的问题**：
  1. **编辑器的样式大多没生效**（标题是等宽字体，引用竖条、列表悬挂缩进、代码块内边距、表格行、预览居中都不对）。原因：`markdown-editor.css` 按规范用 `layer(components)` 引入，CodeMirror 运行时注入的自带主题不在任何 layer 里；不在 layer 里的声明总是压过 layer 里的，与选择器优先级无关，所以提高优先级无效。修复：新增 `core/layer-bridge.ts`，用 `EditorView.theme` 把冲突的属性写成 `revert-layer`，回退到样式文件的值；它挂载在所有 baseTheme 之后、优先级不低于对应规则，所以生效。规范 §8 补一条「和 CM 自带主题的层叠关系」。
  2. **桥接带出的回归**：`.cm-widgetBuffer` 的 `display: revert-layer` 一路回退到 Tailwind preflight 的 `img { display: block }`，行内元素各占一行。改为只在样式文件给了值的范围（代码行、表格行）里桥接；`.cm-line` 的 `display` 只桥接 `.md-tr`。
  3. **计算样式检查** `tools/check-editor-css.mjs`：预览、源码两种模式下，滚动收集元素（CodeMirror 只渲染可见行），逐项比对字体、内边距、居中、表格行、行号栏等。反向验证：去掉桥接 11 项失败，恢复后 0 项。`markdown-editor-config.test.ts` 补一条，断言桥接规则已注入页面。
  4. **路径的文件图标和路径文字被拆到两行**（聊天区和编辑器都有）：图标是行内块，后面天然有断行机会。聊天区新增 `FileIconLead.tsx`，编辑器在 `inline-text.ts` 用 `inclusiveStart` 的 mark，都把图标和第一个字符包进不换行的 `.md-path-lead`。压到 260px 宽对照：不加 5 处拆行，加上后 0 处。jsdom 算可访问名称会在 span 两侧插空格，相关测试改成忽略空白比较。
  5. **文件头属性值按 demo 用等宽字体**（规范只写了“值正文色”，demo 和用户确认的截图里是等宽）。
  6. **示例文档**：「没有标语言的代码块」那句说明被写进了围栏里，挪到围栏外。
- **观察**：「文档」面板展开时，左上角「文档」标签和会话标题有重叠。本分支没有改面板头部布局（`DocsReader` 只换了正文区），main 上本来如此，不在本次范围，交给 Electron 验收记录。

### 步骤 8：T15、T28 性能与体积

- **体积**：本分支和 main 快照（`git archive main` 解到临时目录，借用本 worktree 的 node_modules）都用 sourcemap 构建，按源文件归属主包字节。
  - 主包 JS gzip：635.72KB → 642.97KB，**+7.25KB**。
  - 文档面板部分约 **−0.9KB**（CodeMirror 全部懒加载；删了旧预览、旧源码编辑器）。
  - 聊天区部分约 **+7.8KB**（`messages/markdown/` +6.8KB、`markdown-common` +1.7KB、`MarkdownProse` −1.1KB）。
  - 懒加载 chunk：编辑器 208.6KB、原始 HTML（parse5）54.4KB、KaTeX 77.6KB（原来就有）；代码语言按语言拆成小 chunk。主 CSS 36.36KB → 39.55KB。
- **编辑器**：`tools/measure-editor.mjs` 在 dev 页面里直接 import 编辑器内核，1MB 样本（示例文档重复，39,612 行）。
  - 第一次测出按键 p95 17–21ms。CPU profile 显示其中大半是测量方法的问题：用 `now - rAF 帧时间戳` 会把帧开始到回调执行之间的空等算进去。改为在 dispatch 前后各登记一个 rAF，夹住 CodeMirror 的测量回调。
  - profile 里每次按键约 5.6ms：Lezer 增量解析约 2.4ms（CodeMirror 自身），`blockField` 整篇重扫约 1.3ms，其中对每个代码块都做的 `isFenceClosed` 约 0.4ms。`collectBlocks` 改为先看语言再看是否闭合，`isFenceClosed` 降到原来的四分之一。试过用 TreeCursor 遍历，没有可测的收益，已还原。
  - 结果见执行摘要。
- **聊天区**：`tools/measure-chat.mjs` + `tools/chat-bench-entry.tsx`，同一份入口分别在本分支（5188）和 main 快照（5190，独立 Vite cacheDir）上测；入口临时拷进被测代码树，测完删除。每 50ms 送 120 个字符，记录 React Profiler 每次提交的 `actualDuration`。第一次跑两版 30KB 的最终高度都是 0：Mermaid 工具栏的 Tooltip 需要 `TooltipProvider`，入口没提供，图渲染时整棵树出错；补上后重测。

### 步骤 9：T16 Electron 验收

- **方式**：codex-cu 跑 Codex 原生 Computer Use，操作本 worktree 当前构建的 Electron（`pnpm --filter @actspace/desktop build`，生产 renderer）。数据目录、工作区在 0700 的临时目录，只复制 DeepSeek 连接。S1 是真实 DeepSeek 会话，回复、改文件、派子 Agent 都是真实模型做的。清单 `tmp/codex-acceptance/brief-20261103-md-render.md`（不入库），证据和报告在 `tmp/codex-acceptance/20261103-md-render/`。
- **结果**：17 项中 15 项通过、0 项失败、2 项局部未覆盖，N1 单列观察。
  - 自动化（Playwright）只用在三处：外部打开时给 `shell.openPath` / `openExternal` 包一层记录（仍调原函数）；C4 退出后重启看历史；C6 公式选区的 DOM Range 对照。
- **两个局部未覆盖项，主智能体复核后都不是缺陷**：
  - **C6**：选区跨过公式时不出现「添加到对话」。`response-annotation-text.ts` 对 `pre`、代码块、`[data-annotation-exclude]` 一视同仁，选区和它们相交就不给批注。这是批注规范已有的规则（“跨越不支持节点时，不显示添加操作”）。公式确实不会进入批注文本，只是没有“排除公式后的引用”可看。聊天区规范 §11 补写了这条后果。
  - **C7**：`SubAgentTranscriptModal` 在 main 上就是 `SubAgentTranscriptPanel` 的别名，没有单独的弹窗，子 Agent 记录只在右侧面板里打开；面板（含 320px 窄宽）已通过。聊天区规范 §1 和 §15 的说法改了。
- **N1**：展开「文档」面板时，左上角「文档」标签盖住会话标题开头，真实 Electron 里也有。本分支在 `WorkbenchLayout` 只加了一层 `ChatMarkdownHostProvider`，没改头部布局，是 main 上原有的问题，留作后续。
- **主智能体抽看的截图**：E1（文件头卡片、无衬线正文、路径图标）、C2（提示框、公式、脚注、远程图片占位）、C7（深色窄面板里路径图标和首字不拆行），和报告一致。
- 无需修复，不用复验。

### 步骤 10：复验（2026-11-03 上午）与 N1 修复

- **复验**：迁回主仓库后，另一轮 Codex 原生 CUA 复验（`tmp/codex-acceptance/20261103-md-render-recheck/`，不入库），14 通过、3 部分通过、0 功能失败，N1 记为布局缺陷。
  - 部分通过的三项都是覆盖不全，不是缺陷：
    - C1 采样截图里没认出独立光标（第一轮验收看到了）；
    - C3 聊天外链没点；
    - C7 `src/app.ts:12` 交给外部编辑器后没去看外部窗口。
  - E9「切换窗口没出提示」：窗口聚焦重校验是 main 上已有的逻辑，有测试（`docs-panel.test.tsx` 派发 `focus`）。CUA 通过 AX 操作，应用窗口没有真正失焦再聚焦，所以不触发；turn 结束这个时机正常出提示。不是缺陷。
- **N1 修复**：
  - 原因：展开面板时 SplitView 把中间栏设成 `invisible`，但顶栏 `WindowChromeBar` 在 SplitView 外面，不知道展开状态，中间的会话标题照常画；面板的标签行层级比顶栏高，标签背景盖住了标题的前半段。
  - 改法：`WorkbenchLayout` 把同一个 `rightExpanded` 传给顶栏；顶栏加 `data-right-expanded`，CSS 让 `.chrome-center-title` / `.chrome-center-actions` 隐藏。和紧凑布局的 `data-compact-panel-open` 不同，拖动区保留，标签行空白处仍可拖窗口（标签本身是 no-drag）。
  - 验证：`sidebar.test.tsx` 补 1 项（展开时打标记；面板没开、紧凑布局时不打）。浏览器 mock 里展开后顶栏只剩「文档」标签，收起后标题恢复。typecheck、2663 项测试、tokens/theme/bridge/current-docs 检查通过。
  - Electron 里还没复看。
