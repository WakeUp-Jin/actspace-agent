# 无边框桌面窗口的 Chrome 必须跟随面板几何

关联 history：`docs/histories/2026-07/20260730-1240-align-workbench-pane-chrome.md`

## 是什么

Electron 无边框窗口经常使用一条覆盖在内容上方的固定 Chrome，集中承载交通灯安全区、窗口拖动区和面板开关。界面看起来有左、中、右三段，并不代表它真的理解下方三栏。

如果 Chrome 自己使用独立的 flex 分配宽度，而内容区使用另一套可调整的 SplitView，二者就拥有两套几何事实源：标题可能相对整窗居中，操作会跨面板漂移，浮层命中区也可能压住下方 Tab。

稳定的做法是让 Chrome 直接消费布局系统已经计算出的面板宽度。

## 错误模型：视觉三段不等于真实三栏

```txt
WindowChromeBar: [controls auto] [title flex: 1, centered] [actions auto]
SplitView:       [sidebar 260]  [main 790]               [panel 390]
```

两行看似都是三段，但分界点完全不同。只要 Sidebar resize、右栏开关或窗口缩放，标题与操作的视觉归属就会漂移。

## 正确模型：共享几何事实源

```txt
SplitView widths ─────┬──────────────┬───────────────┐
                      ▼              ▼               ▼
WindowChromeBar: [sidebar width] [minmax(0, 1fr)] [right panel width]
SplitView:        [sidebar width] [main]            [right panel width]
```

React 层把已经收敛过的宽度写入 CSS 变量：

```tsx
const style = {
  "--window-chrome-left-column-width": `${leftPaneWidth}px`,
  "--window-chrome-right-column-width": `${rightPaneWidth}px`,
} as CSSProperties;
```

Chrome 再使用同一组三列：

```css
.window-chrome-bar {
  display: grid;
  grid-template-columns:
    var(--window-chrome-left-column-width)
    minmax(0, 1fr)
    var(--window-chrome-right-column-width);
}
```

这样标题是否左对齐、操作属于哪一栏，就不再依赖视觉猜测。

## 覆盖层的 z-index 不等于可点击

固定 Chrome 往往同时承担窗口拖动：

```css
.chrome-center {
  pointer-events: auto;
  -webkit-app-region: drag;
}
```

紧凑布局里，如果右侧面板改成全宽覆盖层，中间拖动区仍在更高层，就可能让下方 Tab “看得见但点不到”。单纯提高 Tab 自身 z-index 未必有效，因为它可能被限制在更低的父级 stacking context 中。

覆盖态应该显式转移交互所有权：

```css
.window-chrome-bar[data-compact-panel-open="true"] .chrome-center {
  pointer-events: none;
  -webkit-app-region: no-drag;
}
```

同时隐藏不再属于当前可见工作区的标题和操作，避免视觉重叠。

## 面板隐藏后仍需要边缘控制宽度

Sidebar 隐藏时，它的布局宽度是 `0`，但 macOS 交通灯和重新展开入口仍然存在。如果 Chrome 左列也直接变成 `0`，标题和点击区域就会压进系统窗口控件。

因此布局宽度和窗口控制宽度是两个不同概念：

- 面板可见：Chrome 列宽跟随真实 pane。
- 面板隐藏或紧凑布局：Chrome 列宽退回可容纳交通灯与入口按钮的固定安全宽度。
- 右栏关闭：保留一个只容纳 PanelRight 按钮的边缘宽度。

## 核心要点

- 标题栏、面板和分隔条应共享同一个几何事实源。
- 信息归属应该由 pane 决定，不由“离窗口哪一边更近”决定。
- `z-index`、`pointer-events` 和 `-webkit-app-region` 必须作为一组检查。
- 覆盖层打开时要显式转移顶部交互所有权，不能只覆盖视觉内容。
- 面板隐藏宽度与系统窗口控制安全宽度不能混为一谈。

## 自检问题

1. 调整 Sidebar 或右栏宽度后，顶部标题和操作的分界点是否同步移动？
2. 紧凑覆盖层中的 Tab 是否可能被更高层的窗口拖动区拦截？
3. 面板宽度为零时，交通灯和重新展开入口是否仍有独立安全空间？
