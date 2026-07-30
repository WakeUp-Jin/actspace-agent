# 长会话导航必须共享一个滚动事实源

关联 history：`docs/histories/2026-07/20260729-2355-add-conversation-turn-navigation.md`

## 是什么

长聊天界面通常同时存在三种需求：流式内容自动跟随底部、用户上滚阅读历史、通过导航刻度跳到某一轮。如果三者各自维护一套“当前是否在底部”和“当前轮次”状态，很容易出现按钮显示错误、跳转后被拉回底部或尺寸变化覆盖用户选择的问题。

更稳定的做法是让消息滚动容器成为唯一事实源：所有能力都从同一个 `scrollTop / scrollHeight / clientHeight` 和同一组 turn DOM 锚点派生状态。

## 三种状态如何关联

滚动容器每次发生滚动或尺寸变化时，统一计算：

```ts
const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
const atBottom = distanceFromBottom < 80;

stickToBottomRef.current = atBottom;
setShowScrollToBottom(scrollable && !atBottom);
setActiveTurnId(findTurnAtReadingLine());
```

- `atBottom = true`：流式内容增长可以继续贴底，回底按钮隐藏。
- `atBottom = false`：尊重用户阅读位置，回底按钮显示，内容增长不得强制滚动。
- 当前 turn：通过各 turn 元素相对于消息视口阅读基准线的位置计算，不需要复制 session 数据。

## 为什么导航锚点应该绑定 DOM turn

session event 描述的是持久化和执行事实，但导航需要的是当前渲染布局。一个 turn 可能包含折叠工具组、展开 diff、图片加载或动态 Assistant 内容，这些都会改变实际高度。

如果用消息数量或 token 比例估算位置，刻度跳转会逐渐偏离。把导航目标绑定到已渲染的 turn `<section>`，再使用 `scrollIntoView`，才能让导航和用户实际看到的布局保持一致。

## ResizeObserver 的陷阱

尺寸变化既可能来自正在流式输出，也可能来自用户展开内容。观察到 resize 后不能无条件执行滚底：

```ts
if (stickToBottomRef.current) {
  container.scrollTop = container.scrollHeight;
}

updateNavigationState();
```

顺序和条件都重要：只有用户原本贴底时才允许跟随；导航状态和按钮状态则无论是否贴底都需要更新。

## 覆盖层不要放进滚动内容

导航轨和回底按钮属于视口级控件。如果把绝对定位元素直接放在可滚动内容中，它可能跟随消息一起滚走。更可靠的结构是：

```txt
message viewport wrapper (relative)
├─ message scroll container
├─ turn rail (absolute overlay)
└─ scroll-to-bottom button (absolute overlay)
```

这样覆盖层相对于可视区域固定，同时消息列表仍然是唯一滚动容器。

## 核心要点

- 自动跟随、回底按钮和轮次导航必须读取同一个滚动容器。
- 用户上滚是明确意图，尺寸变化不能覆盖它。
- 导航位置绑定真实 DOM turn，不用消息数量估算页面高度。
- 视口级控件放在滚动容器外层的相对定位 wrapper 中。
- 嵌套工具预览仍有自己的滚动所有权，不能与外层状态混在一起。

## 自检问题

1. 内容增长时，什么条件允许界面自动滚到底部？
2. 点击历史导航后，下一次流式 resize 会不会把用户拉走？
3. 导航目标依据的是持久化事件数量，还是实际渲染后的 DOM 位置？
