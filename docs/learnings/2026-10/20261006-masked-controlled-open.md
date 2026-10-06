# 受控组件的 open 被「遮住」时，关闭回调会丢失

> 来自 Desktop 前端重构 16（UI 原语与组件拆分）的收尾验收。history：`docs/histories/2026-10/20261006-1340-desktop-fe-16-ui-primitives.md`。

## 现象

侧栏的会话行有一个悬停提示（Radix Tooltip），右键菜单或状态说明打开时，提示要让开，所以 `open` 是这样传的：

```tsx
const [tooltipOpen, setTooltipOpen] = useState(false);

<Tooltip
  open={tooltipOpen && !menuOpen && !statusOpen && !isRenaming}
  onOpenChange={setTooltipOpen}
>
```

看起来没问题：浮层开着时 `open` 恒为 false。但在 Electron 里实测：

1. 悬停这一行，提示出来；
2. 点状态点，说明浮层打开，提示消失；
3. 指针移走，点别处，说明关闭；
4. **提示又冒出来，而且一直挂着**，指针早就不在这一行上了。

## 为什么会这样

Radix 的受控状态（`useControllableState`）里，`setOpen` 大致是这样：

```ts
const setValue = (next) => {
  if (isControlled) {
    if (next !== prop) onChange(next);   // 只有和传进来的 open 不同时才回调
  } else {
    setUncontrolled(next);
  }
};
```

关键在 `next !== prop`：它比较的是**你传进去的 `open`**，不是你自己的 state。当你传的是一个被遮住的值（`tooltipOpen && !statusOpen`）时：

| 时刻 | 你的 `tooltipOpen` | 传给 Radix 的 `open` | Radix 想做的事 | 是否回调 |
| --- | --- | --- | --- | --- |
| 悬停出提示 | true | true | — | — |
| 点状态点 | true | **false**（被遮住） | 指针离开、想「关」：`false !== false` 不成立 | **不回调** |
| 说明开着时焦点进浮层，事件穿过 portal 冒泡到行上 | true | false | 想「开」：`true !== false` 成立 | 回调 `true` |
| 关掉说明 | **true** | **true** | — | 提示出来了 |

「关」的回调在遮住期间被吞掉了，「开」的回调却照样触发。你的 state 停在 true，遮罩一撤，提示就出来了。

这不是 Radix 的 bug：受控组件的约定是「你说了算」。Radix 看到的状态已经是关的，再告诉你「要关」没有意义。问题出在**传进去的 `open` 和自己存的 state 不是同一个东西**。

## 怎么改

让 state 和传进去的值保持一致：遮住期间不接受「打开」。

```tsx
const tooltipSuppressed = menuOpen || statusOpen || isRenaming;

<Tooltip
  open={tooltipOpen && !tooltipSuppressed}
  onOpenChange={(open) => setTooltipOpen(open && !tooltipSuppressed)}
>
```

另一个看起来也行的做法是「遮住开始时把 `tooltipOpen` 清成 false」。它只修了一半：遮住开始之后的「开」照样会把 state 写回 true。变异测试也证实了这一点，只清零的版本测试仍然失败，只加过滤的版本测试通过。

## 核心要点

- 受控组件的 `onChange` 是「和你传进来的值相比有变化」时才调，不是「和组件内部上一次的值相比」。
- 只要 `open={state && 条件}`，`state` 和 `open` 就可能分叉；分叉期间只有一个方向的变化能传回来。
- 修法是在 `onOpenChange` 里用同一个条件过滤，让 state 永远不会比 `open` 更「开」。
- jsdom 里很难复现：要靠 focus 事件穿过 React portal 冒泡这一步，`user.click(document.body)` 测不到。用例里要先悬停出提示、再用键盘打开浮层、再点别处关掉。

## 常见陷阱

- **React 事件穿过 portal 冒泡**：浮层 portal 到 body，DOM 上不在行里面，但 React 的合成事件按组件树冒泡，浮层里的 focus 会被行上的 `TooltipTrigger` 收到。「浮层在 body 下面，不会影响行」这个直觉是错的。
- 同样的写法在 16 之前就有（`tooltipOpen && !menuPosition && !isRenaming`），只是旧的说明浮层是手写的，不在行的 React 树里收焦点，很少触发。换成 Radix Popover 后才暴露。

## 自检问题

1. 如果把 `onOpenChange={setTooltipOpen}` 换成非受控（`defaultOpen` + 不传 `open`），还会有这个问题吗？那样又怎么在浮层打开时遮住提示？
2. 一个受控的 `<Select value={disabled ? "" : value} onValueChange={setValue}>`，在 `disabled` 期间会不会出现类似的分叉？哪个方向的变化会丢？
