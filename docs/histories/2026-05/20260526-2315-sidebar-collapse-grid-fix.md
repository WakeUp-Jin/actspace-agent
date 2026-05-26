## [2026-05-26 23:15] | Task: 修复 sidebar 折叠按钮点击"没生效"的两个 bug（grid 布局 + Electron drag region）

### 🤖 Execution Context

- **Agent ID**: `353d1cc2-a4cf-41b2-ad82-b893122a9046`
- **Base Model**: Claude Opus 4.7
- **Runtime**: Cursor IDE (desktop, macOS)

### 📥 User Query

> 第一轮：三个点旁边的那个视图缩进按钮（sidebar 折叠按钮）好像没效果，点击左侧 sidebar 不会缩进、像是点击不了。
>
> 第二轮：可是现在还是无法点击呀，这个侧边栏折叠按钮，左边的。

第一轮我以为是 Vite mock 环境里 grid layout 切换没生效（CDP 实测的确有 grid 布局 bug），就先修了那个。但用户回来说还是点不动——这才意识到核心问题在 **Electron 真实环境的 hit-test**，跟 Vite mock 里能正常 click 不是同一个 bug。

### 🛠 Changes Overview

**Scope:** `@actspace/desktop`（CSS only）。

**Key Actions（Bug 1：CSS Grid 隐式 track 让 sidebar 看起来"没消失"）**

- **删除 `.split-view-left` / `.split-view-main` / `.split-view-right` 的硬钉 `grid-column`**，改靠 grid auto-flow 按 DOM 顺序自动落位。这样 sidebar 隐藏 / right panel 开关时不再有"子项请求不存在的列、浏览器静默补出隐式 grid track"的陷阱，main / right 在四种组合下都能落到正确的列。
- separators 仍然是 `position: absolute`，不占 grid 列，所以 DOM 顺序就是 grid 顺序，逻辑成立。
- 视觉确认（CDP 实测三态往返）：

  | 状态 | gridTemplate | main.left | main.width | sidebar in DOM |
  |---|---|---|---|---|
  | expanded → click | `260px 1967px` | 260 | 1967 | ✓ |
  | hidden | `2227px` | 0 | 2227 | ✗ |
  | hidden → click | `260px 1967px` | 260 | 1967 | ✓ |

**Key Actions（Bug 2：Electron drag region 把按钮点击吞了）**

- **去掉 `.sidebar { -webkit-app-region: drag }`**。原意是让用户在 sidebar 顶部空白处拖动窗口，但在 Electron / macOS 上「drag 父容器 + fixed 定位 + no-drag 子元素」的 hit-test 不稳定——`SidebarChromeRow`（position: fixed，z-index 60，no-drag）的折叠/搜索按钮虽然在视觉上盖在 sidebar 上方，但 OS 级窗口拖动判定会优先识别下层 drag 父容器，把点击作为"拖动窗口"吃掉，导致按钮整体点不动。
- 解决方式：sidebar 整体不再标记 drag region；窗口拖动由 main pane 顶部 `.topbar` 继续承担（那里有独立的 drag region，跟 chrome row 没视觉重叠）。
- 这个 bug 在 Vite mock 浏览器里完全测不出来——浏览器没有 `-webkit-app-region` 的概念，CDP 用 `btn.click()` 也能正常触发；只有在 Electron 真机里才会复现。是个典型「mock 环境用相同 CSS 但因为缺失原生 API 导致测试覆盖不到」的盲区。

**Tests / 验证**

- typecheck + 30 个 vitest case 全过。
- Vite mock 浏览器里再次确认折叠/展开往返工作正常（bug 1 修好）。
- Electron 真机点击效果需要用户重新加载窗口（HMR 应该自动应用 CSS）确认 bug 2 修好。

### 🧠 Design Intent (Why)

按钮点击其实一直在工作——React state 正确切换、`isSidebarHidden=true`、SplitView 也正确给容器加了 `is-left-hidden` class、left pane 已经从 DOM 移除。但用户视觉上**完全看不出 sidebar 不见了**，所以以为按钮失灵。

CDP 实测告诉我真凶：

| 状态 | gridTemplate | main.left |
|---|---|---|
| 展开（正常） | `260px 1967px` | 260 |
| 折叠（修复前） | `230.719px 1996.28px` ❌ | 231 ❌ |
| 折叠（修复后） | `2227px` ✓ | 0 ✓ |

修复前折叠时 main 居然不在最左，左边凭空多出 230.7px 的空白列——这就是用户感受到的"sidebar 还在、按钮没生效"。

根因：CSS 里把每个 pane 的 grid-column 都硬钉了：

```css
.split-view-main  { grid-column: 2; }
.split-view-right { grid-column: 3; }
```

SplitView 折叠态下把 `grid-template-columns` 改成单列 `minmax(0, 1fr)` 并从 DOM 里移走了 left pane，但 main pane 仍然强制要求 `grid-column: 2`。CSS Grid 的规则是：**当子项请求的 column 超出 template 显式列数时，浏览器会自动补出隐式 grid track 来满足请求**。于是浏览器为了把 main 放进 col 2，悄悄在 col 1 加了一个空白隐式 track（吃掉 230.7px），main 被推到中间。

这是个非常"沉默"的 CSS 陷阱——没有报错、`is-left-hidden` 也对、React state 也对，只是浏览器在背后帮我们补全了一个看不见的列。修复方式是显式声明"sidebar 隐藏态下 main/right 都向前挪一格"。

### 📁 Files Modified

- `packages/desktop/src/renderer/styles.css`：删除 `.split-view-left/main/right` 三个 pane 的硬钉 `grid-column` 规则，注释里写清楚为什么不写 grid-column（依赖 auto-flow + 不再触发隐式 track）。
- `docs/learnings/2026-05/css-grid-implicit-tracks-trap.md`：把这次 bug 抽成 learning 文档，覆盖隐式 grid track、`grid-column: -1` 技巧、可迁移的"响应式 grid"模式。
