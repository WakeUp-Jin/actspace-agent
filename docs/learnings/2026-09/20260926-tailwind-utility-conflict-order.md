# 同一元素两个 Tailwind utility：谁生效不看书写顺序

来源：2026-09-26 设计 token 收口（`docs/histories/2026-09/20260926-1400-frontend-design-token-convergence.md`）。

## 是什么

一个元素的 `className` 同时出现两个设置同一属性的 utility，例如：

```tsx
const NAV_ITEM_CLASS = "… text-[13px] …";
<button className={`${NAV_ITEM_CLASS} text-[12px]`}>返回应用</button>
```

直觉是「后写的覆盖前写的」，所以应该是 12px。实际渲染是 **13px**。

原因：class 属性里的顺序对 CSS 没有意义。两条规则选择器特异性相同（都是单个 class），谁赢只取决于它们**在生成的样式表里谁排在后面**。Tailwind v4 按自己的规则给 utility 排序：先按变体和属性分组，同一属性内再按候选名排序。`text-[12px]` 排在 `text-[13px]` 前面，所以 13px 赢了。

## 为什么是个坑

1. **写的人以为自己在覆盖，其实没有。** 上面的「返回应用」按钮作者想要 12px，实际一直是 13px，看起来也不违和，没人发现。
2. **改名会让结果翻转。** 把 `text-[13px]` / `text-[12px]` 换成 `text-act-sm` / `text-act-xs`，排序变成 `text-act-sm` 在前、`text-act-xs` 在后，渲染突然变成 12px。一次「零视觉变化」的重命名，在 3 个地方改变了界面。
3. **跨常量拼接时肉眼看不到。** 冲突往往不在同一行：一个值在 `BASE_CLASS` 常量里，另一个在调用处追加，或者在 `cx(BASE, "text-act-xs")` 的另一个参数里。

同样的问题适用于所有「同属性两个 utility」：`rounded-act-sm` + `rounded-full`、`bg-surface` + `bg-surface-subtle`、`px-3` + `px-2.5`。

## 怎么避免

- **一个属性只给一个 utility。** 需要不同取值时，把基础常量拆成「不含该属性的 base」+ 各自的取值：

  ```tsx
  const NAV_SECTION_LABEL_BASE_CLASS = "inline-flex … leading-4 font-medium";
  const NAV_SECTION_LABEL_CLASS = `${NAV_SECTION_LABEL_BASE_CLASS} text-act-xs`;
  const WORKSPACE_LABEL_CLASS = `${NAV_SECTION_LABEL_BASE_CLASS} text-act-sm …`;
  ```

- **组件用 variant / size prop，不让调用方传样式覆盖。** `Button` 的 `className` 只接受布局和显隐类；要新外观就加 variant。
- **真的需要「后者覆盖前者」语义时，用 `tailwind-merge` 这类工具**，它会按属性去重，保留最后一个。本仓库目前没有引入，靠上面两条约束。
- **状态变体不冲突。** `bg-surface` 和 `aria-expanded:bg-selected` 可以共存：后者选择器多一个属性条件，特异性更高，不依赖排序。

## 怎么发现存量冲突

做大规模重命名前，先扫描「展开常量后同一元素出现两个同属性 utility」的地方。这次用的方法：解析文件里的 `const X = "…"`，把模板字符串中的 `${X}` 和 `cx(...)` 参数展开后，统计 `text-act-*` 是否出现两种以上取值。重命名后再用计算样式快照（逐元素比较 `getComputedStyle`）兜底，任何非零差异都要解释清楚。

## 自检

1. `className="px-3 px-2.5"` 实际内边距是多少？为什么不能只看书写顺序回答？
2. 为什么 `bg-surface aria-expanded:bg-selected` 不算冲突？
3. 如果必须让调用方覆盖基础组件的字号，你会怎么设计 API？
