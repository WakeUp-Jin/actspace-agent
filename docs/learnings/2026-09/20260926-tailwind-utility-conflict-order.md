# Tailwind 同属性冲突：谁生效不看 className 的书写顺序

合并自三篇（2026-07、2026-09、2026-10 各踩过一次，症状不同、根因相同）。

## 三次踩坑

1. **白底白字**（2026-07，Kairos 通知中心，同一天踩三次：分页激活按钮、紧凑视图「开启」按钮、KairosPage「开启」按钮；`docs/histories/2026-07/20260704-1110-kairos-notification-center.md`）：`cn(base, isActive && "bg-brand text-white")`，base 里有 `bg-surface text-text-muted`。四个类同时挂上，`bg-surface` 排在 `bg-brand` 后、`text-white` 排在 `text-text-muted` 后，结果 surface 白底 + white 白字——两组冲突各赢一半，恰好“不可见”。难查在于不是全覆盖或全不覆盖，而是逐属性分胜负。非激活态只挂基础类，所以只有激活态才暴露。
2. **字号翻转**（2026-09-26，设计 token 收口，`docs/histories/2026-09/20260926-1400-frontend-design-token-convergence.md`）：`` `${NAV_ITEM_CLASS} text-[12px]` ``，常量里已有 `text-[13px]`。作者以为后写的 12px 生效，实际一直是 13px，且看着不违和，没人发现。把 `text-[13px]/text-[12px]` 改名成 `text-act-sm/text-act-xs` 后，排序变成 sm 在前、xs 在后，渲染突然变 12px——一次“零视觉变化”的重命名在 3 个地方改变了界面。冲突常常跨常量：一个值在 `BASE_CLASS`，另一个在调用处追加或 `cx(BASE, "text-act-xs")` 的另一个参数，肉眼看不到。
3. **选中背景不显示**（2026-10，多智能体协作前端演示 T4，[history](../../histories/2026-10/20261007-1423-multi-agent-collab-frontend-demo.md)）：左栏行按钮基础样式含 `bg-transparent`，选中再拼 `bg-sidebar-selected`。构建产物里几个背景类的位置是 `.bg-selected 78086 / .bg-sidebar-selected 78196 / .bg-surface 78583 / .bg-transparent 79778`，`bg-transparent` 在最后所以永远赢。换个颜色名结果可能反过来，所以时有时无。

## 根因

`class` 属性里的顺序对 CSS 没有意义。两条规则特异性相同（都是单个 class）时，谁赢只取决于**它们在生成样式表里谁排后面**；Tailwind v4 按自己的规则排序（先按变体和属性分组，同属性内再按候选名排），这是构建产物的实现细节，不受你控制也不稳定。换 Tailwind 版本、加新页面都可能让旧按钮突然翻车。适用于所有同属性两个 utility：`rounded-act-sm`+`rounded-full`、`bg-surface`+`bg-surface-subtle`、`px-3`+`px-2.5`（`p-4 p-2` 与 `p-2 p-4` 效果一样）。

## 怎么避免（按优先级）

1. **一个属性只给一个 utility。** 状态类写成独立完整类，用三元切换：`isActive ? pageButtonActiveClass : pageButtonClass`；或 `active ? "bg-sidebar-selected" : "bg-transparent"`（元素上永远只有一个背景类）。代价是完整类里有少量重复布局声明。
2. **常量拆成“不含该属性的 base” + 各自取值**：
   ```tsx
   const NAV_SECTION_LABEL_BASE_CLASS = "inline-flex … leading-4 font-medium";
   const NAV_SECTION_LABEL_CLASS = `${NAV_SECTION_LABEL_BASE_CLASS} text-act-xs`;
   const WORKSPACE_LABEL_CLASS  = `${NAV_SECTION_LABEL_BASE_CLASS} text-act-sm …`;
   ```
   叠加的类只加新属性（`font-medium`、`shadow-*`）或用 CSS 变量间接控制。
3. **状态挂到状态属性的变体上**：`aria-[current=page]:bg-sidebar-selected aria-[current=page]:text-text-main`，同时写 `aria-current={active ? "page" : undefined}`。生成的选择器是 `.class[aria-current=page]`，比单 class 多一个属性选择器，特异性更高，不受排序影响，读屏软件也能读到状态。`hover:`、`aria-expanded:` 同理，不算冲突。
4. **组件用 variant / size prop，不让调用方传样式覆盖**：`Button` 的 `className` 只接受布局和显隐类；要新外观就加 variant。
5. **真需要“后者覆盖前者”再用 `tailwind-merge`**。注意：用了 `cn`/`clsx` 不等于用了 `twMerge`；本仓库手写的 `cn` 只是 `filter(Boolean).join(" ")`，没有 merge 能力，`tailwind-merge` 目前未引入（代价还有额外依赖和每次渲染合并）。shadcn/ui 的 `cn` 才是 `clsx + twMerge`。

## 排查与存量扫描

- DevTools computed style 最快：两个类都命中、其中一个被划掉，被划掉的是谁与书写顺序无关。
- 大规模重命名前先扫描“展开常量后同一元素出现两个同属性 utility”：解析 `const X = "…"`，展开模板字符串里的 `${X}` 与 `cx(...)` 参数，统计 `text-act-*` 是否出现两种以上取值；重命名后用 `getComputedStyle` 逐元素快照比对兜底，任何非零差异都要解释清楚。

## 自检

1. `cn("bg-red-500", "bg-blue-500")` 在你项目里产出什么？项目的 `cn` 有 merge 能力吗？
2. 为什么 `aria-[current=page]:bg-x` 能压住 `bg-transparent`，`hover:bg-x` 悬停时也能？
3. 必须让调用方覆盖基础组件字号时，API 该怎么设计？
4. 仓库里“扩展”主操作按钮也有同样问题，最小修改是什么？

相关：全局 CSS reset 覆盖 utility 是另一类问题（层叠 layer），见 [2026-05/global-css-reset-vs-tailwind.md](../2026-05/global-css-reset-vs-tailwind.md)。
