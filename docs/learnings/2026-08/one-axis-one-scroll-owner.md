# 滚动所有权：视口边界、单轴与一轴一个滚动容器

合并自四篇：设置页滚动边界、sticky 与滚动容器、侧边栏滚动容器要明确单轴、一条轴线只保留一个滚动所有者。主线：**先定义谁拥有哪条轴的滚动，再让其余元素不去扩大或另开滚动**。

## 1. 外壳先拥有视口高度，滚动只给一个内部容器

- 绕过常规 split-view 外壳的页面（如设置页）必须自己定义视口高度边界。外层只写 `height: 100%`、祖先却只是 `min-height`，内容会撑开整个 document，右栏 `overflow-y-auto` 不成为真正滚动容器，左侧导航会随 body 滚动。`h-full` 只有在每层祖先都有确定高度时才可靠。
- 模式：先锁外壳，再把滚动交给详情栏：
  ```tsx
  <div className="flex h-screen min-h-0 flex-col overflow-hidden">
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <nav className="h-full shrink-0">...</nav>
      <main className="min-h-0 flex-1 overflow-y-auto">...</main>
    </div>
  </div>
  ```
  `h-screen overflow-hidden` 给固定视口边界；`min-h-0` 让 flex 子项可收缩而不是撑大祖先；行级 `overflow-hidden` 防止意外的行滚动；`overflow-y-auto` 只给右栏。
- `position: sticky` 粘在**最近的滚动祖先**里。应用壳（固定）+ 固定输入框 + 中间可滚 transcript 的结构里，sticky 的 turn prompt 应属于 transcript 滚动区而不是 body。外壳用 `min-height: 100vh` 会让内容撑开文档，body 滚动、目标面板没有内部滚动范围，sticky 就“粘在了错误的滚动上下文”。做法：外壳 `height:100vh; overflow:hidden`，内容区 `grid-template-rows: auto minmax(0,1fr) auto; min-height:0`，滚动区 `min-height:0; overflow:auto`，sticky 头 `top:0`。
- 验证：目标面板 `scrollHeight > clientHeight`；`document.documentElement.scrollHeight` 接近视口高度；下一个 sticky 项能在面板顶部把上一个顶走。

## 2. 窄侧边栏列表只能纵向滚：别用 `overflow-auto`

- `overflow-auto` 是双轴开关，不是“需要时纵向滚动”。子元素最小内容宽度超过容器就会生成横向滚动。事故：会话列表容器 `overflow-auto`，内部有 `whitespace-nowrap` 的时间列和长空状态文案，侧栏变窄后 `scrollWidth > clientWidth` 出现横向滚动条。
- 易踩点：`opacity-0` 的透明按钮仍占布局宽度；`nowrap` 文本需配可收缩容器和截断；触控板可能悄悄改 `scrollLeft` 让内容左侧被切掉，像文本自己跑偏。
- 模式：`Sidebar nav { overflow-x:hidden; overflow-y:auto; min-width:0 }`，行/列表 `min-width:0; width:100%`，长文本 `truncate`/换行/移出固定宽 utility 列。缩到最小宽度时 `scrollWidth` 应仍等于 `clientWidth`。

## 3. 一条轴只保留一个滚动所有者（跨行比较的界面）

- 表格、diff 审阅器、时间线需要跨行比较，同方向位移应由共同祖先统一管理。给每行都设 `overflow-x:auto` 会让每行成为独立坐标系：某行滚到右侧，上下行仍在左侧，列对齐和上下文比较失效。隐藏滚动条只隐藏反馈，独立 `scrollLeft` 仍在，触控板/Shift+滚轮仍可能只移动鼠标下那一行。
- 正确所有权：外层 Canvas 拥有横纵滚动位置；子行只负责内容、背景、语义，不声明同轴 `overflow`；`<main className="overflow-auto"><div style={{width: sharedContentWidth}}>…rows…</div></main>`；Word Wrap 开启时共享宽度回到 `100%`，由代码列折行。
- 虚拟列表额外陷阱：只挂载视口附近行时，若 Canvas 宽度依赖已挂载 DOM，滚到更长代码行时 `scrollWidth` 突增、离开后缩短，滚动条跳变，`scrollLeft` 被浏览器修正。解决：用虚拟化之前的结构化行模型估算全局内容宽度，所有虚拟行共享。等宽代码用字符列数近似，并且：展开 tab 到固定 tab stop；为行号、增删标记、右侧留白预留列数；split diff 取两侧较长的一边再乘 2；异常超长行设稳定宽度上限，避免不可控的超大布局面。

## 自检

1. 外层页面壳有确定的视口高度吗？左导航在可滚动面板之外吗？
2. 同一方向是否存在祖先和子项两层 `overflow-auto`？横向移动一行时需要比较的行是否同步？
3. 这个容器真的需要横向滚动吗？子元素里有 `nowrap`、固定宽按钮、透明但占位的 action 吗？
4. 虚拟项挂载变化时滚动范围稳定吗？开启折行后共享宽度真的回到容器宽度吗？

来源：`docs/histories/2026-05/20260531-0109-settings-scroll-pane.md`、`docs/histories/2026-05/20260522-1547-sticky-message-turns.md`、`docs/histories/2026-06/20260604-2042-sidebar-horizontal-overflow.md`。相关：[长会话导航滚动事实源](../2026-07/scroll-navigation-needs-one-scroll-source-of-truth.md)。
