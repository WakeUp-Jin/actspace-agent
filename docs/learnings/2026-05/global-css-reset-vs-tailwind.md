# 全局 CSS reset 会覆盖 Tailwind utility

来源：`docs/histories/2026-05/20260528-1958-lab-button-card-visual-tune.md`

这次 Lab 页 `新实验` 按钮的 className 已经包含 `bg-[#2563eb]`、`text-white`、`border-[#2157d6]`，但页面上仍然显示成白底黑字。根因不是 Tailwind 没编译，而是旧 `styles.css` 在 Tailwind 之后加载，里面的全局 `button` reset 作为未分层 author CSS 覆盖了 Tailwind utility 的同一批属性。

## 为什么反直觉

直觉上看到 JSX 里有：

```tsx
const primaryButtonClass =
  "border border-[#2157d6] bg-[#2563eb] text-white shadow-[...]";
```

很容易继续调颜色、换 class、甚至怀疑 Tailwind 任意值写法。但浏览器最终采用的是 CSS cascade：

```css
/* tailwind.css 先加载 */
.bg-\[\#2563eb\] {
  background-color: #2563eb;
}

/* 旧 styles.css 后加载 */
button {
  border: 0;
  background: none;
  color: inherit;
}
```

这里有两个点叠在一起：旧 `styles.css` 排在 Tailwind 之后，而且这些旧规则没有放进 Tailwind layer。未分层 author CSS 会压过 layer 内的 utilities；当它命中同一个元素并设置同一个属性时，页面就会表现成“class 明明有但不生效”。

## 这次怎么定位

有效的诊断不是继续肉眼猜，而是看 computed style：

```js
const btn = [...document.querySelectorAll("button")].find((el) =>
  el.textContent?.includes("新实验")
);
const cs = getComputedStyle(btn);
({
  className: btn.className,
  backgroundColor: cs.backgroundColor,
  borderColor: cs.borderColor,
  color: cs.color,
  boxShadow: cs.boxShadow,
});
```

异常状态下可以看到：

- `className` 里有 `bg-[#2563eb]` 和 `text-white`
- `backgroundColor` 仍然是透明
- `borderColor` 和 `color` 继承了旧按钮 reset
- `boxShadow` 生效，因为旧 reset 没覆盖 `box-shadow`

这说明 Tailwind 生成和挂载都没问题，真正问题是后加载 CSS 覆盖了部分属性。

## 正确修法

正确方向是收窄污染源，而不是给单个按钮加更高优先级：

```css
/* 不推荐 */
button {
  border: 0;
  background: none;
  color: inherit;
}

/* 推荐 */
.sidebar button,
.conversation-shell button,
.right-panel button,
.context-popover button {
  border: 0;
  background: none;
  color: inherit;
}
```

第一次只把规则收窄到 `.split-view button` 仍然不够，因为 Lab 页面本身也在 `.split-view` 里面。作用域必须指向真正拥有旧样式的区域，而不是工作台大容器。

## 常见陷阱

- **只看 className，不看 computed style**：class 存在只能证明 React 输出正确，不能证明 CSS cascade 最终正确。
- **用 inline style 立刻抢优先级**：短期能修按钮，长期会掩盖全局污染，下一处按钮还会继续坏。
- **把 reset 挂在布局容器上**：`.split-view button` 看似比 `button` 安全，但它覆盖了所有页面，包括新 Tailwind 页面。
- **把迁移期旧 CSS 当成无害背景**：只要旧 CSS 后加载且未分层，它就是 active participant，会参与覆盖。
- **忘记给 base reset 分层**：即使 `button { font: inherit; }` 这种 reset 没有视觉身份，如果 `base.css` 未分层且在 Tailwind 后导入，也会覆盖组件里的 `text-sm`、`text-[13px]`、`font-medium` 和 `leading-*`。入口应显式写成：

  ```css
  @layer theme, base, chrome, components, utilities;

  @import "./tokens.css";
  @import "./tailwind.css";
  @import "./base.css" layer(base);
  @import "./electron.css" layer(chrome);
  ```

  当前 renderer 已删除旧根部 `styles.css` 与 `legacy-*` 分区，后续普通 UI 样式应继续写回组件局部 Tailwind class，而不是恢复 legacy 文件。

## 自检问题

1. 这个元素的目标属性在 computed style 里是什么值？来自哪条 matched rule？
2. 是否有旧根部 `styles.css`、`legacy-*` 分区、裸元素选择器或大容器后代选择器回流？
3. 这个 reset 是否真的只属于某个旧区域？如果是，是否已经挂到那个区域的 class 上？
4. `base.css` 是否确实进入了 `base` layer，而不是作为未分层 author CSS 后加载？
5. 修复方式是在降低污染范围，还是在单个元素上堆优先级？

## 相关文档

- `docs/coding-standards/team/frontend-style-scope-conventions.md`
- `docs/learnings/2026-05/tailwind-page-slice-migration.md`
- `docs/learnings/2026-05/color-as-identity-badge-not-container.md`
