## [2026-11-17 21:30] | Task: 侧栏与消息区滚动条变安静

### 🤖 Execution Context

- **Agent ID**: `claude-code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI`

### 📥 User Query

> 左侧边栏滚动条颜色太深、一直挡在眼角，中间消息区滚动条也想优化；先出 HTML demo。看完 demo 选定：侧栏「悬停才出现」，消息区「更淡、悬停加深」。

### 🛠 Changes Overview

**Scope:** `apps/desktop`（renderer 样式）、前端规范

**Key Actions:**

- **新增 token**：`--act-scrollbar-thumb-quiet`（常驻底色）/ `--act-scrollbar-thumb-near`（鼠标进入区域），浅色和两处深色块同步。
- **侧栏**：`.sidebar-scrollbar` 平时透明，`.sidebar:hover` 或列表内有焦点时淡入。
- **消息区**：`.message-scroll`、`.initial-composer-scroll` 常驻 quiet，hover 加深到 near；`scrollbar-color` 过渡 `--motion-slow`。
- **删掉** `.sidebar-scrollbar` 的 `::-webkit-scrollbar-*` 规则：Chromium 121+ 设置了 `scrollbar-color` 就忽略它们，原来那几条不生效。
- **规范**：左侧会话栏、中间消息区规范各补一句滚动条规则；demo `scrollbar-polish-demo.html` 暂留到 Electron 复验后删除。

### 🧠 Design Intent (Why)

侧栏是导航，不需要一直提示「可滚动」；消息区是阅读区，保留一条很淡的位置感，鼠标在时才清楚。只改 CSS，不引入叠加式滚动条组件。

### Unverified & Leftovers（未验证与遗留）

- **未验证**：Electron 里浅色 / 深色下的实际观感、hover 过渡是否平滑（`scrollbar-color` 过渡在部分 Chromium 版本是瞬切）。
- **遗留**：复验后删除 `docs/design-docs/frontend/scrollbar-polish-demo.html`。

### 📁 Files Modified

- `apps/desktop/src/renderer/styles/tokens.css`
- `apps/desktop/src/renderer/styles/base.css`
- `docs/design-docs/frontend/front-左侧会话栏规范.md`
- `docs/design-docs/frontend/front-中间消息区规范.md`
