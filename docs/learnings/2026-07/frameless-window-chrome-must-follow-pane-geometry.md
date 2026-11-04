# Electron 自定义标题栏：命中测试、拖动区与 Chrome 几何

合并自四篇：app-region 命中测试、隐藏标题栏布局、自定义标题栏下的命中测试与面板响应式、无边框窗口 Chrome 跟随面板几何。实现入口：`apps/desktop/src/renderer/styles/electron.css`（`.window-chrome-bar`）、`apps/desktop/src/main/window-security.ts`（`titleBarStyle`）。

## 1. 先选标题栏策略

“三栏从窗口顶层开始”不只由 CSS 决定：macOS 默认 frame 会先画系统标题栏，renderer 在它下面布局，即使根节点是 `100vh` 也是“系统标题栏 + 应用三栏”两层。

- `titleBarStyle: "hidden"` + `trafficLightPosition: { x: 16, y: 18 }`：保留红黄绿，隐藏独立标题栏，renderer 从顶部开始。本仓库采用。
- `hiddenInset`：往往仍留明显标题带，达不到 Codex 式完整顶层布局。
- `frame: false`：最干净，但也拿掉系统窗口按钮，除非自己实现关闭/最小化/全屏。

隐藏后拖窗口不再由系统标题栏负责，要用 `-webkit-app-region: drag` 补空白顶部，并把按钮/输入排除（`no-drag`）。macOS 要给红黄绿留安全区：侧栏展开时按钮落在侧栏内；折叠成 rail 后中间标题可能贴近窗口按钮，只在 rail 态给标题加偏移。

## 2. `-webkit-app-region` 先于 DOM 点击生效

drag 区域参与原生 hit testing，早于普通 DOM 点击派发。可交互元素与 drag 区域视觉重叠时，真实鼠标点击会被窗口管理器吃掉，而 React 测试、无障碍动作、DOM handler 全部看起来正常。曾经的事故：右侧面板 Tab 位于顶部 chrome 条里，视觉与 React 渲染都对，真实点击被拖拽路径拦截；Kairos 控件通过无障碍树能点，让人误判成状态/IPC 故障。

- testing-library 点击通过而真实 Electron 点不动 → 先查 `-webkit-app-region`。条里每个按钮、tab、输入、菜单触发器、resize 手柄都要显式 `no-drag`。
- `pointer-events` 管 Web 层叠，`-webkit-app-region: no-drag` 管 Electron 原生命中，是同一视觉重叠的两个层面。
- **浏览器 mock 无法复现**：Vite + 普通 Chromium 没有 app-region 概念，CDP `btn.click()` 也能触发回调，必须在 Electron 真机里手点验证。

## 3. 不要把大块容器整体设成 drag

`.sidebar { -webkit-app-region: drag }` + 所有子按钮 `no-drag` 看似合理，实测两坑：① `position: fixed` 的浮层按钮（如折叠按钮挂在布局顶层、视觉压在 sidebar 上）会被下层 drag 父容器吃掉点击——app-region 命中不严格走 z-index，表现为“按钮看着在最上面却点不动、被当成拖窗口”；② 补丁式 drag/no-drag 越补越漏。

更稳：**`pointer-events` 双层 + 单一 drag region**（参考 Cursor Agent Window 的 `.part.titlebar`）：

```css
.window-chrome-bar { position: fixed; top:0; left:0; right:0; height:44px; z-index:60; pointer-events:none; } /* 整层对下方透明 */
.chrome-left, .chrome-center, .chrome-right { pointer-events:auto; }  /* 子段内恢复事件 */
.chrome-center { -webkit-app-region: drag; }                          /* 唯一拖窗区 */
.chrome-button { -webkit-app-region: no-drag; }
```

好处：`pointer-events:none` 连 DOM hit-test 都跳过，比 `no-drag` 彻底；下方三栏的按钮不必再写 `no-drag`（`elementFromPoint` 可证）；drag 收敛为一处；chrome bar 无自身背景，三栏顶部加 `padding-top: var(--chrome-strip-height)`，视觉上“三栏贯顶 + chrome 按钮浮在顶部”。例外：浮层有半透明/blur 背景且要遮挡下方内容时不能整层 `none`，只能手管 app-region + hit-test。`titleBarStyle:"hidden"` 下红绿灯那条窄区由系统层负责拖动，能交给系统就别用 CSS。

## 4. Chrome 必须消费布局系统算出的面板宽度

视觉上的“三段”不等于真实三栏：

```txt
错: WindowChromeBar [controls auto][title flex:1 居中][actions auto]   SplitView [sidebar 260][main 790][panel 390]
对: WindowChromeBar [sidebar width][minmax(0,1fr)][right panel width]  与 SplitView 共享同一组宽度
```

Chrome 自己 flex 分配、内容区另用可调 SplitView，就有两套几何事实源：Sidebar resize/右栏开关/窗口缩放后标题与操作的归属漂移。做法：React 把已收敛的宽度写入 CSS 变量（`--window-chrome-left-column-width`、`--window-chrome-right-column-width`），Chrome 用 `grid-template-columns: var(left) minmax(0,1fr) var(right)`。信息归属由 pane 决定，不由“离窗口哪边近”决定。

- 面板隐藏后仍需边缘控制宽度：Sidebar 隐藏时布局宽度是 0，但 macOS 交通灯和重新展开入口还在，Chrome 左列不能变 0。布局宽度 ≠ 窗口控制宽度：面板可见→列宽跟随真实 pane；隐藏/紧凑→退回容纳交通灯与入口按钮的固定安全宽度；右栏关闭→保留仅容纳 PanelRight 按钮的边缘宽度。
- 覆盖层 z-index ≠ 可点击：紧凑布局里右侧面板变全宽覆盖层，中间 `pointer-events:auto; -webkit-app-region: drag` 的拖动区仍在更高层，会让下方 Tab 看得见点不到；单独抬高 Tab 的 z-index 可能无效（被限制在更低的父 stacking context）。覆盖态要显式转移所有权：`.window-chrome-bar[data-compact-panel-open="true"] .chrome-center { pointer-events:none; -webkit-app-region:no-drag }`，并隐藏不再属于当前可见工作区的标题与操作。

## 5. 工具栏、弹层与组件响应式（review workbench 提炼）

- 页面级内容从窗口顶部开始时，先消费统一的 chrome 安全高度；chrome 下方的交互工具栏显式 `no-drag`，且祖先没有屏蔽 pointer event。
- 组件响应式依据**容器宽度**，不是 viewport：390px 的右侧面板可能在 1440px 窗口里，`window.innerWidth` 很宽不代表有空间放三列或 split diff。固定在窄面板里的组件优先设计单列或明确的 dock/独占视图，不要靠 viewport breakpoint 隐藏列，也不要“临时隐藏别的区域”补偿错误宽度模型。
- 弹层位于 `overflow:auto/hidden` 祖先里，即使状态和 DOM 都在也会被裁成“点击没反应”：通用工具栏弹层 portal 到顶层，用触发器 `getBoundingClientRect()` 做 fixed 定位与 viewport collision。打开状态存在但不可见时先查 containing block 与 overflow。
- overlay、dock、独占视图语义不同：overlay 适合临时阻断式任务；dock 适合并行浏览；容器窄到并行内容不可读时切独占视图，别让 overlay 永久盖住主内容。

## 自检

1. 关 DevTools 后真实主窗口是否仍从顶部直接显示三栏？红黄绿还在且没压住品牌、标题、操作？
2. 顶部可拖拽区存在，同时按钮、输入框、滚动列表仍可点？是否在真实 Electron 里点过？
3. 调整 Sidebar/右栏宽度后顶部标题与操作的分界点是否同步移动？面板宽度为零时交通灯与展开入口是否有独立安全空间？
4. 紧凑覆盖层中的 Tab 会不会被更高层拖动区拦截？最小面板宽度下核心路径是否无需横向滚动？

来源：`docs/histories/2026-05/20260523-1310-top-level-three-column-window.md`、`.../20260528-0334-right-panel-tab-hit-test.md`、`docs/histories/2026-07/20260730-1832-review-workbench.md`、`.../20260730-1240-align-workbench-pane-chrome.md`。相关：[minWidth 不是响应式布局](electron-min-width-is-not-responsive-layout.md)。
