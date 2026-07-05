# 用 grid-template-areas 切换布局，避免 React remount 丢焦点

关联 history：`docs/histories/2026-07/20260705-1522-user-message-clamp-diff-preview-write-approval.md`

## 是什么

当一个输入组件需要在两种布局形态间动态切换（如 Composer 的「单行紧凑 ↔ 文本在上控件贴底」），如果两种形态写成两套 JSX 结构，React 会在切换瞬间卸载重建 textarea——正在打字的用户丢焦点、丢光标位置，还会闪烁。

解法：**DOM 结构只写一份，布局差异全部交给 CSS grid**。同一个容器按状态切换 `grid-template-areas`，每个子元素固定声明 `grid-area`，切换只改 className，所有节点原地不动。

```tsx
// 容器：两态只差 areas 定义
const INLINE  = "grid-cols-[auto_1fr_auto_auto] [grid-template-areas:'plus_input_model_send']";
const STACKED = "grid-cols-[auto_auto_1fr_auto] [grid-template-areas:'input_input_input_input'_'plus_model_._send']";
// 子元素：位置由 area 决定，与 DOM 顺序解耦
<textarea className="[grid-area:input] ..." />
```

## 关键细节

- **切换判定用渲染高度而不是字符特征**：`scrollHeight > 单行阈值` 同时覆盖显式 `\n` 和长文本自动折行；只看 `\n` 会漏掉 wrap 的情况。
- **分组语义用 `display: contents` 保留**：toolbar 需要 `aria-label` 分组（也方便测试定位），但 grid 布局要求子项是容器的直接参与者。`display: contents` 的元素自身不产生盒子，子元素直接参与外层 grid，aria/DOM 查询不受影响。
- **测试锁「不 remount」**：切换前后断言 `getByLabelText(...)` 返回同一个元素引用（`toBe(input)`），防止后续重构改回双 JSX 结构。

## 陷阱

- Tailwind 任意值里写 grid-template-areas，行与行之间用 `_` 分隔（编译为空格）、每行用引号包裹：`[grid-template-areas:'a_b'_'c_d']`，引号丢了就整条失效且无报错。
- 依附于位置的浮层要跟着状态走：同一个下拉按钮在 inline 时靠右（菜单该向左展开）、stacked 时靠左（向右展开），锚点方向必须随布局态动态选，否则宽菜单撞窗口边界。

## 自检问题

- 你的「两种形态」是不是只有位置不同、内容相同？是的话优先 grid-areas，双 JSX 是最后手段。
- 切换发生时用户可能正在和哪个元素交互？该元素在切换后还是同一个 DOM 节点吗？
