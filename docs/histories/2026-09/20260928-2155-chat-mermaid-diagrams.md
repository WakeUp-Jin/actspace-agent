## [2026-09-28 21:55] | Task: 聊天回复 Mermaid 图表渲染

### 🤖 Execution Context

- Agent ID: claude-code
- Base Model: Claude Opus 5.5
- Runtime: Claude Code CLI（worktree `feat/chat-mermaid-diagrams`）

### 📥 User Query

> 从 main 分出 worktree 与分支，按「Chat Mermaid 图表渲染设计」完成该功能。确认：固定 Codex 浅色、暂不加设置；全部图类型按需加载；预览只做缩放/平移。

### 🛠 Changes Overview

Scope: apps/desktop renderer、docs

Key Actions:

- **Renderer adapter**：懒加载 `mermaid@11.17.2`，固定 strict 配置并把主题/安全相关键加入 `secure`；源码层剥离 `%%{init}%%`、frontmatter `config`、`click/link/callback`；输出经 DOMPurify 净化且只保留 `#` 内部引用；源码 / 边数 / 时长 / SVG 体积上限；LRU 32 + 并发去重；实例 id 重写；PNG 导出。
- **图表块与预览**：`MermaidDiagramBlock` 复用代码块外壳，顶栏提供查看源码、复制源码、下载 PNG、放大；错误态局部提示并展开源码；`MermaidPreviewDialog` 适配视口、档位缩放、光标锚定滚轮缩放、拖拽平移、快捷键与焦点归还。
- **Markdown 分流**：`MarkdownProse` 通过 context 取原始 Markdown，仅对语言完整匹配 `mermaid` 且 fence 闭合的块渲染图表。
- **外观偏好**：`AppearancePrefs.mermaidTheme = "codex"`，旧记录回落；暂无设置入口。
- **Codex 预设**：取 Codex 橙色聊天主题节点色（`#ffe7d9` / `#fff5f0` / `#6d2e0f`）、灰色连线、`#fbfaf8` 画布与 ActSpace 自写 themeCSS。
- **验证资产**：单测 + `test/fixtures/mermaid-preview.html` 视觉验收页（主题、流式、预览、PNG 参数）。
- **文档**：设计文档迁入仓库并记录决策；主题规范补 Mermaid 固定色板例外；消息区规范补 Mermaid 块；计划与执行记录。

### 🧠 Design Intent (Why)

助手消息没有流式标记，但 fence 一旦闭合源码就定稿，所以用「闭合」作为渲染时机即可保证每张图只渲染一次。模型生成的 Mermaid 是不可信输入，因此配置全由应用掌握、交互语句在解析前删掉、输出再净化一遍。图表色板与应用主题解耦，工具栏放在画布外沿用代码块顶栏，深色 UI 下也不会出现浅色画布上的浅色按钮。

学习沉淀：本次涉及「流式 Markdown 中以 fence 闭合判定稳定区块」「Mermaid `secure` 键 + DOMPurify 双层防护」「缓存 SVG 复用时的 id 冲突」等可迁移点，已在设计文档「实现落点」与执行过程中记录，未单独写学习文档。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/messages/mermaid-renderer.ts`
- `apps/desktop/src/renderer/components/messages/MermaidDiagramBlock.tsx`
- `apps/desktop/src/renderer/components/messages/MermaidPreviewDialog.tsx`
- `apps/desktop/src/renderer/components/messages/MarkdownProse.tsx`
- `apps/desktop/src/renderer/appearance/types.ts`
- `apps/desktop/src/renderer/appearance/storage.ts`
- `apps/desktop/src/renderer/styles/markdown.css`
- `apps/desktop/src/renderer/test/mermaid-renderer.test.ts`
- `apps/desktop/src/renderer/test/mermaid-preview-dialog.test.ts`
- `apps/desktop/src/renderer/test/markdown-prose.test.tsx`
- `apps/desktop/src/renderer/test/appearance.test.ts`
- `apps/desktop/src/renderer/test/fixtures/mermaid-preview.html`
- `apps/desktop/src/renderer/test/fixtures/mermaid-preview.tsx`
- `apps/desktop/package.json`、`pnpm-lock.yaml`
- `docs/design-docs/frontend/front-chat-mermaid-diagrams.md` 及相关索引、规范、计划与执行记录
