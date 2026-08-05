# CSS Grid 的自动最小尺寸会让响应式子项看起来无法缩小

关联 history：[修复窄窗口审批卡片被裁切](../../histories/2026-08/20260805-2230-fix-narrow-approval-layout.md)

## 现象

一个卡片已经写了 `width: 100%` 和 `max-width: 800px`，宽窗口正常，但窗口缩窄后仍像 800px 宽，右侧内容直接消失。继续给卡片加 `overflow: hidden` 只能让裁切更安静，并不会让布局真正回流。

当用户消息、审批卡和 Composer 同时出现同样的问题时，应优先检查它们共同的布局祖先，而不是分别修三个组件。

## 原理

只有 rows、没有 columns 的单列 Grid 会生成一条隐式 `auto` 列。`auto` track 的最小值会考虑后代的 min-content；Grid item 和 Flex item 默认的 `min-width: auto` 还会沿嵌套层级保留这份固有最小宽度。

```css
.conversation {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  /* 唯一列是隐式 auto track。 */
}
```

外层如果设置 `overflow: hidden`，浏览器不会提示列已经溢出，只会裁掉超出视口的部分。视觉上因此很像某个卡片被固定宽度锁住。

## 修复模式

把“允许收缩”同时写在拥有 track 的容器和关键 Grid/Flex item 上：

```css
.conversation {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) auto;
}

.viewport,
.message-stack,
.message-turn,
.composer-zone {
  min-width: 0;
}
```

两部分职责不同：

- `minmax(0, 1fr)` 让 Grid track 可以小于内容的 min-content。
- `min-width: 0` 让嵌套的 Grid/Flex item 接受祖先分配的窄宽度。

不要用更小的固定 `width` 修复，因为那会破坏宽屏阅读宽度；也不要只加 `overflow-x: hidden`，因为按钮仍可能位于不可见区域。

## 排查方法

1. 找多个同时越界的组件，定位最小公共布局祖先。
2. 检查 Grid 是否只有 rows、使用 `auto` 列，或 `1fr` 实际仍带自动最小值。
3. 从 Grid track 到目标组件逐层检查 Grid/Flex item 的 `min-width`。
4. 同时查看 `clientWidth`、`scrollWidth` 和 `getBoundingClientRect()`；不要只看声明的 `width`。
5. 分别在产品最小窗口宽度和常规宽度验收，确认窄屏回流且宽屏上限不变。

## 自检

- 为什么 `1fr` 有时仍会被长内容撑开，而 `minmax(0, 1fr)` 可以收缩？
- 为什么 `overflow: hidden` 会让这个问题更难定位？
- 如果只有一个卡片越界，而它的兄弟组件都正常，应先检查共同 Grid 还是卡片内部？
