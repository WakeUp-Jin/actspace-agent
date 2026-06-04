# 侧边栏滚动容器要明确单轴

关联 history：`docs/histories/2026-06/20260604-2042-sidebar-horizontal-overflow.md`

## 是什么

窄侧边栏里的列表通常只应该纵向滚动。`overflow-auto` 看起来省事，但它同时允许横向和纵向滚动；只要某个子元素的最小内容宽度超过容器宽度，浏览器就会给这个列表生成横向滚动能力。

这次问题出现在会话列表：容器用 `overflow-auto`，内部又有 `whitespace-nowrap` 的时间列和长空状态文案。当侧边栏宽度变小，列表的 `scrollWidth` 超过 `clientWidth`，横向滚动条就出现了。

## 为什么容易踩坑

- 透明按钮仍然占布局宽度：`opacity-0` 只隐藏视觉，不会释放空间。
- `white-space: nowrap` 的文本不会自动换行，必须配合可收缩容器和截断策略。
- `overflow-auto` 是双轴开关，不是“我只想要需要时纵向滚动”的语义。
- 触控板可能悄悄改变 `scrollLeft`，让内容左侧被切掉，看起来像文本自己跑偏。

## 修复模式

```txt
Sidebar nav
  overflow-x: hidden
  overflow-y: auto
  min-width: 0

Rows / lists
  min-width: 0
  width: 100%

Long text
  truncate / wrap / remove from fixed utility columns
```

核心原则是：先定义滚动轴，再让子元素在这条轴之外不要扩大容器。

## 自检问题

- 这个容器是否真的需要横向滚动？
- 子元素里是否有 `nowrap`、固定宽按钮、透明但占位的 action？
- 缩到最小宽度时，`scrollWidth` 是否仍等于 `clientWidth`？
