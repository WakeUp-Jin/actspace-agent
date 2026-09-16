# [2026-09-15 22:44] | Task: 优化 Markdown 行内代码样式

### 📥 User Query

> 去掉引用边框，让行内代码更接近 Cursor 的轻量呈现。

### 🛠 Changes Overview

- 移除 Markdown 行内代码边框。
- 保留主题感知淡底和等宽字体，收紧为 3px 圆角与紧凑留白。
- 同步中间消息区规范，明确行内代码与代码块的样式边界。

### 📁 Files Modified

- `apps/desktop/src/renderer/styles/markdown.css`
- `docs/design-docs/frontend/front-中间消息区规范.md`

### ✅ Verification

- `pnpm check:frontend-theme` 通过。
- 浏览器临时预览检查了 light、dark、system 三态及 375px 宽度。
- 桌面端 typecheck 受工作区既有 `DesktopBrowsePage` 导出缺失阻塞，与本次 CSS 修改无关。
- renderer 独立类型检查 `pnpm --filter @actspace/desktop exec tsc --noEmit -p tsconfig.json` 和 `git diff --check` 通过。
- 视觉验证使用实际 tokens.css / markdown.css 的隔离样例；未进行 Electron 真实会话验收。
- 本次属于局部样式收敛，未命中至少两条学习沉淀标准，不单独新增 learning。
