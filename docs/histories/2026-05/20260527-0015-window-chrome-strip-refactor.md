## [2026-05-27 00:15] | Task: Window chrome 浮层重构，对齐 Cursor Agent Window

### 📥 User Query

> 我让其他的模型分析啦一下本地 cursor 的文件，尤其是 Agents Window 的文件……Cursor 的 `.part.titlebar` 是 `position: fixed top:0 left:0 right:0 height:34px pointer-events:none`，内部 action toolbar 再恢复 `pointer-events`。actspace 想要参考这种布局。

承接前四轮 sidebar 折叠按钮失灵 / 标题盖按钮等系列 bug（`20260526-2240-sidebar-polish-round3.md`、`2305-round4.md`、`2315-grid-fix.md`、`2345-topbar-chrome-safe.md`），这次做的是结构性收束——彻底废掉「fixed 浮层按钮 + main pane 自管 topbar」的拼接做法，改成 Cursor Agent Window 同款的统一窗口级 chrome 浮层。

### 🛠 Changes Overview

**Scope:** `@actspace/desktop`（前端结构重构 + CSS 大幅简化）。

**核心思路（参考 VS Code Workbench + Cursor Agent Window）**

1. **新建 [packages/desktop/src/renderer/components/WindowChromeBar.tsx](packages/desktop/src/renderer/components/WindowChromeBar.tsx)**
   - 三段 flex：`chrome-left`（红绿灯安全区 + PanelLeft + Search）+ `chrome-center`（标题 + 窗口拖动区）+ `chrome-right`（PanelRight）
   - 整层 `position: fixed top:0 left:0 right:0 height:44px z-index:60 pointer-events:none`
   - 三段子元素 `pointer-events: auto`
   - drag region 唯一保留在 `.chrome-center`；所有按钮显式 `-webkit-app-region: no-drag`
   - chrome bar 自身无背景、无边框，三栏背景自然贯顶
2. **改 [packages/desktop/src/renderer/components/WorkbenchLayout.tsx](packages/desktop/src/renderer/components/WorkbenchLayout.tsx)**
   - 去掉旧 `<SidebarChromeRow>` 引用，改用 `<WindowChromeBar>`
   - chrome 标题随 view 切换：chat 时 = session title；lab/usage/kairos 时 = 对应名
   - `toggleSidebarMode` / `toggleRightPanel` 都提到 chrome bar 调用
3. **改 [packages/desktop/src/renderer/components/Sidebar.tsx](packages/desktop/src/renderer/components/Sidebar.tsx)**
   - 删除 `SidebarChromeRow` 组件 + 导出
   - 移除 `PanelLeft` / `Search` 的 `lucide-react` import（仅在 SidebarChromeRow 用过）
   - Sidebar 顶部 padding 从 `var(--window-sidebar-top-safe)` 改用统一变量 `var(--window-chrome-strip-height)`
4. **改 [packages/desktop/src/renderer/components/ConversationView.tsx](packages/desktop/src/renderer/components/ConversationView.tsx)**
   - 删除 `<header className="topbar">` 整段（title + PanelRight toggle）
   - props 瘦身：移除 `title` / `rightPanelOpen` / `onToggleRightPanel`
   - 移除 `PanelRight` import
5. **改 [packages/desktop/src/renderer/components/RightPanel.tsx](packages/desktop/src/renderer/components/RightPanel.tsx) 的样式**
   - 不再用 `min-height: var(--window-topbar-height)` 这种已退役变量
   - `.right-tabs` 去掉 `-webkit-app-region: drag`
   - `.right-panel` 加 `padding-top: var(--window-chrome-strip-height)` 给 chrome 浮层让位
6. **重写 [packages/desktop/src/renderer/styles.css](packages/desktop/src/renderer/styles.css) 的窗口顶部规则**
   - 退役变量：`--window-sidebar-top-safe` / `--window-rail-title-offset` / `--window-topbar-height` / `--window-chrome-control-top` / `--window-chrome-edge-inset` / `--window-chrome-row-left` / `--window-chrome-row-width` / `--window-chrome-left-safe` / `--topbar-title-padding`
   - 新增变量：`--window-chrome-strip-height: 44px` / `--window-chrome-left-padding: 86px`
   - 删除规则：`.sidebar-chrome-row` / `.sidebar-mode-button` / `.sidebar-chrome-button` / `.topbar` / `.topbar-title` / `.topbar-actions` / `.split-view.is-left-hidden .topbar` / `:root.is-electron .split-view:has(.sidebar.is-rail) .topbar-title`
   - 新增规则：`.window-chrome-bar` / `.chrome-left` / `.chrome-center` / `.chrome-right` / `.chrome-button` / `.chrome-title`
   - drag region 全局审计：从 9 处 `no-drag` + 2 处 `drag` 精简成 1 处 `drag`（chrome-center）+ 1 处 `no-drag`（chrome-button）
7. **改 [packages/desktop/src/renderer/test/sidebar.test.tsx](packages/desktop/src/renderer/test/sidebar.test.tsx)**
   - 把 `SidebarChromeRow` 的 2 个用例换成 `WindowChromeBar` 的 5 个用例（左 toggle、搜索、右 toggle、aria-pressed 状态翻转、三段 DOM 结构）

### 🔍 验证

- **typecheck + 33 个 vitest 全过**（之前 30 个，新 chrome bar 测试 +5、删 SidebarChromeRow 测试 -2）。
- **Vite mock 浏览器 CDP 验证**
  - `.window-chrome-bar` 的 `position: fixed, top:0, left:0, right:0, height:44px, z-index:60, pointer-events:none, background: transparent` ✓
  - 三段子元素 `pointer-events: auto`；`.chrome-center` 唯一 `webkitAppRegion: drag` ✓
  - `document.elementFromPoint(120, 200)` 命中 `sidebar`——证明 chrome bar 浮层下方仍能 hit-test 到三栏内容 ✓
  - 三态点击循环：双侧关 → 左开 → 双侧开 → 右关，每态左/右 toggle 都正常响应 ✓

### 💡 为什么这次结构性收束才稳

四轮 bug 都在打补丁同一个根因：「fixed 浮层按钮 + main pane 自管 topbar」两者在视觉上 X 轴重叠，导致：
- Round 1：`.sidebar` 整块 drag region 吞 chrome row 点击
- Round 2：grid 隐式 track 让折叠后 sidebar 看似还在
- Round 3：sidebar hidden 时 main `.topbar` 标题盖 chrome row
- Round 4：`.topbar` padding 让标题让开后，padding 区仍是 drag region，又抢点击

这次直接照搬 Cursor / VS Code 已经验证过的模式：
- chrome 浮层只有一个，没有跟下方 pane 重叠会冲突的「另一个顶栏」
- `pointer-events: none` 让浮层对下方完全透明，按钮区单独 `auto` → 比 `-webkit-app-region: no-drag` 多一道防护
- drag region 从 4 处压缩到 1 处，没有歧义

### 🔗 Related

- 前四轮：
  - [docs/histories/2026-05/20260526-2240-sidebar-polish-round3.md](docs/histories/2026-05/20260526-2240-sidebar-polish-round3.md)
  - [docs/histories/2026-05/20260526-2305-sidebar-polish-round4.md](docs/histories/2026-05/20260526-2305-sidebar-polish-round4.md)
  - [docs/histories/2026-05/20260526-2315-sidebar-collapse-grid-fix.md](docs/histories/2026-05/20260526-2315-sidebar-collapse-grid-fix.md)
  - [docs/histories/2026-05/20260526-2345-sidebar-hidden-topbar-chrome-safe.md](docs/histories/2026-05/20260526-2345-sidebar-hidden-topbar-chrome-safe.md)
- 学习沉淀：[docs/learnings/2026-05/electron-hidden-titlebar-layout.md](docs/learnings/2026-05/electron-hidden-titlebar-layout.md) 末尾新增「chrome 浮层用 pointer-events 双层而非 drag region 反复打架」一节
