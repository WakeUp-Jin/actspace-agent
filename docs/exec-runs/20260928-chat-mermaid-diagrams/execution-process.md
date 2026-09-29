# 聊天回复 Mermaid 图表渲染 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260928-chat-mermaid-diagrams.md`
- **执行模式**：交互
- **开始时间**：2026-09-28 20:40
- **结束时间**：2026-09-28 21:55

## 执行时间线

### 步骤 1：确认开放项与参考

- **操作**：与用户确认设计文档开放项（固定 Codex 浅色且暂不加设置、全部图类型按需加载、预览只做缩放/平移）；从本机 Codex 编译产物读取 Mermaid 配置、主题色值和预览交互作为视觉参考。
- **影响文件**：`docs/design-docs/frontend/front-chat-mermaid-diagrams.md`（从用户提供的草案迁入仓库）。
- **决定**：Codex 默认走蓝色强调；设计文档描述的截图是低饱和橙色，因此取 Codex 橙色聊天主题的节点色。

### 步骤 2：依赖与 renderer adapter

- **操作**：新增 `mermaid@11.17.2`、`dompurify`；实现 `mermaid-renderer.ts`（fence 检测、源码策略、固定 strict 配置 + `secure` 键、DOMPurify 净化、上限、LRU 与并发去重、实例 id 重写、PNG 导出）。
- **影响文件**：`apps/desktop/package.json`、`pnpm-lock.yaml`、`apps/desktop/src/renderer/components/messages/mermaid-renderer.ts`。
- **决定**：12.0.0 发布仅 18 天，首版用 11.x。pnpm 顺带重排的 devDependencies 已还原，只保留新增两行。
- **验证**：`mermaid-renderer.test.ts` 12 项通过（首次失败：DOMPurify 默认删除 `<use>`，加入 `ADD_TAGS` 并由 href 钩子限制为 `#id`）。

### 步骤 3：外观偏好、图表块、预览与 Markdown 分流

- **操作**：`AppearancePrefs.mermaidTheme`；`MermaidDiagramBlock`、`MermaidPreviewDialog`；`MarkdownProse` 通过 context 取原始 Markdown 判断 fence 闭合。
- **影响文件**：`appearance/types.ts`、`appearance/storage.ts`、`MermaidDiagramBlock.tsx`、`MermaidPreviewDialog.tsx`、`MarkdownProse.tsx`、`styles/markdown.css`。
- **决定**：`pre` 组件保持稳定引用（不在 `components` 里写内联函数），避免流式每个 token 都重挂载图表。
- **验证**：`markdown-prose.test.tsx` 新增 6 项、`mermaid-preview-dialog.test.ts` 2 项、`appearance.test.ts` 1 项通过；首次失败为两个相同图同时渲染触发两次 Mermaid，已加进行中去重。

### 步骤 4：浏览器 fixture 验收

- **操作**：新增 `test/fixtures/mermaid-preview.{html,tsx}`，Vite + headless Chrome 截图浅色、深色、`?streaming=1`、`?expand=1`、`?png=0`。
- **决定**：宽时序图 / LR 流程图整体缩小后不可读 → 增加 72% 最小内联比例与块内横向滚动；预览两个按钮图标重复 → 「实际大小」改为 `1:1`。
- **验证**：截图确认图表在浅/深应用主题下外观一致、工具栏随主题、未闭合 fence 显示代码、预览打开即适配（63%）、PNG 导出完整且无 canvas 污染。

### 步骤 5：全量验证与文档

- **操作**：typecheck、全量 vitest、renderer 构建、仓库检查；同步设计文档、主题规范、消息区规范、索引和 history。
- **验证**：见执行摘要。

## 遇到的问题

- **问题**：新 worktree 首次 typecheck 大量 `Cannot find module '@actspace/*'`。
  - **原因**：workspace 依赖包未构建。
  - **应对**：`pnpm --filter @actspace/desktop build:deps:dev` 后通过。
- **问题**：全量测试中 `workspace-git-context-service` 1 项失败。
  - **原因**：本机 git 输出中文，被测逻辑按英文错误文本判断；与本次改动无关。
  - **应对**：`LANG=C LC_ALL=C` 下 7 项全部通过；未修改该模块。
- **问题**：端口 5199 被另一个 worktree 的 Vite 占用。
  - **应对**：改用 5237。

## 跳过或推迟的事项

- 真实 Electron 窗口验收：本轮无 Computer Use，交由用户按执行摘要执行。
- 设置页 Mermaid 主题选择器、深色变体、自定义颜色、预览内编辑：按用户确认不在首版范围。
