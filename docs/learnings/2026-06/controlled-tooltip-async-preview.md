# 受控浮层：open 状态归业务组件，并守住三个时序坑

合并自：受控 Tooltip 异步 Preview 不要只交给 Hover 状态、受控组件的 open 被“遮住”时关闭回调会丢失、关闭浮层后恢复焦点为什么会重新打开它。

关联：`docs/histories/2026-06/20260604-0033-session-hover-card.md`、`docs/histories/2026-10/20261006-1340-desktop-fe-16-ui-primitives.md`（Desktop 前端重构 16 收尾验收）

tooltip 里若要展示异步 preview、还要与右键菜单、rename 输入框、键盘 focus 互斥，它就不是纯装饰，而是一个轻量 popover 状态机：`open` 要受控，hover/focus 只负责提出“想打开”的意图，业务状态决定是否真打开，blur、右键菜单、进入 rename 明确关闭。

## 1. 数据加载与浮层可见是两件事

session hover card 第一版在单测里能触发 preview 加载，但 Electron renderer smoke 抓到隐藏窗口里 focus 路径没稳定显示卡片——数据没问题，是“数据加载”和“浮层可见”被绑在 tooltip 内部交互上，真实渲染环境某些事件路径与 jsdom 不同。

```tsx
<Tooltip open={hoverCardOpen} onOpenChange={handleHoverOpenChange}>
  <TooltipTrigger onFocus={handleTriggerFocus} onBlur={handleTriggerBlur} />
  <TooltipContent><SessionHoverCard preview={hoverPreview} /></TooltipContent>
</Tooltip>
```

`handleTriggerFocus()` 同时打开浮层并加载 preview；`handleHoverOpenChange()` 保留 Radix 的 hover/collision 能力，但库内部状态不再是唯一事实源。请求门闩用 ref（`loadingRef/loadedRef`），因为 state 更新异步，focus 与 hover 同帧连续触发时只读 state 会重复请求。hover preview 只返回摘要，不把完整 session record 或管理操作塞进左栏。陷阱：只断言 resolver 被调用（只证明数据开始加载，不证明可见）；右键菜单不关闭 hover card；只在浅色主题看样式（深浅两套都抽查计算色）。jsdom 证明 React 逻辑，Electron smoke 才暴露 focus、portal、主题计算色、viewport 边界。

## 2. 传给组件的 `open` 被“遮住”时，关闭回调会丢

```tsx
<Tooltip open={tooltipOpen && !menuOpen && !statusOpen && !isRenaming} onOpenChange={setTooltipOpen}>
```

Electron 实测：悬停出提示 → 点状态点（说明浮层打开，提示消失）→ 指针移走、点别处、说明关闭 → **提示又冒出来并一直挂着**。原因：Radix `useControllableState` 里 `if (next !== prop) onChange(next)`，比较的是**你传进去的 open**，不是你自己的 state。遮住期间传的 `open=false`，指针离开想“关”：`false !== false` 不成立、不回调；而浮层里的 focus 事件穿过 portal 冒泡到行上，想“开”：`true !== false` 成立、回调 `true`。你的 state 停在 true，遮罩一撤提示就出来。这不是 Radix 的 bug，是传进去的 `open` 与自己存的 state 不是同一个东西。

修法：`onOpenChange` 用同一个条件过滤，让 state 永远不比 `open` 更“开”：

```tsx
const tooltipSuppressed = menuOpen || statusOpen || isRenaming;
<Tooltip open={tooltipOpen && !tooltipSuppressed} onOpenChange={(open) => setTooltipOpen(open && !tooltipSuppressed)} />
```

“遮住开始时把 state 清成 false”只修一半（遮住之后的“开”照样写回 true），变异测试证实。要点：`open={state && 条件}` 会让 state 与 open 分叉，分叉期间只有一个方向的变化能传回来。**React 事件穿过 portal 冒泡**：浮层 portal 到 body、DOM 上不在行里，但合成事件按组件树冒泡，浮层里的 focus 会被行上的 `TooltipTrigger` 收到。jsdom 难复现：先悬停出提示、再用键盘打开浮层、再点别处关掉，`user.click(document.body)` 测不到。类似的 `<Select value={disabled ? "" : value}>` 也有同样分叉风险。

## 3. 恢复焦点也是交互事件，会排队新的打开任务

浮层通过 focus 延迟打开时，Escape 里调用 `trigger.focus()` 恢复焦点会排队新的打开任务；把 open 设成 false 只改当前状态，取消不了已排队任务。区分“用户新发起的打开”与“关闭过程中产生的焦点事件”：主动关闭后先阻止旧回调，恢复焦点时阻止默认打开，在下一次明确的点击、指针进入或重新聚焦时才允许预览；不靠增加关闭延迟去竞争两个定时器。测试覆盖时间：先证明确实打开 → Escape → 检查焦点返回 → 等待超过打开延迟检查仍关闭 → 验证新交互可以打开（避免永久锁死）；只检查焦点会漏掉延迟重开。

## 自检

1. 键盘 focus 到 trigger 时，浮层真的可见还是只开始加载？hover 与 focus 连续触发，resolver 会被调用两次吗？
2. 传给组件的 `open` 与自己存的 state 是同一个吗？遮住期间哪个方向的变化会丢？
3. 用户右键或进入 rename 时旧浮层立刻关闭吗？设置 open=false 会取消定时器吗？程序调用 `focus()` 是否触发打开？拒绝旧回调后用户如何重新打开？
