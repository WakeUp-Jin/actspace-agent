# Tailwind 类叠加覆盖是伪命题：同属性类的胜负由 CSS 生成顺序决定

- 来源：`docs/histories/2026-07/20260704-1110-kairos-notification-center.md`
  （同一天踩了三次：分页激活按钮、紧凑视图「开启」按钮、KairosPage「开启」按钮）
- 症状：按钮"消失"——白底白字，元素在但看不见

## 是什么

`cn(baseClass, isActive && "bg-brand text-white")` 这种"基础类 + 状态类叠加"的写法，
直觉上后写的类会覆盖前面的。**这个直觉是错的**：class 属性里的顺序对 CSS 优先级毫无影响，
两个同属性、同优先级的类（如 `bg-surface` 和 `bg-brand`）谁生效，取决于它们在
Tailwind 生成的样式表里谁排在后面——这是构建产物的实现细节，不受你控制也不稳定。

## 为什么会白底白字

```
base   = "... bg-surface text-text-muted ..."
active = "bg-brand text-white"
```

元素同时挂上四个类。样式表里如果 `bg-surface` 恰好排在 `bg-brand` 之后、而
`text-white` 排在 `text-text-muted` 之后，结果就是 **surface 白底 + white 白字**——
两组冲突各赢一半，恰好组合成"不可见"。这也是它难查的原因：不是全覆盖或全不覆盖，
而是逐属性随机分胜负。

## 怎么办

三选一，按场景：

1. **状态类写成独立完整类，用三元切换**（本仓库采用）：

```tsx
className={isActive ? pageButtonActiveClass : pageButtonClass}
```

冲突从根上消失，代价是完整类里有少量重复的布局声明。

2. **叠加的类不与基础类冲突**：叠加只加新属性（如 `font-medium`、`shadow-*`）
   或用 CSS 变量间接控制，不重复声明同一属性。
3. **引入 `tailwind-merge`**：`twMerge` 会按 Tailwind 语义把后出现的冲突类
   真正替换前面的。shadcn/ui 的 `cn` 就是 `clsx + twMerge`。
   注意：本仓库各文件手写的 `cn` 只是 `filter(Boolean).join(" ")`，**没有** merge 能力，
   不要想当然。

## 核心要点

- class 字符串里的顺序 ≠ 优先级；同属性 utility 冲突时结果不可预测。
- "看起来一直好好的"不代表写法对——换个 Tailwind 版本、加个新页面改变类的生成顺序，
  旧按钮就可能突然白屏。
- 排查这类问题看 DevTools 的 computed style 最快：会看到两个类都命中、其中一个被划掉，
  且被划掉的是谁与书写顺序无关。
- 用了 `cn` / `clsx` 不等于用了 `twMerge`；先确认工具函数到底做什么。

## 自检

1. 你项目里的 `cn` 有没有 merge 能力？`cn("bg-red-500", "bg-blue-500")` 产出什么？
2. 为什么这个 bug 往往在"激活态"才暴露？（答：非激活态只挂基础类，无冲突；
   激活态才同时挂两组同属性类。）
