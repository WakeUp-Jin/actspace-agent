# 主题与配色规范

## 定位

这份文档定义 `actspace` 桌面端的**主题机制**与**颜色落地的硬约束**。它是所有前端样式工作的前置规则：**任何写颜色的地方，先读这里**。

核心结论一句话：**颜色必须随主题翻转。组件里只允许使用语义 token / 语义 Tailwind 类，不允许写「不随主题变化的颜色字面量」承载主题相关的文字、背景、边框。**

`actspace` 支持 **浅色 / 深色 / 跟随系统** 三态主题。任何新写的、或被改动的样式，都必须在两套主题下都成立——这不是「深色专项」一次性的事，而是从此以后的默认要求。

## 主题机制（先理解，再写样式）

1. **单一事实源是 CSS 变量**：所有颜色集中定义为语义 token `--act-color-*`（见 `styles/tokens.css`）。`styles/tailwind.css` 的 `@theme inline` 把 Tailwind 的 `--color-surface` 等映射到 `var(--act-color-surface)`。
2. **组件只消费语义类**：`bg-surface` / `text-text-main` / `border-line` / `bg-brand-soft` / `text-on-danger` …。这些类的颜色由变量层决定。
3. **主题切换 = 换 `<html data-theme>`**：
   - `data-theme="light"` → 用 `:root` 默认浅色值。
   - `data-theme="dark"` → `:root[data-theme="dark"]` 覆盖整组 `--act-color-*`。
   - `data-theme="system"` → `:root[data-theme="system"]` 下用 `@media (prefers-color-scheme: dark)` 自动跟随 OS，**无需 JS 监听**。
4. **少数「深色补一笔」用自定义 `dark:` variant**：`tailwind.css` 里 `@custom-variant dark` 已对齐 `data-theme="dark"` 与 system 下的 `prefers-color-scheme`。需要深色额外样式时写 `dark:shadow-[...]`，口径和变量层一致。
5. **Electron 原生 chrome 单独同步**：`applyAppearance` 在写 `data-theme` 的同时调 `window.actspace.setNativeTheme(mode)` → 主进程 `nativeTheme.themeSource`，让交通灯 / 系统滚动条 / 右键菜单跟随主题。CSS 管不到这些。

> 收口的本质：只要组件用语义类，深色覆盖一组 `--act-color-*` 就整体翻转。**问题 100% 出在硬编码的颜色字面量上。**

## 硬约束：禁止非主题感知的颜色字面量

下列写法用于承载「主题相关的文字 / 背景 / 边框」时**一律禁止**，因为它们在主题切换时不会翻转，必然在某一套主题下出错（最典型：深色背景上的 `text-black` 黑字看不见）：

```tsx
// ❌ 禁止：这些颜色不随主题变化
text-black        text-white(用于正文/标题/数字时)
bg-white          bg-black
text-[#12151c]    text-[#ffffff]
bg-[#ffffff]      bg-[#fafbfe]
border-[#e6e8ef]
text-[rgba(32,33,36,0.72)]
hover:bg-black/[0.04]   // 深色态下几乎不可见
```

对应的正确写法（语义类，随主题翻转）：

| 用途 | ❌ 字面量 | ✅ 语义类 / token |
| --- | --- | --- |
| 主文字 / 标题 / 大数字 | `text-black` `text-[#12151c]` | `text-text-main` |
| 次级 / 弱化文字 | `text-[#6c7281]` | `text-text-muted` / `text-text-faint` / `text-text-subtle` |
| 卡片 / 面板背景 | `bg-white` | `bg-surface` |
| 浮层 / 模态 / popover 背景 | `bg-white` | `bg-surface-raised` |
| 页面 / 次级背景 | `bg-[#f7f9fc]` | `bg-app-bg` / `bg-surface-subtle` |
| 边框 | `border-[#e6e8ef]` | `border-line` / `border-line-strong` |
| hover 叠加 | `hover:bg-black/[0.04]` | `hover:bg-[var(--act-color-hover-overlay)]` |
| 状态底色 | `bg-[#fdeaea]` | `bg-danger-soft` / `bg-success-soft` / `bg-warm-soft` |
| 状态前景 | `text-[#d04444]` | `text-on-danger` / `text-on-success` / `text-on-warm` |

需要新颜色时，**先扩展 `tokens.css` 的语义 token（浅 + 深两套）并在 `tailwind.css` 映射**，再在组件里用语义类——不要在组件里随手写新 hex。

## 合法例外（必须刻意判断，不是默认）

以下情况允许保留颜色字面量，但**每一处都要明确「它在两套主题下都成立」**：

1. **品牌底 + 白字**：`bg-brand text-white` / `bg-brand-soft`。品牌蓝在深色态也保持饱和蓝，白字对比足够。✅
2. **恒定反色元素**：深色 tooltip（如 `ToolLogLine` 的悬浮提示）。它在浅色态本就是暗底白字，深色态也保持——**不要把它收进语义 token**，否则深色下会变浅、对比丢失。✅
   - 注意：`ContextPopup`（上下文用量弹层）**不属于**本例外。它是主题感知的浮层，浅色主题用浅色弹层、深色主题用深色弹层，外壳走 `bg-surface-raised` / `text-text-*` / `border-line` 等语义 token；其中 bucket 配色属于「数据可视化色」，见下节用 `--act-context-*`（浅/深各一套）。
3. **白色控件旋钮**：开关 thumb 的 `bg-white` 是 iOS 式惯例，两套主题都白。✅
4. **半透明叠加色**：低 alpha 的 `rgba()`（如阶段色 tint `bg-[rgba(47,111,255,0.05)]`、`bg-black/35` 模态遮罩）。半透明色叠加在任意深浅背景上都成立。✅
5. **装饰性阴影 / 光晕**：`shadow-[0_8px_18px_rgba(47,111,255,0.18)]` 这类品牌/危险态光晕。必要时补 `dark:shadow-[...]` 减弱。✅
6. **数据可视化色**：见下节。

判断口诀：**这处颜色，在「白底」和「黑底」上都看得清、不出戏吗？** 不确定就用语义 token。

## 数据可视化色

图表色板、看板阶段色、状态点、热力图——这些是「信息编码」，**不能一律映射成中性 token**（翻成 `border-line` 就丢了语义）。做法：

- 抽成 `--act-chart-series-1..6`（`tokens.css` 浅深各定一组），组件从 CSS 变量读色：`from-brand via-[var(--act-chart-series-2)] to-[var(--act-chart-series-3)]`。
- 对比敏感的（如热力图格子）补显式 `dark:` 变体：`bg-[#cfe0ff] dark:bg-[#27406e]`。
- 状态语义色用 `bg-danger` / `bg-success` / `bg-warm` + soft/on 变体，已随主题定义。
- `ContextPopup` 的 bucket 配色用 `--act-context-system/tools/rules/skills/mcp/subagents/conversation/fallback`（`tokens.css` 浅深各一组），由 `@actspace/shared` 的 `CONTEXT_BUCKET_REGISTRY.colorVar` 引用；新增 bucket = 注册表加一行 + 这里加一对 token，组件不动。

## 新增 / 修改样式自检清单

写完任何带颜色的样式，过一遍：

1. 这处颜色用的是语义类（`text-text-main` / `bg-surface` / `border-line` …）还是字面量？
2. 如果是字面量，它属于上面 6 类「合法例外」中的哪一类？说不出来 → 改成语义 token。
3. 新加的颜色在 `tokens.css` 里有浅 + 深两套定义吗？
4. 提交前自查遗漏（黑/白/hex/rgba 字面量）：

```sh
rg -n "text-black|bg-black|bg-white|text-\[#|bg-\[#|border-\[#|rgba\(" packages/desktop/src/renderer/<改动文件>
```

逐条确认命中项都是「合法例外」，否则收口成语义 token。

## 验收要求

- **新写或改动的页面 / 组件，必须在浅色与深色两套主题下都验过**（浏览器 mock 切 `data-theme`，或 Electron 切主题）。「只在浅色下看着对」不算通过。
- 重点抽查：大数字 / 标题（最常漏 `text-black`）、卡片背景、边框、hover 态、状态徽标。
- 浅色态相对改动前应**零视觉回归**（token 收口是等价替换，浅色值不变）。

## 关联

- 机制与色板基线：`全局视觉语言规范.md`（色彩原则 / 基础色板）。
- 样式作用域（全局 CSS vs 组件 utility）：`docs/coding-standards/team/frontend-style-scope-conventions.md`。
- 三态主题落地记录：`docs/histories/2026-05/20260529-2340-appearance-dark-theme.md`。
- 可迁移模式提炼：`docs/learnings/2026-05/tailwind-v4-three-state-theme.md`。
