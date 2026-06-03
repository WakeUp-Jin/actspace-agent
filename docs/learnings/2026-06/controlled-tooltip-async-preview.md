# 受控 Tooltip：异步 Preview 不要只交给 Hover 状态

关联 history：`docs/histories/2026-06/20260604-0033-session-hover-card.md`

## 是什么

普通 tooltip 通常只展示一行静态文字，交给组件库内部的 hover/focus 状态就够了。但如果 tooltip 里要展示异步加载的 preview，并且还要和右键菜单、rename 输入框、键盘 focus 互斥，它就已经不是纯装饰 tooltip，而是一个轻量 popover 状态机。

更稳的做法是把浮层 `open` 状态受控化：

- hover/focus 只负责提出“想打开”的意图。
- 业务状态决定是否真的打开，例如 rename 中、context menu 打开时不打开。
- 异步 preview 有自己的 loaded/loading ref，防止 focus 和 hover 同帧重复请求。
- blur、右键菜单、进入 rename 明确关闭浮层。

## 为什么需要

这次 session hover card 的第一版在单测里能触发 preview 加载，但 Electron renderer smoke 抓到隐藏窗口里的 focus 路径没有稳定显示卡片。问题不是“没有数据”，而是“数据加载”和“浮层可见”被绑在 tooltip 内部交互上，真实渲染环境下某些事件路径会和 jsdom 不一样。

把 `open` 状态交给业务组件后，行为边界变清楚：

```tsx
<Tooltip open={hoverCardOpen} onOpenChange={handleHoverOpenChange}>
  <TooltipTrigger
    onFocus={handleTriggerFocus}
    onBlur={handleTriggerBlur}
  />
  <TooltipContent>
    <SessionHoverCard preview={hoverPreview} />
  </TooltipContent>
</Tooltip>
```

这里 `handleTriggerFocus()` 同时打开浮层和加载 preview；`handleHoverOpenChange()` 仍保留 Radix 的 hover/collision 能力，但不再让库内部状态成为唯一事实源。

## 核心要点

- **异步数据和浮层可见性是两件事**：preview 可以 loading，但卡片是否打开要由业务状态决定。
- **受控 open 适合复杂互斥**：右键菜单、rename、blur 都可以明确关闭，不需要猜组件库内部状态。
- **用 ref 锁请求门闩**：React state 更新是异步的，focus 和 hover 连续触发时，`loadingRef/loadedRef` 比只读 state 更能防重复请求。
- **真实渲染 smoke 能抓单测盲区**：jsdom 可以证明 React 逻辑，Electron smoke 更容易暴露 focus、portal、主题计算色、viewport 边界这些浏览器行为。
- **卡片内容仍要轻量**：hover preview 只返回摘要，不要把完整 session record 或管理操作塞进左栏。

## 常见陷阱

- **只断言 resolver 被调用**：这只能证明数据开始加载，不能证明用户能看到浮层。
- **把缓存完全放在组件 state**：同一帧多个事件可能都看到旧 state，导致重复请求。
- **右键菜单不关闭 hover card**：两个浮层同时出现会让行级操作变得不可预测。
- **只在浅色主题看样式**：主题 token 写对不等于真实计算色正确，至少要抽查浅/深两套。

## 自检问题

- 键盘 focus 到 trigger 时，浮层是真的可见，还是只开始加载数据？
- 如果 hover 和 focus 连续触发，preview resolver 会不会被调用两次？
- 当用户右键或进入 rename 输入框时，旧浮层是否会立刻关闭？
