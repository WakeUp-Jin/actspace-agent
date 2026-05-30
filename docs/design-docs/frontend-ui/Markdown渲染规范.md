# Markdown 渲染规范

## 定位

这份文档定义 `actspace` 桌面端右侧面板里 **Markdown 文件的渲染方式**：把 `.md` 渲染为可读文档，并支持 Preview / 源码 两态切换。

面板外壳 / Tab / 宽度规则见 `右侧面板与文件渲染规范.md`；颜色随主题翻转的硬约束见 `主题与配色规范.md`；与 HTML 渲染共用同一套 Preview/源码切换模式（见 `HTML渲染与沙箱安全规范.md`）。

## 现状与边界

- 聊天消息区当前用**自研手写解析器**（`packages/desktop/src/renderer/components/messages/MarkdownProse.tsx`）。它能力有限（不支持任务列表、嵌套、围栏语言高亮等），但已稳定服务消息流。
- 右侧面板是正式引入成熟 Markdown 渲染栈的入口。**本规范只约束右侧面板的 Markdown 渲染**；聊天区是否统一到同一栈属 V2，不在本轮强行迁移，避免一次动太多。

## 渲染栈（已和用户对齐）

- `react-markdown` + `remark-gfm`：表格、任务列表、删除线、自动链接等 GFM 能力。
- 代码高亮：`rehype-highlight`（基于 highlight.js，**轻量、同步**，先上线）。Shiki（VS Code 同款、保真+主题对齐，但较重/异步）作为 V2 可选升级，不在 V1。

## 安全

- `react-markdown` 默认**不渲染原始 HTML**（不内联 `dangerouslySetInnerHTML`）。V1 **不引入 `rehype-raw`**，从根上避免 Markdown 里夹带的原始 HTML 注入。
- 链接做 sanitize：只放行 `http/https/mailto`，其余降级为不可点；外链 `target="_blank" rel="noreferrer"`。
- 如果 Markdown 里出现 HTML 代码块（围栏标注 ```html），按"代码"展示或交由 HTML 渲染线（`HTMLRender`）处理，不在 Markdown 渲染器里直接执行。

## 样式与主题

- 复用既有 `.markdown-prose` 容器与 `styles/markdown.css`：react-markdown 输出标准标签（`h1..h4 / p / ul / ol / blockquote / table / hr / a / code`），包一层 `<div className="markdown-prose">` 即可继承现有排版。
- 代码块：给 `<pre>` 加 `markdown-code-block` class，复用现有代码块底色/边框 token。
- **代码高亮配色必须随主题翻转**：rehype-highlight 产出 `hljs` token class（`hljs-keyword / hljs-string / ...`）。需要补一套**浅 / 深各一份的 hljs 主题样式**，颜色用 `--act-*` 语义/数据可视化 token 或在 `tokens.css` 新增 hljs 专用 token（浅深两套），**禁止在样式里写死 `#hex`**（见 `主题与配色规范.md`）。两套主题都要验。

## Preview / 源码 切换

- 顶部一个轻量分段控件（`Preview | 源码`），与 Cursor 的 `Preview | Markdown` 同型；可用 Radix ToggleGroup 或自写两按钮，不引重型依赖。
- `Preview`：渲染后的文档。
- `源码`：原始 Markdown 文本，用同一套 highlight（`markdown` 语言）上色，保留可滚动、可复制。
- 切换状态属于该 Tab 的局部状态，不写全局。

## V1：简单 + 安全（本轮范围）

- `react-markdown` + `remark-gfm` + `rehype-highlight` 渲染 Markdown。
- Preview / 源码 切换。
- 复用 `.markdown-prose`，补 hljs 浅/深主题样式。
- 链接 sanitize；不渲染原始 HTML。

### V1 明确边界（不做）

- 不支持原始 HTML 内联（不引 `rehype-raw`）。
- 不支持数学公式、Mermaid 图、目录/锚点跳转。
- 不迁移聊天区的手写解析器。

## V2：完整版（计划先写，**等用户指令再实现**）

> V2 不在当前实现轮次，需用户显式指令后再动工。

- `rehype-raw` + 严格 sanitize（`rehype-sanitize`）支持受控原始 HTML。
- 数学公式：`remark-math` + `rehype-katex`。
- 图表：Mermaid（用其 `securityLevel: "sandbox"` 在 iframe 内渲染）。
- 高亮升级到 **Shiki**（保真 + 与编辑器主题对齐）。
- 目录（TOC）/ 标题锚点 / 段内跳转。
- 把聊天消息区统一迁移到该渲染栈，下线手写解析器。

## 验收

- 打开 Markdown 文件显示渲染文档，含表格 / 任务列表 / 代码高亮。
- Preview ↔ 源码 切换稳定，源码可复制。
- 浅色 / 深色两套主题下，正文与代码高亮配色都正确（重点查代码块 token 颜色不在深色下糊掉）。
- 恶意链接（`javascript:` 等）不可点击执行。

## 关联

- `右侧面板与文件渲染规范.md`：右侧面板外壳与文件渲染总规则。
- `HTML渲染与沙箱安全规范.md`：共用 Preview/源码模式；Markdown 内的 HTML 交由 HTML 线处理。
- `主题与配色规范.md`：hljs 配色必须随主题翻转。
- 执行计划：`docs/exec-plans/active/20260527-right-panel-views.md`。
