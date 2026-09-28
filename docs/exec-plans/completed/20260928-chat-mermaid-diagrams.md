# 聊天回复 Mermaid 图表渲染

> 状态：已完成（2026-09-28）。自动化、浏览器 fixture 截图（浅/深、流式、预览、PNG）已通过；真实 Electron 窗口中的剪贴板、PNG 下载对话框和真实模型输出尚未验收，见执行摘要。

## 目标

助手回复里的 ` ```mermaid ` 代码块显示为固定 Codex 浅色风格的图表，提供放大（缩放/平移）、复制源码、查看源码、导出 PNG；语法错误只影响该块并保留源码入口；源码按不可信输入处理。

## 范围

- 包含：聊天回复与子 Agent 最终报告（两处都走 `MarkdownProse`）的 Mermaid 渲染；Mermaid 懒加载 adapter、安全策略、主题注册表；`AppearancePrefs.mermaidTheme`（只有 `codex`，不加设置 UI）；放大预览 Dialog；PNG 导出；自动化测试；设计文档与主题规范补充。
- 不包含：右侧 Markdown 文件预览、设置页选择器、跟随应用主题 / 深色变体、自定义颜色、预览内编辑源码、Mermaid `click` / 链接 / HTML label 能力。

## 背景

- 设计文档：`docs/design-docs/frontend/front-chat-mermaid-diagrams.md`（开放项已在 2026-09-28 与用户确认，见其决策记录）。
- 相关代码：
  - `apps/desktop/src/renderer/components/messages/MarkdownProse.tsx`：fenced code 分流。
  - `apps/desktop/src/renderer/components/messages/mermaid-renderer.ts`（新增）：懒加载、固定安全配置、源码策略、SVG 净化、缓存、主题注册表。
  - `apps/desktop/src/renderer/components/messages/MermaidDiagramBlock.tsx`（新增）：loading / ready / error / 源码视图与工具栏。
  - `apps/desktop/src/renderer/components/messages/MermaidPreviewDialog.tsx`（新增）：放大预览，缩放/平移/焦点管理。
  - `apps/desktop/src/renderer/appearance/{types,storage}.ts`：`mermaidTheme` 字段与旧记录回落。
  - `apps/desktop/src/renderer/styles/markdown.css`：图表块样式（位于 markdown 内容边界）。
- 已知约束：
  - 助手消息没有"正在流式"标记；以 fence 是否闭合判断源码是否定稿，闭合后源码不再变化，只渲染一次。
  - jsdom 没有 SVG 布局能力，Mermaid 真实绘制只能在浏览器 / Electron 中验证；单测对 `mermaid` 模块打桩。
  - 图表色板是固定预设（不随应用主题翻转），属于 `front-主题与配色规范.md` 允许的独立可视化色板，与 `terminal-theme.ts` 一样放在 TS 里而不是 Tailwind 字面量。

## 关键决定

- 依赖：`mermaid@11.17.2`（12.0.0 于 2026-09-10 发布，较新，首版不追）；`dompurify` 直接依赖用于输出 SVG 二次净化（Mermaid 本身已依赖它）。
- 安全：`securityLevel: "strict"`、`htmlLabels: false`、`suppressErrorRendering: true`；把 `theme`、`themeVariables`、`themeCSS`、`fontFamily`、`htmlLabels`、`look`、`flowchart`、`sequence` 等加入 `secure`，同时在源码层剥离 `%%{init}%%` 指令、frontmatter `config`、`click` / `link` / `callback` 语句；输出 SVG 经 DOMPurify（SVG profile）并移除非 `#` 开头的 href。
- 上限：源码 20,000 字符、边 500 条、渲染超时 10 秒、SVG 输出 2 MB；超限进入错误态并可查看源码。
- 缓存：按 `theme + source` 缓存最近 32 个渲染结果（只缓存已净化的 SVG），并对同一 key 的进行中请求去重。
- 唯一 id：渲染 id 为 `act-mermaid-<n>-src`；缓存结果每次挂载时由 `instantiateMermaidSvg` 把渲染 id 替换为实例 id，消息内重复图与放大预览中的副本都不会产生 marker / CSS 作用域冲突。
- 内联尺寸：宽图缩到列宽，但不小于原尺寸 72%，再宽在块内横向滚动（`justify-content: safe center`）。

## 风险

- Mermaid 体积大：用动态 `import("mermaid")`，Vite 自动拆 chunk；非 Mermaid 回复不加载。
- DOMPurify 误删 Mermaid 必要节点（`style`、`marker`、`foreignObject`）：单测覆盖典型 SVG 片段，浏览器实测 sequence / flowchart / state。
- PNG 导出含 `foreignObject` 时 canvas 被污染：`htmlLabels: false` 下常见图不含；失败时显示"导出失败"。
- 回退：移除 `MarkdownProse` 中的 Mermaid 分流即恢复为普通代码块，其余文件无外部依赖。

## 任务

1. T1 依赖与 adapter：`mermaid-renderer.ts`（`isMermaidLanguage`、`isFenceClosed`、`prepareMermaidSource`、`sanitizeMermaidSvg`、`renderMermaid`、`MERMAID_THEMES`）。验证：`mermaid-renderer.test.ts`。
2. T2 外观偏好：`AppearancePrefs.mermaidTheme = "codex"`，旧记录缺字段回落。验证：`appearance.test.ts` 新用例。
3. T3 图表块：`MermaidDiagramBlock.tsx` + `markdown.css`；`MarkdownProse` 仅在语言完整匹配 `mermaid` 且 fence 闭合时分流。验证：`markdown-prose.test.tsx` 新用例（识别、未闭合、错误隔离、复制、查看源码）。
4. T4 放大预览：`MermaidPreviewDialog.tsx`（适配视口、+/−、1:1、滚轮缩放、拖拽平移、Esc、焦点归还）。验证：`mermaid-preview-dialog.test.tsx`。
5. T5 PNG 导出：SVG → Image → canvas（2x，填充画布色）→ 下载。验证：浏览器实测。
6. T6 文档：设计文档状态与决策、主题规范补充 Mermaid 固定色板例外、`front-中间消息区规范.md` 补 Mermaid 块、history。

## 验证方式

- 命令：`pnpm --filter @actspace/desktop test`、`pnpm --filter @actspace/desktop typecheck`、`pnpm check:frontend-tokens`、`pnpm check:frontend-theme`、`pnpm --filter @actspace/desktop build:renderer`。
- 浏览器 renderer：用 Vite 打开包含 sequence / flowchart / state / 错误语法的回复（测试 harness 或 dev 页面），light / dark 下截图，确认图表外观一致、宽图块内滚动、放大预览交互。
- Electron：真实会话让模型输出 Mermaid，检查剪贴板、PNG 下载对话框、Esc 与焦点；若本轮无法操作窗口，写入执行摘要由用户验收。

## 进度记录

- [x] 2026-09-28 与用户确认：固定 Codex 浅色、暂不加设置 UI；全部图类型按需加载；预览只做缩放/平移。
- [x] T1 adapter 与依赖；T2 外观偏好；T3 图表块与分流；T4 放大预览；T5 PNG 导出；T6 文档。
- [x] 视觉验收页 `apps/desktop/src/renderer/test/fixtures/mermaid-preview.html` 截图检查浅色、深色、流式未闭合、放大预览与 PNG 导出。
- [ ] 真实 Electron 验收（用户执行，见执行摘要）。

## 决策记录

- 2026-09-28：以 fence 闭合代替"消息完成"作为渲染时机，因为助手消息块没有流式标记，而闭合后的源码已定稿。
- 2026-09-28：选 mermaid 11.17.2 而非 12.0.0，理由见"关键决定"。
- 2026-09-28：Codex 预设取 Codex 橙色聊天主题的节点色（从本机 Codex 编译产物读取色值，不复制代码），连线灰色、画布 `#fbfaf8`；工具栏放画布外复用代码块顶栏。
- 2026-09-28：浏览器实测发现宽图整体缩小后字迹难读，增加 72% 最小内联比例；预览中「适应窗口」与「实际大小」图标重复，后者改为 `1:1` 文字。

## 执行模式

- **交互模式**。

## 执行文档

- `docs/exec-runs/20260928-chat-mermaid-diagrams/execution-process.md`
- `docs/exec-runs/20260928-chat-mermaid-diagrams/execution-summary.md`
