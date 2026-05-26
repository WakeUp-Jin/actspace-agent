# CSS Grid 隐式 track：sidebar 折叠后看起来"没生效"的真凶

关联 history：[docs/histories/2026-05/20260526-2315-sidebar-collapse-grid-fix.md](../../histories/2026-05/20260526-2315-sidebar-collapse-grid-fix.md)

## 一句话

`grid-template-columns` 只声明**显式** track；如果子项的 `grid-column` 请求了一个不存在的列，浏览器会**沉默地**补出一条隐式 track 来满足它，看起来你的 `grid-template` 切换没生效。

## 场景

actspace 的 SplitView 有「侧栏 / 主区 / 右栏」三个 pane，初始 CSS 这样写：

```css
.split-view { display: grid; /* grid-template-columns 由 React 动态设置 */ }
.split-view-left  { grid-column: 1; }
.split-view-main  { grid-column: 2; }
.split-view-right { grid-column: 3; }
```

React 根据状态切换 `grid-template-columns`：

```ts
if (leftHidden) {
  columns = rightOpen ? "minmax(0, 1fr) {rightWidth}px" : "minmax(0, 1fr)";
} else {
  columns = rightOpen
    ? "{leftWidth}px minmax(0, 1fr) {rightWidth}px"
    : "{leftWidth}px minmax(0, 1fr)";
}
```

折叠时 React 同时把 left pane 从 DOM 里移走，期望 main 自然占满。结果**main 居然不在最左**：

| 状态 | `grid-template-columns`（声明） | 浏览器算出的实际 columns | main 的 `left` |
|---|---|---|---|
| 展开 | `260px 1fr` | `260px 1967px` | 260 ✓ |
| 折叠（修复前） | `1fr` | `230.719px 1996.28px` ❌ | 231 ❌ |
| 折叠（修复后） | `1fr` | `2227px` ✓ | 0 ✓ |

明明声明只有一列，浏览器为什么算出两列？

## 原理：implicit grid tracks

CSS Grid 规则（[CSS Grid Layout Module Level 1 §7.4](https://www.w3.org/TR/css-grid-1/#implicit-grids)）：

> If a grid item is positioned into a row or column that is not explicitly declared by `grid-template-rows`/`grid-template-columns`, **implicit grid tracks** are created to hold it. These tracks are sized by `grid-auto-rows` and `grid-auto-columns`.

换句话说：

- `grid-template-columns` 只定义**显式** track。
- 子项的 `grid-column` 可以指向超出范围的索引。
- 浏览器为了"让你满意"会**自动补出**对应的隐式 track，宽度由 `grid-auto-columns` 决定（默认 `auto`，但若子项有 `flex` 子内容、`minmax`、内容本身 reflow 时也会撑开）。
- **不会报错、不会 warning**，DevTools 里 `grid-template-columns` 还是你写的那行。

回到 actspace 的场景：

```
显式 template:  | 1fr |
                  ↑
                main 请求 col 2
浏览器：好嘞，给你补一格隐式 col 1
实际 grid:      | implicit 230.7px | 1fr (1996.3px) |
                                     ↑
                                   main 落在这里
```

那条 230.7px 的隐式列里没有任何 DOM 节点，但它实打实占据了 230.7px 的空间——视觉上看起来"sidebar 还在"。

## 修复

有两种思路，actspace 选了更干净的那种。

**思路 A（状态修饰类，3 分修复）**：显式声明"当容器进入 left-hidden 态时，main/right 的 grid-column 跟着前移一格"。

```css
.split-view.is-left-hidden .split-view-main  { grid-column: 1; }
.split-view.is-left-hidden .split-view-right { grid-column: 2; }
```

可行但脆弱：以后只要再加一种布局态（比如 `is-right-hidden` 或 `is-fullscreen`），就得再加一组修饰规则。

**思路 B（让 grid auto-flow 接管，最终采用）**：直接删掉所有 pane 的硬钉 `grid-column`。

```css
/* 删掉这三行 */
.split-view-left  { grid-column: 1; }
.split-view-main  { grid-column: 2; }
.split-view-right { grid-column: 3; }
```

separators 是 `position: absolute`，不占 grid 列，所以 DOM 顺序就是 grid 顺序：

| DOM 状态 | grid 子项序列 | 自动落位 |
|---|---|---|
| 展开 + right open | [left, main, right] | col 1 / 2 / 3 |
| 展开 + right closed | [left, main] | col 1 / 2 |
| 折叠 + right open | [main, right] | col 1 / 2 |
| 折叠 + right closed | [main] | col 1 |

无需为每种组合写 CSS。

## 通用模式

> **响应式 grid：列数会变时，要么完全不写 `grid-column`、靠 auto-flow；要么用 `grid-template-areas` 配合命名区域；只在子项不能换位时才显式写索引。**

三种处理思路从干净到啰嗦排：

1. **不固定 `grid-column`** — 子项按 DOM 顺序自动落位（`grid-auto-flow: row` 默认行为）。本次最终采用。前提是 DOM 顺序就是视觉顺序。
2. **命名区域** — `grid-template-areas` 在切换布局时一并改区域名，子项 `grid-area` 用名字而非数字。适合需要在不同布局下重排（不只是隐藏/显示）的复杂场景。
3. **状态修饰类显式覆盖** — 给容器加 `is-xxx` class，在不同模式下重写子项 `grid-column`。只在子项绝对不能换位、且模式数 ≤ 2 时选它。

另一个有用技巧：**`grid-column: -1` 永远指向显式 track 的最后一列**，无论 grid 有几列。如果你有一个元素必须始终落在最右（比如"右栏"），它比 `grid-column: 3` 更稳健——sidebar 折叠后即使列数变了，它依然贴右。

## 通用模式

> **响应式 grid：列数会变时，子项的 `grid-column` 必须跟着变。**

具体三种处理思路：

1. **不固定 `grid-column`** — 让子项按 DOM 顺序自动落位（`grid-auto-flow: row` 默认行为），最简单。
2. **用 named lines / named areas** — `grid-template-areas` 在切换布局时一并改区域名，子项 `grid-area` 用名字而非索引。
3. **加状态修饰类显式覆盖** — 像本次修复，给容器加 `is-xxx` class，在不同模式下重写子项 `grid-column`。

如果你的子项 N 个、模式 M 种，思路 2 通常最干净；只有 2 种模式（如本次的 expanded/hidden）时思路 3 更直接。

## 怎么发现这种 bug

普通做法看不到，因为：

- React state 对。
- DOM 类名对。
- `grid-template-columns` 在 DevTools Computed 里跟你写的一样。
- 控制台也不会报错。

CDP / DevTools 里要看的是 **`getComputedStyle(el).gridTemplateColumns`** 加上 **每个 grid child 的实际 `getBoundingClientRect().left/width`**——如果声明 1 列但 child 不在 left=0，就八成是被隐式 track 顶走了。

## 自检

1. 一个 grid 容器 `grid-template-columns: 100px 1fr;`，里面的子项 `grid-column: 5;` 会发生什么？
2. 为什么 CSS 不直接报错 / 拒绝把子项放到不存在的列？
3. 如何用最少改动让 `.split-view-right` 在 `is-left-hidden` 之外的任何场景都不撞坑？

<details>
<summary>答案</summary>

1. 浏览器自动补出 col 3 / col 4 / col 5 三条隐式列（宽度由 `grid-auto-columns` 决定，默认 `auto`，没内容时为 0；如果子项内容会撑开，就被内容撑开）。最终容器会有 5 列。
2. 隐式 track 是 grid 设计里的"留白能力"，本意是支持 `grid-auto-flow` 的自动生成（比如自动布局未明确定位的项）。CSS 优先选择"容错"而不是"报错"，是为了让响应式布局更好写。
3. 把 `.split-view-right { grid-column: 3; }` 改成 `.split-view-right { grid-column: -1; }`——`-1` 表示"显式 track 的最后一列"，无论 grid 有 2 列还是 3 列，right 都会落在末尾，不需要状态修饰类。

</details>
