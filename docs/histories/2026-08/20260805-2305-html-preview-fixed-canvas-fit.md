## [2026-08-05 23:05] | Task: 让固定画布 HTML 自动适应预览区

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### User Query

> HTML 预览在右侧面板中只能看到固定画布的一部分，展开文件树后裁切更严重，希望修正渲染。

### Changes Overview

**Scope:** `packages/desktop/src/renderer`、前端设计文档

**Key Actions:**

- **固定画布检测**: iframe 桥从只回传内容高度扩展为回传内容宽高与 iframe 视口宽度；内容宽度明显超过视口时锁住自然画布宽度。
- **适应宽度**: 固定画布在父层按预览区宽度等比缩小且不放大，外层使用缩放后的宽高占位，避免 CSS transform 留下原尺寸空白或滚动区域。
- **响应式保护**: 内容宽度等于 iframe 视口的普通页面继续使用 `width: 100%`，不会被固定成第一次测得的桌面宽度。
- **动态重算**: 父层监听预览区宽度，文件树展开、收起和面板 resize 后自动更新缩放比例。
- **回归测试**: 覆盖 `1600x1000 -> 800x500 -> 600x375` 的固定画布变化，以及普通响应式页面保持原生宽度。

### Design Intent

出图型 HTML 常用明确的像素画布保证导出尺寸，它不应该为了适配 ActSpace 而改写成响应式页面。缩放放在 iframe 外层可以保留产物自己的布局和交互，同时不改变既有 sandbox、CSP 和单向消息边界。

锁住首次发现的自然宽度是稳定性的关键：如果 iframe 扩到画布宽度后重新用“内容宽度是否超过当前视口”判断，下一次测量会把它误判为响应式页面，造成原尺寸与缩放尺寸之间振荡。

### Files Modified

- `packages/desktop/src/renderer/components/right-panel/HtmlRenderView.tsx`
- `packages/desktop/src/renderer/test/html-render-view.test.tsx`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
- `docs/learnings/2026-08/scaled-iframes-need-two-coordinate-systems.md`

### Verification

- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/desktop build:renderer`
- `pnpm --dir packages/desktop exec vitest run src/renderer/test/html-render-view.test.tsx src/renderer/test/right-panel-workspace.test.tsx`（11/11）
- `pnpm check:docs`
- `pnpm check:frontend-theme`
- `git diff --check`
- 真实 Electron：打开两份 `1600x1000` HTML，确认两份画布完整显示；第一份在文件树展开与收起后均自动重算且无横向裁切。
