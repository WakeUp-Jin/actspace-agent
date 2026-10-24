# 浮层自动翻转为什么仍会越出屏幕

Radix 的碰撞处理解决放置位置；调用方仍需让内容适应可用空间。`flip` 不能保证一张在上下两侧都放不下的卡片完整入屏。

## 三种约束分别管什么

| 约束 | 作用 | 不能保证的事 |
| --- | --- | --- |
| `flip` | 在另一侧更合适时更换方向 | 两侧都不够时缩小内容 |
| `--radix-popover-content-available-height` | 公布当前放置方向的可用高度 | 自动把内容设置为这个高度 |
| 列表 `max-height: 280px` | 限制列表自然高度 | 搜索栏、边框、padding 与列表相加后仍能入屏 |

例如锚点上方只有263px，而完整卡片高322px，下方也不足322px。只限制列表为280px，卡片仍会越界。应该让整张卡片消费可用高度，再让内部列表承担收缩。

```css
.card {
  display: flex;
  flex-direction: column;
  max-height: var(--radix-popover-content-available-height);
  overflow: hidden;
}
.search { flex-shrink: 0; }
.list { min-height: 0; max-height: 280px; overflow-y: auto; }
```

`min-height: 0` 允许列表作为 flex 子项缩到内容自然高度以下；固定搜索行后，剩余空间交给滚动列表。只有 `overflow: hidden` 会把问题变成无法访问的裁切，必须同时保留内部滚动和活动项滚入可见区。

## 验证时分开判断

至少覆盖“一侧足够”和“两侧都不足”。前者验证翻转，后者验证整卡适应空间、固定搜索行与内部滚动。jsdom 没有真实布局，不能证明几何通过；真实浏览器组件回归可以稳定检查边界，但原生应用的窗口、锚点和焦点仍要实际复验。

本次来源：[BUG-050](../../exec-runs/20261021-actspace-full-acceptance/bugs/BUG-050.md)。
