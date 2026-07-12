# 可视反馈必须与真实输入共享顺序契约

来源：`docs/histories/2026-07/20260712-1105-actspace-browser-identity-cursor.md`

## 常见错觉

给虚拟光标加上 CSS `transition`，不代表点击已经变成“先移动、后执行”。如果调用方设置目标坐标后立即发送真实输入事件，动画仍在播放时页面就已经收到点击。

用户看到的是：

```text
光标正在移动 ──────────▶ 目标
              点击已经发生 ↑
```

这不只是观感问题。光标是自动化行为的可解释性和安全反馈，提前点击会让用户误判 Agent 的真实作用位置与时机。

## 正确契约

把动画定义为一个可等待的异步操作：

```text
await visualCursor.moveTo(target)
await dispatchMouseMoved(target)
await dispatchMousePressed(target)
await dispatchMouseReleased(target)
```

跨进程或跨 runtime 时，每一层都必须保留这个等待语义：

1. 页面 overlay 的 `moveTo()` 返回 Promise。
2. CDP `Runtime.evaluate` 开启 `awaitPromise`。
3. Extension primitive 等待 evaluate 完成后才响应。
4. Go CUA handler 等待 primitive 响应后才发送输入事件。

任何一层把 Promise 丢掉，最终都会退化成“视觉动画与真实输入并发”。

## 位置状态

连续运动还需要状态：首次操作从确定的默认位置出现，之后从上次终点继续。状态应尽量靠近渲染对象保存，这样同一页面的连续动作天然连贯；页面刷新导致 runtime 消失时，再通过版本检查重新注入并恢复默认起点。

## 拖拽的差异

普通点击只需要等待一次到达。拖拽则包含起点、按下、多个路径点和释放：

```text
moveTo(start) -> press -> moveTo(p1) -> CDP move p1 -> ... -> release
```

路径点之间可以缩短动画时间或采用非阻塞模式，但视觉位置与 CDP 顺序不能交叉，否则光标会落后于被拖动元素。

## 常见陷阱

- 只设置 CSS transition，没有 Promise。
- `Runtime.evaluate` 没有启用 `awaitPromise`。
- 第一帧直接放在目标点，导致首次操作仍像瞬移。
- 光标图形以中心定位，而实际点击热点在箭头尖端。
- 页面里残留旧 runtime，Extension 更新后因为全局变量存在而拒绝重新注入。
- drag 只动画到起点，后续真实路径不可见。

## 自检

1. 真实点击是否一定发生在动画 Promise resolve 之后？
2. 第一次操作是否有确定起点，而不是目标点淡入？
3. 箭头尖端是否与 CDP 坐标完全一致？
4. Extension 更新后，旧页面能否通过 runtime version 自动升级？
