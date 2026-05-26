## [2026-05-26 23:45] | Task: sidebar 隐藏后 main pane 顶栏标题盖住折叠按钮的修复

### 📥 User Query

> 嗯嗯可以点击啦，就是点击之后中间的视图布局有点奇怪你看看吧，"New chat" 名字挡住啦左侧边栏的折叠按钮，但是 Cursor 不是这样的。

承接上一轮（`20260526-2315-sidebar-collapse-grid-fix.md`）把 Electron drag region + grid 隐式 track 两个 bug 都修好之后，sidebar 折叠按钮**能点了**、main pane 也**真的全宽展开了**。但用户立刻发现新问题：sidebar 隐藏之后，main pane 顶部的 `.topbar`（"New chat" 标题）直接从 X=0 开始铺，**标题在视觉上正好压在左上角的 `SidebarChromeRow`（折叠 + 搜索两按钮）位置上**。

Cursor 在 sidebar 隐藏态下，main pane 标题会从 chrome row 之后再开始，把红绿灯右边那一条留给 chrome row 自己——这是本次要对齐的行为。

### 🛠 Changes Overview

**Scope:** `@actspace/desktop`（CSS only）。

**核心改动**

1. `packages/desktop/src/renderer/styles.css` 顶部新增三个 chrome row 布局相关的 CSS 变量：

   ```css
   --window-chrome-row-left: 86px;
   --window-chrome-row-width: calc(var(--window-chrome-control-size) * 2 + 4px);
   --window-chrome-left-safe: calc(
     var(--window-chrome-row-left) + var(--window-chrome-row-width) + 16px
   );
   ```

   - `--window-chrome-row-left`：chrome row 的 fixed `left`，原来硬编码 `86px`，现在统一从变量取。
   - `--window-chrome-row-width`：2 个 22px 按钮 + 4px gap = 48px。
   - `--window-chrome-left-safe`：sidebar 隐藏后 main pane 顶栏标题必须从这个 X 开始才不会盖住 chrome row。chrome row 结束位置 + 16px 视觉安全间距 = 150px。

2. `.sidebar-chrome-row` 的 `left` 从硬编码 `86px` 改成 `var(--window-chrome-row-left)`，与 topbar 安全区联动。

3. 新增 `.split-view.is-left-hidden .topbar { padding-left: var(--window-chrome-left-safe); }`：sidebar 显示时 topbar 仍用原本的 32px 左 padding（因为它前面有 260px sidebar 挡着，不存在压 chrome row 的问题）；sidebar 隐藏时切到 chrome 安全区。

### 🤔 为什么之前会出问题

- `SidebarChromeRow` 是 `position: fixed`，挂在 WorkbenchLayout 顶层，X=86，相对**视口**定位。
- `.topbar` 是 main pane 内的 relative 元素，X 起点 = main pane 起点 = sidebar 占据的宽度。
  - sidebar 展开：main pane X 起点 = 260，topbar 左 padding 32px → 标题从 X=292 开始，远在 chrome row 右边，不冲突。
  - sidebar 隐藏：main pane X 起点 = 0，topbar 左 padding 仍是 32px → 标题从 X=32 开始，**直接落在 chrome row 区域（X=86~134）上**。

这是上一轮把 sidebar 真正"完全消失"修好之后才暴露出来的下游问题——展开态下永远见不到，所以以前没踩。Cursor 用同样的两栏 chrome row + 标题布局，解决方式跟我们一致：把"sidebar 隐藏态下 topbar 左 padding 拉到 chrome row 之后"显式表达出来。

### ✅ Verification

- typecheck + 30 个 vitest 全过。
- Electron 真机需要用户重新触发 sidebar 折叠看视觉确认。

### 🔗 Related

- 上一轮：`docs/histories/2026-05/20260526-2315-sidebar-collapse-grid-fix.md`
- 相关学习：`docs/learnings/2026-05/electron-hidden-titlebar-layout.md`、`docs/learnings/2026-05/css-grid-implicit-tracks-trap.md`
