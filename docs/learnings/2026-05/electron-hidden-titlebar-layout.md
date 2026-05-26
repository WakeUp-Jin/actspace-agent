# Electron hidden titlebar layout

这次来自 `20260523-1310-top-level-three-column-window.md`：用户想要 Codex 那种“窗口从顶部直接进入三栏”的桌面布局，而不是系统标题栏下面再嵌工作台。

## 核心概念

Electron 桌面应用里，“三栏布局是否从窗口顶层开始”不只由 CSS 决定。macOS 默认窗口 frame 会先画出系统标题栏，renderer 再在标题栏下面开始布局。即使 React 根节点是 `height: 100vh`，用户看到的仍然是“系统标题栏 + 应用三栏”的两层结构。

要让 renderer 成为窗口 chrome 的一部分，需要配置窗口标题栏策略，再用 CSS 的 `-webkit-app-region` 补回可拖拽区域。

## 实用取舍

常见选择有三类：

```ts
new BrowserWindow({
  titleBarStyle: "hidden",
  trafficLightPosition: { x: 16, y: 18 }
});
```

`titleBarStyle: "hidden"` 适合保留 macOS 红黄绿按钮，同时隐藏独立系统标题栏。renderer 可以从窗口顶部开始，窗口按钮仍由系统管理。

```ts
new BrowserWindow({
  titleBarStyle: "hiddenInset"
});
```

`hiddenInset` 往往仍会留下更明显的系统标题带，视觉上可能还是像“上面一栏 + 下面应用”。如果目标是 Codex 风格的完整顶层布局，它通常不够干净。

```ts
new BrowserWindow({
  frame: false
});
```

`frame: false` 最干净，但会把系统窗口按钮也拿掉。除非自己实现关闭、最小化、全屏，否则 macOS 用户会觉得窗口行为不完整。

## CSS 配套

隐藏标题栏后，拖拽窗口不再由系统标题栏负责。需要让空白顶部区域可拖拽，同时把按钮和输入控件排除出去：

```css
.topbar,
.sidebar,
.right-tabs {
  -webkit-app-region: drag;
}

button,
textarea,
.session-nav {
  -webkit-app-region: no-drag;
}
```

在 macOS 上还要给红黄绿按钮留安全区。左侧栏展开时，按钮通常落在左侧栏内部；左侧栏折叠为 rail 后，中间标题可能靠近窗口按钮，此时可以只在 rail 态给标题加偏移。

## 陷阱：不要把大块容器整体设成 drag region

最初为了让"在 sidebar 顶部空白处也能拖动窗口"，会很自然写出 `.sidebar { -webkit-app-region: drag }`，再在所有子按钮上 `no-drag` 覆盖。看起来合理，实测在 Electron / macOS 上有两个稳定的坑：

1. **`position: fixed` 的"浮层按钮"被 drag 父容器吃掉点击。**
   sidebar 折叠按钮如果用 `position: fixed` 浮在 sidebar 视觉上方（z-index 高于 sidebar），DOM 上却挂在 sidebar 外面（比如挂在 WorkbenchLayout 顶层），Electron 的 `-webkit-app-region` hit-test **不严格走 z-index**——它倾向于把"鼠标当前命中点 + 视觉所在区域属于哪个 drag region"作为优先信号，于是 fixed 浮层按钮虽然 no-drag，仍可能被下层 drag 父容器抢走点击。表现就是"按钮看上去在最上面，但点不动、点击被识别成拖窗口"。

2. **mock 浏览器里这个 bug 不会复现。** Vite + 普通 Chromium 没有 `-webkit-app-region` 概念，CDP 用 `btn.click()` 也能正常触发回调，所以前端单测、CDP 验证都看不出问题。**必须在 Electron 真机里手动点。**

实践建议：

- **不要把 sidebar 整体当 drag region。** 改让 `.topbar`（main pane 顶部）做唯一拖动条；或者在 sidebar 顶部 padding 区单独放一个 `<div className="drag-strip">`，并且让这个 strip 的视觉范围严格避开所有 fixed 浮层按钮的位置。
- **能在系统层处理就别用 CSS。** `titleBarStyle: "hidden"` 下，红绿灯所在的顶部一条窄区由 Electron 系统层负责拖动，不需要手动加 drag region。
- **任何"fixed 浮层 + 下层 drag 父级"组合都先警惕一下。** 如果非要用，确保浮层按钮的视觉范围跟下层 drag 区域**完全不重叠**，或者把下层从 drag 改成只在它自己不会被遮挡的子区域里 drag。

## 自检问题

- 关闭 DevTools 后，真实主窗口是否仍然从顶部直接显示应用三栏？
- 红黄绿按钮是否还在，并且没有压住品牌、标题或操作按钮？
- 顶部可拖拽区域是否存在，同时按钮、输入框、滚动列表仍可点击？
