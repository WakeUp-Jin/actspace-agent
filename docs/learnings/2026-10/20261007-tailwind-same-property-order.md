# Tailwind：同一属性的两个类，谁生效不看 className 的顺序

左栏的行按钮有一个基础样式，里面写了 `bg-transparent`。选中时，再往后拼一个选中背景：

```tsx
<button className={`${ROW_CLASS} ${active ? "bg-sidebar-selected" : ""}`} />
// ROW_CLASS 里有 bg-transparent
```

直觉上，后写的会覆盖先写的。但实际结果是：选中背景一直不显示。

## 为什么

`className` 里的书写顺序不影响优先级。两个类的选择器优先级相同（都是一个类），这时候谁赢，看的是**它们在样式表里谁写在后面**。

Tailwind 生成样式表时，会按自己的规则排工具类的顺序，和你在 JSX 里怎么写无关。这次的构建产物里，几个背景类在 CSS 里的位置是：

```
.bg-selected          78086
.bg-sidebar-selected  78196
.bg-surface           78583
.bg-transparent       79778   ← 最后，所以它赢
```

`bg-transparent` 排在最后，所以不管 `className` 里怎么排，它都会压住选中背景。换一个颜色名，结果可能又反过来，所以这类 bug 时有时无，很难察觉。

## 怎么改

不要让同一属性的两个普通类同时出现在元素上。三种办法：

1. **二选一地拼**：`active ? "bg-sidebar-selected" : "bg-transparent"`，元素上永远只有一个背景类。
2. **用变体提高优先级**（这次的做法）：

   ```tsx
   const ROW_ACTIVE_CLASS = "aria-[current=page]:bg-sidebar-selected aria-[current=page]:text-text-main";
   <button aria-current={active ? "page" : undefined} className={`${ROW_CLASS} ${ROW_ACTIVE_CLASS}`} />
   ```

   `aria-[current=page]:` 生成的选择器是 `.class[aria-current=page]`，比单个类多一个属性选择器，优先级更高，不受样式表里的先后顺序影响。另外，选中状态同时写进了 `aria-current`，读屏软件也能读到。
3. **用 `tailwind-merge`** 这类工具，在运行时去掉冲突的类，保留后写的那个。代价是多一个依赖，以及每次渲染都要跑一遍合并。

## 要点

- 优先级相同时，样式表里的位置决定结果；`className` 字符串里的顺序没有作用。
- Tailwind 输出工具类的顺序由它自己决定，不要依赖这个顺序。
- 状态类最好挂在状态属性上（`aria-*`、`data-*` 变体），样式和语义一起表达，也不会被基础类压住。

## 自检

1. `class="p-4 p-2"` 和 `class="p-2 p-4"` 的效果一样吗？为什么？
2. 为什么 `aria-[current=page]:bg-x` 能压住 `bg-transparent`，而 `hover:bg-x` 在悬停时也能压住它？
3. 仓库里现有的「扩展」主操作按钮也有同样的问题，最小的修改是什么？

来源：[多智能体协作前端演示 T4](../../exec-runs/20261007-multi-agent-collab-frontend-demo/execution-process.md)。
