## [2026-05-27 00:30] | Task: chrome 浮层对齐红绿灯 + right panel tabs 跟 chrome 同水平线

### 📥 User Query

> 右边视图差一点，cursor 里 tab 应该是和右视图折叠按钮对齐的吧（在同一水平线）。还有一个 bug，左边的折叠按钮和搜索按钮没有和三个点（红绿灯）对齐，看起来有点不和谐。

承接 `20260527-0015-window-chrome-strip-refactor.md` 的窗口 chrome 浮层重构。重构后用户实际观察到两个细节没对：

1. **Right panel 的 tabs（`README.md` / `Session diff`）落在 chrome bar 下方**。重构时给 `.right-panel` 加了 `padding-top: var(--window-chrome-strip-height)` 让 tabs 让出 chrome 浮层，结果 tabs 跟 chrome-right 段的 PanelRight 按钮**不在同一水平线**。Cursor Agent Window 的 auxiliarybar 是让 tab 行就占在 chrome bar 高度内，跟右上角的按钮平齐。
2. **左 chrome 按钮（PanelLeft、Search）跟红绿灯垂直不对齐**。chrome bar height = 44, `align-items: center` → 按钮中心 Y = 22；但 `trafficLightPosition: { x: 16, y: 18 }` 让红绿灯中心 Y = `18 + 12/2 = 24`。差 2px，视觉偏上。

### 🛠 Changes Overview

**Scope:** `@actspace/desktop`（main + CSS 各一点）。

**Fix 1：right panel tabs 跟 chrome 同水平线**

[packages/desktop/src/renderer/styles.css](packages/desktop/src/renderer/styles.css):

```css
.right-panel {
  /* 不再 padding-top: var(--window-chrome-strip-height)
   * 让 tabs 占满 chrome bar 高度，跟右上角 PanelRight 按钮平齐 */
}

.right-tabs {
  min-height: var(--window-chrome-strip-height); /* 自己长到 44px */
  padding: 0 calc(var(--window-chrome-control-size) + 24px) 0 10px;
  /* 右侧 padding 给 chrome-right 段的 PanelRight 按钮（22px）+ 视觉间距 */
}
```

**Fix 2：红绿灯中心对齐 chrome 按钮中心**

[packages/desktop/src/main/index.ts](packages/desktop/src/main/index.ts):

```ts
trafficLightPosition: {
  x: 16,
  y: 16  // 之前 18 → 红绿灯中心 22，对齐 chrome bar align-items:center 的按钮中心 22
}
```

### 🔍 验证

- typecheck 通过；vitest 33/33 不受影响（只有 CSS + main 改）。
- mock 浏览器 CDP：right tabs 的第一个按钮中心 Y 跟 chrome-right 段的 PanelRight 按钮中心 Y 偏差 `-0.5px`（基本完美对齐）。
- Electron 真机：**main 进程改动需要重启 Electron 才能生效**（tsc --watch 会重编 dist-electron，但运行中的 BrowserWindow 实例不会重读 trafficLightPosition）。用户需要 Cmd+Q 退出 Electron 再 `pnpm dev:log` 重新启动。

### 🔗 Related

- 主重构：[docs/histories/2026-05/20260527-0015-window-chrome-strip-refactor.md](docs/histories/2026-05/20260527-0015-window-chrome-strip-refactor.md)
