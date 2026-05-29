# Hover 操作入口需要稳定 hit target

来源：`docs/histories/2026-05/20260529-1200-follow-up-composer-bar.md`

## 核心模式

菜单行里的轻量操作可以视觉上只在 hover / focus 时出现，但可点击区域不要完全依赖“当前正处于 hover 状态”才能接收 pointer。更稳的做法是：

- 行内 actions 列保持稳定布局，避免文字、check、edit 互相挤压。
- 当前选中行或 focus 行直接显示关键操作。
- hover / focus 只控制视觉显隐，不让按钮在可见和不可点之间来回切换。

## 为什么重要

这次模型菜单一开始用 React state 控制 `Edit`：

```tsx
style={{
  opacity: showEdit ? 1 : 0,
  pointerEvents: showEdit ? "auto" : "none",
}}
```

单元测试暴露出一个问题：测试 hover 到行内文字后，按钮仍处于 `pointer-events: none`，点击 `Edit` 会失败。浏览器 mock 又进一步说明，自动化鼠标移动、行内文字、绝对定位 actions 和 React hover state 之间可能存在不同步。视觉上“应该出现”的入口，如果同时被 pointer-events 锁住，就会变成脆弱交互。

## 正确拆法

```tsx
const showEdit =
  spec.id === selectedModelId ||
  hoveredModelId === spec.id ||
  focusedModelId === spec.id;

<button
  className={modelEditButtonClass}
  style={{ opacity: showEdit ? 1 : 0 }}
  onClick={openModelOptions}
>
  Edit
</button>
```

这里有两个取舍：

- `opacity` 继续表达视觉状态。
- hit target 保持存在，避免 hover 边界抖动时变成不可点击。

如果某个隐藏操作真的不应该被鼠标命中，优先通过更稳定的状态来控制，例如“菜单未打开时不渲染”、“不可编辑模型不渲染”，而不是让同一个已渲染按钮在 hover 边界上反复切 pointer events。

## 常见陷阱

- **把 hover 当作唯一事实来源**：hover 是瞬时输入状态，不适合承载“是否允许打开 options”的业务语义。
- **隐藏和禁点绑死**：`opacity: 0` 加 `pointer-events: none` 很常见，但用于行内菜单操作时容易产生“刚出现又点不到”的边界问题。
- **忽略默认选中行**：当前模型本来就是用户最可能编辑的目标，选中行稳定显示操作比纯 hover 更符合菜单预期。
- **只跑单测不看浏览器**：jsdom/user-event 和真实浏览器的 hover 命中路径不完全等价，菜单类交互需要浏览器 mock 再验一次。

## 自检问题

1. 这个按钮是否只在 hover 的一瞬间才变成可点击？
2. 当前选中项是否应该有比 hover 更稳定的操作入口？
3. 视觉隐藏、布局占位和 pointer 命中是否被混成了同一个状态？
