# 聊天回复 Mermaid 图表渲染 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260928-chat-mermaid-diagrams.md`
- **执行过程**：`docs/exec-runs/20260928-chat-mermaid-diagrams/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（真实 Electron 验收待人工）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| Mermaid renderer adapter | `apps/desktop/src/renderer/components/messages/mermaid-renderer.ts` | 懒加载、固定 strict 配置、源码策略、SVG 净化、上限、缓存、实例 id、PNG 导出、Codex 预设 |
| 图表块 | `.../messages/MermaidDiagramBlock.tsx` | loading / ready / error / 源码视图，工具栏：查看源码、复制源码、下载 PNG、放大 |
| 放大预览 | `.../messages/MermaidPreviewDialog.tsx` | 适配视口、档位缩放、Ctrl/⌘ 滚轮、拖拽平移、快捷键、焦点管理 |
| Markdown 分流 | `.../messages/MarkdownProse.tsx` | 仅对语言完整匹配且 fence 闭合的块渲染图表 |
| 外观偏好 | `apps/desktop/src/renderer/appearance/{types,storage}.ts` | `mermaidTheme: "codex"`，旧记录回落 |
| 样式 | `apps/desktop/src/renderer/styles/markdown.css` | SVG 尺寸、最小内联比例、安全居中 |
| 依赖 | `apps/desktop/package.json`、`pnpm-lock.yaml` | `mermaid@11.17.2`、`dompurify@^3.4.16` |
| 测试与验收页 | `apps/desktop/src/renderer/test/{mermaid-renderer.test.ts,mermaid-preview-dialog.test.ts,markdown-prose.test.tsx,appearance.test.ts}`、`test/fixtures/mermaid-preview.{html,tsx}` | 自动化与视觉 fixture |

## 人工验证指引

### 必须验证

1. **真实会话渲染**
   - 验证方式：`pnpm dev`，让模型输出含 sequence / flowchart / state 的 ` ```mermaid ` 回复。
   - 预期结果：流式期间先显示代码块，fence 闭合后切换为浅色图表；同一回复其他内容不受影响。
2. **复制源码与 PNG 下载**
   - 验证方式：点击图表顶栏「复制 Mermaid 源码」粘贴到编辑器；点击「下载 PNG」。
   - 预期结果：剪贴板为原始源码；弹出保存对话框（Electron 默认行为），文件名 `mermaid-<类型>.png`，图片完整、底色为浅色画布。
3. **放大预览**
   - 验证方式：点「放大查看」，试 `+` / `-` / `0`、Ctrl/⌘ + 滚轮、拖拽、Esc。
   - 预期结果：打开即适配窗口且不放大小图；缩放以光标为中心；Esc 关闭后焦点回到放大按钮；滚轮缩放不触发整窗缩放。
4. **深色 / 跟随系统主题**
   - 验证方式：设置 → 外观切换浅色、深色、跟随系统。
   - 预期结果：图表画布与节点色始终不变；顶栏、按钮、错误提示随主题翻转且清晰。

### 建议验证

1. **语法错误**
   - 验证方式：让模型输出错误的 Mermaid。
   - 预期结果：该块显示「无法渲染图表：图表语法有误，已显示源码。」并展开源码，其余图正常。
2. **浏览器 fixture**
   - 验证方式：`pnpm --filter @actspace/desktop dev:renderer` 后打开 `/src/renderer/test/fixtures/mermaid-preview.html`，可加 `?theme=dark`、`?streaming=1`、`?expand=1`、`?png=0`。
   - 预期结果：与本次截图一致。

## Agent 已完成的验证

- `pnpm --filter @actspace/desktop exec tsc --noEmit -p tsconfig.json` 与 `-p tsconfig.electron.json`：通过。
- `pnpm --filter @actspace/desktop test`：858 项中 857 通过；唯一失败 `workspace-git-context-service` 与本次无关（本机 git 中文输出），`LANG=C LC_ALL=C` 下该文件 7 项全部通过。
- `vite build`：通过；Mermaid 为独立懒加载 chunk（`mermaid.core-*.js` 666 KB / gzip 161 KB）。
- `pnpm check:frontend-tokens`、`pnpm check:frontend-theme`、`pnpm check:current-docs`、`pnpm check:repo`：通过。
- `pnpm check:docs`：唯一报错为 main 上既有的 `active/20260926-site-homepage-redesign.md`（顶部声明已完成仍在 active），与本次无关；本次新增/修改的文档无报错。
- headless Chrome 截图：浅色、深色、流式未闭合、放大预览（适配 63%）、PNG 导出。

## 已知风险和遗留事项

- 很宽的时序图在聊天列内需要横向滚动（最小 72%），完整查看依赖放大预览。
- 内联图表与预览同时存在时 DOM 中是两份 SVG，已重写 id，无冲突；Mermaid 渲染依然串行，极多图的回复首屏会逐个出现。
- `foreignObject` 类标签（少数图类型）导出 PNG 时可能污染 canvas，失败会显示「导出失败」。
- `workspace-git-context-service` 测试依赖英文 git 输出，建议单独修复（与本次无关）。

## 后续建议

- 需要时再增加外观页选择器、深色变体或 `follow-app` 模式（主题注册表与 `mermaidTheme` 字段已预留）。
- 右侧 Markdown 文件预览可复用 `MermaidDiagramBlock`。
