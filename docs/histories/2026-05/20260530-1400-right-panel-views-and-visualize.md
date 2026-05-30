## [2026-05-30 14:00] | Task: 实现右侧面板视图 V1 + 消息可视化转换

### 🤖 Execution Context

- **Agent ID**: `本地会话`
- **Base Model**: `Claude Opus 4.8`
- **Runtime**: `Cursor`

### 📥 User Query

> 一起设计并实现右侧视图：Tab 栏压缩到接近 Cursor 的高度/字号；做 HTML 与 Markdown 渲染（Preview/源码）；Context 做成完整只读视图（弹窗加展开图标进入，按 bucket 配色联动、整行浅底、Conversation 默认折叠+限条+导出）。
> 追加：在每条回复的「⋯」按钮左侧加一个可视化按钮——点击用主模型把回复 Markdown 转成 HTML 在右侧渲染；成本敏感，**只第一次生成、之后读缓存、持久化**。
> 先实现简单且安全的 V1，规范从完整/安全角度写清并标注 V1/V2。最后："开始执行计划"。

### 🛠 Changes Overview

**Scope:** `@actspace/shared`、`@actspace/agent-core`、`@actspace/desktop`（main + preload + renderer）+ `docs/`

**Key Actions:**

- **Tab 底座（Task 1）**: 新增 `RightPanelContext` 驱动动态 Tab（开关/列表/当前/关闭），`App` 注入 Provider，`WorkbenchLayout`/`ConversationView` 消费；Tab 按钮按方案 A 压缩（高度/字号），保留 44px 行容器对齐 chrome strip。
- **渲染视图（Task 2/3）**: `MarkdownRenderView`（`react-markdown` + `remark-gfm` + `rehype-highlight`，主题感知高亮 + Preview/源码）；`HtmlRenderView`（`<iframe sandbox="allow-scripts">` + srcDoc + CSP 双档 strict/relaxed + 主题注入 + 最小 postMessage 桥，**不加 `allow-same-origin`**）；共享 `PreviewSourceToggle`。
- **Context 完整视图（Task 4）**: `ContextRenderView` 接 `contextState`，按 `CONTEXT_BUCKET_REGISTRY` 配色联动、整行 `color-mix` 浅底 + 左色条，Conversation 默认折叠且限 20 条、提供 `.md`/`.json` 导出；`ContextPopup` 加展开图标入口。
- **消息可视化转换（Task 7）**: agent-core `convertReplyToHtml`（单次主模型调用 + `extractHtmlDocument`）；main `visualizeReply` 以 `messageId:sourceHash` 缓存到 session `visualizations.json` sidecar，命中零模型调用；新 IPC `visualize:convert-reply`（shared 契约 + preload + `global.d.ts`）；`TurnActions` ⋯ 左侧加状态机按钮（idle/generating/ready/error）+「重新生成」。

### 🧠 Design Intent (Why)

- HTML 与 Markdown 互补：HTML 可视化强、Markdown 信息密度高，右侧统一用 Tab + Preview/源码承载两种查看方式。
- 安全优先：模型/文件产出的 HTML 视为半可信，一律走 sandbox iframe + CSP，绝不因"自家模型生成"放宽 `allow-same-origin`。
- 成本可控：可视化转换是一次真实模型调用，必须"生成一次→持久化→读缓存"，缓存键带内容 hash，仅内容变化或显式重生成才重算。
- 主题硬约束：所有配色走 `--act-*` token 与 `color-mix` 派生，不新增字面量，浅/深双主题自动翻转。

### 📁 Files Modified

- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/visualize/md-to-html.ts`、`packages/agent-core/src/visualize/index.ts`、`packages/agent-core/src/index.ts`
- `packages/agent-core/src/visualize/test/md-to-html.test.ts`
- `packages/desktop/src/main/index.ts`、`packages/desktop/src/main/visualize-service.ts`
- `packages/desktop/src/main/test/visualize-service.test.ts`
- `packages/desktop/src/preload/index.ts`、`packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/components/ConversationView.tsx`、`WorkbenchLayout.tsx`、`App.tsx`
- `packages/desktop/src/renderer/components/right-panel/RightPanelContext.tsx`、`HtmlRenderView.tsx`、`MarkdownRenderView.tsx`、`PreviewSourceToggle.tsx`、`ContextRenderView.tsx`
- `packages/desktop/src/renderer/components/RightPanel.tsx`、`ContextPopup.tsx`、`Composer.tsx`
- `docs/exec-plans/active/20260527-right-panel-views.md`
