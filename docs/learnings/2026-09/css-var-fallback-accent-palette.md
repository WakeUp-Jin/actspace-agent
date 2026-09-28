# 用 CSS 变量回落链做「可切换、默认零变化」的调色板

来源：`docs/histories/2026-09/20260928-2240-accent-palette.md`（外观强调色）。

## 问题

要在已有的明暗主题上叠加一层用户可选的强调色，同时满足：

1. 默认选项与改动前**像素级一致**；
2. 强调色与明暗主题**正交**（5 个调色板 × 3 种主题，不写 15 份 CSS）；
3. 组件只认语义 token，不知道调色板存在。

## 三层结构

```css
/* 1. 源值：调色板只声明「浅色一个值、深色一个值」，与当前主题无关 */
:root[data-accent="blue"] {
  --act-palette-light-accent: #2c67c5;
  --act-palette-dark-accent: #6aa3f8;
}

/* 2. 语义 token：每个主题块挑自己那一侧的源值，没定义就回落原 token */
:root {
  --act-color-link: var(--act-palette-light-accent, var(--act-color-info));
}
:root[data-theme="dark"] {
  --act-color-link: var(--act-palette-dark-accent, var(--act-color-info));
}

/* 3. 组件只消费语义 token */
.markdown-prose a { color: var(--act-color-link); }
```

默认调色板**什么都不定义**，于是 `var(--x, fallback)` 全部走 fallback，也就是原来的值，所以默认外观零变化不需要额外验证。新增调色板只要加一个源值块。

## 为什么把 light / dark 都放进调色板块

`data-accent` 和 `data-theme` 都写在同一个 `<html>` 上。如果调色板块直接写 `--act-color-link`，它和主题块的优先级谁高谁低就取决于选择器权重和书写顺序，「跟随系统」走的 `@media (prefers-color-scheme)` 还会再加一层。

把「选哪一侧」交给主题块、调色板只提供两侧原料，就不存在覆盖顺序问题：主题块永远是唯一写语义 token 的地方。

## 陷阱

- **`var()` 回落只在变量「未定义」时生效**。如果写成 `--act-palette-light-accent: initial;` 或空值，行为不同。默认调色板必须是真的不写。
- **派生值也要走回落**：hover、选区这类由强调色算出来的值（`color-mix(...)`）放在 `:root[data-accent]:not([data-accent="default"])` 里定义成另一个源值，语义 token 再回落。不要在 `:root` 里直接写 `color-mix(in srgb, var(--act-palette-light-accent) 25%, transparent)`，未定义时整条声明失效，不会回落。
- **对比度要按「同一个值兼作填充和文字」双向算**：白字在填充上 ≥ 4.5，且填充作文字在最浅那档背景（这里是 `surface-subtle`）上也 ≥ 4.5。只算一边很容易漏。
- **设置页色样不能用语义 token**，否则所有色样都会显示成当前选中的颜色。色样要用固定的 preview token。

## 自检

1. 如果某个调色板只想改浅色、深色沿用默认，应该怎么写？
2. 为什么 `--act-color-selection` 的非默认值不能直接写在 `:root` 里？
3. 新增一个「青色」调色板，需要改哪三处？脚本会在漏掉哪一处时报错？
