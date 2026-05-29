# Tailwind v4 三态主题：data-theme + 一组语义 token 整体翻转

> 提炼自 `docs/histories/2026-05/20260529-2340-appearance-dark-theme.md`（外观页深色主题专项）。

## 是什么

给一个已经用 Tailwind v4 的桌面/Web 应用加「浅色 / 深色 / 跟随系统」三态主题，且**不逐组件改样式**——只覆盖一组 CSS 变量就让全站翻转。关键三件套：

1. **单一事实源是 CSS 变量**：所有颜色走语义 token `--act-color-*`，Tailwind 的 `@theme inline` 把 `--color-surface` 之类映射到 `var(--act-color-surface)`。组件只写语义类（`bg-surface` / `text-text-main` / `border-line`）。
2. **主题切换靠 `<html data-theme>`**：`:root[data-theme="dark"]` 覆盖整组 `--act-color-*`；浅色值留在 `:root` 默认块。换主题 = 换一个属性值，浏览器重算变量，全站颜色一次性翻转。
3. **「跟随系统」让 CSS 自己跟，不写 JS**：
   ```css
   :root[data-theme="system"] {
     @media (prefers-color-scheme: dark) { /* 复用深色那组覆盖 */ }
   }
   ```
   不需要 `matchMedia` 监听器去手动重应用——OS 外观变化时 media query 自动重算。

## 为什么这么做

- **逐组件加 `dark:` 类 = 维护地狱**：每个颜色要写两遍、漏一个就花脸。把颜色集中到变量层，主题逻辑只活在 `tokens.css` 一个文件里，组件零感知。
- **system 态用 JS 监听容易出 bug**：监听器忘了解绑、初始态和监听态不一致、SSR/首帧闪烁。把 system 收敛成「CSS 在 `[data-theme="system"]` 作用域内自己读 media query」，状态机更简单、无副作用。

## Tailwind v4 的关键动作：自定义 `dark:` variant

少数组件确实需要「深色下额外补一笔」（如阴影、需要硬编码的成对色）。Tailwind v4 默认的 `dark:` 跟 `prefers-color-scheme`，但我们的事实源是 `data-theme`，两者会打架。用 `@custom-variant` 对齐：

```css
@custom-variant dark {
  &:where([data-theme="dark"], [data-theme="dark"] *) { @slot; }
  @media (prefers-color-scheme: dark) {
    &:where([data-theme="system"], [data-theme="system"] *) { @slot; }
  }
}
```

这样 `dark:shadow-[...]` 在「显式深色」和「system 且 OS 深色」两种情况下都生效，与变量层的翻转口径完全一致。

## 原生 chrome 要单独同步（Electron）

CSS 变量管不到 Electron 的交通灯、原生滚动条、右键菜单。这些靠主进程：

```ts
// renderer: applyAppearance 里
root.setAttribute("data-theme", mode);
window.actspace?.setNativeTheme?.(mode);
// main: ipcMain.on("appearance:set-theme") → nativeTheme.themeSource = mode;
```

`nativeTheme.themeSource` 接受 `"light" | "dark" | "system"`，语义恰好和我们三态一一对应，传同一个 mode 即可。

## 常见陷阱

- **数据可视化色不能一律映射成中性 token**。图表色板、看板阶段色、状态点这些是「信息编码」，翻译成 `border-line` 就丢了语义。做法：抽成 `--act-chart-series-*`（浅深各定一组），或保留**半透明字面量**（低 alpha 的色，叠加在任意深浅背景上都成立）。
- **有些元素是「反色/恒定暗色」的，主题无关**。比如悬浮 tooltip、深色 popover——它在浅色态本就是暗底白字，深色态也该保持。别把它的 `bg-[rgba(32,33,36,...)]` 收进语义 token，否则深色下它会变浅、对比丢失。
- **白色滑块/旋钮通常该恒定**。开关 thumb 的 `bg-white` 是 iOS 式控件惯例，两套主题都白，不要换成 `bg-surface`。
- **开机首帧要在渲染前重放主题**，否则先渲染浅色再切深色会闪一下（FOUC）。在 `main.tsx` 挂载 React 之前先 `applyAppearance(loadAppearance())`。

## 自检问题

1. 为什么「跟随系统」用 `[data-theme="system"]` 作用域里的 media query，而不是 JS 监听 `matchMedia`？
2. 默认的 Tailwind `dark:` 和我们的 `data-theme` 体系为什么会冲突，`@custom-variant` 怎么把两者对齐？
3. 哪三类颜色**不该**被收口成中性语义 token，各自的理由是什么？
