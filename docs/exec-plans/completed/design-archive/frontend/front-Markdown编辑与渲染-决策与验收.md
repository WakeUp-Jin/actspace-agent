# Markdown 编辑与渲染：决策与验收归档

归档：来自原《Markdown 编辑与渲染规范》（2026-11-02 实施）。现行规则见 `docs/design-docs/frontend/front-Markdown编辑与渲染规范.md`；交互 demo 保留在 `docs/design-docs/frontend/md-render-demo/`，截图在其 `shots/` 下。本文保留预览规则 D1–D12 的决策表、实施时的删除清单、测试与验收清单、demo 截图对照表。

## 预览规则 D1–D12

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

## 实施时的删除清单

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

## 测试与验收

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

## Demo 截图

| 截图 | 内容 |
| --- | --- |
| `md-render-demo/shots/01-preview-top.png`（demo 已删除） | 文件头属性卡、标题、正文 |
| `02-lists-tasks.png` | 圆点列表、任务复选框 |
| `03-quote-callouts.png` | 引用、五种提示框 |
| `04-code-table.png` | 代码块头、行内伪表格 |
| `05-mermaid-math.png` | Mermaid、KaTeX |
| `06-paths.png` | 行内代码路径、本地链接、网页链接 |
| `07-source.png` | 源码模式与行号 |
| `08-dark.png` | 深色主题 |

