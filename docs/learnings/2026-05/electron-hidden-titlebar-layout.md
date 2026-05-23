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

## 自检问题

- 关闭 DevTools 后，真实主窗口是否仍然从顶部直接显示应用三栏？
- 红黄绿按钮是否还在，并且没有压住品牌、标题或操作按钮？
- 顶部可拖拽区域是否存在，同时按钮、输入框、滚动列表仍可点击？
