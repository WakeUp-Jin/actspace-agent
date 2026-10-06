# 同一个函数里的闭包共用一个作用域：大组件为什么会留住旧数据

## 现象

14 收尾时在 Electron 里循环「新建会话 → 发送 → 归档」，每轮强制 GC 后 JS 堆仍涨约 1.9 MB，20 轮从 23 MB 涨到 60 MB。store 的 evict 是对的：jsdom 用例证明 cell 已经从 Map 里删除。可是堆快照里，已归档会话的系统提示词、技能列表还在，每个会话十几份。

## 为什么

V8 不是按「每个闭包各自捕获它用到的变量」实现的。**同一次函数调用里创建的所有闭包，共享这一次调用的一个 Context 对象**。只要有任何一个闭包读了变量 `x`，`x` 就进这个 Context。之后不管哪个闭包活着，`x` 都跟着活着。

```tsx
function App() {
  const sessionCell = useSessionCell(...);                       // 大对象
  const record = useMemo(() => select(sessionCell), [...]);       // 这个闭包读了 sessionCell → 它进了本次渲染的 Context
  const handleArchive = useCallback(() => { ... handleFork() ... }, [handleFork]);  // 和上面那个闭包共用同一个 Context
  ...
}
```

React 组件每渲染一次就是一次新的函数调用，也就有一个新的 Context。`useCallback` 在依赖没变时返回**旧渲染**创建的函数，而那个函数持有的是旧渲染的 Context。App 里的回调又互相依赖：`handleArchiveSession` 依赖 `handleForkSession`，`handleForkSession` 依赖更早的 `handleArchiveSession`……于是形成一条链，一层层留住旧渲染的 Context。每个 Context 里都有那一次渲染的 `sessionCell`、`messages`、`contextState`。

堆快照里的最短持有路径正是这样：

```text
Composer 的 onSend
  → 旧渲染 Context（handleArchiveSession）
  → 更旧的 Context（handleForkSession）→ ……
  → 变量 sessionCell / contextState
  → 已归档会话的 cell window → request/context 事件 → 系统提示词
```

基线代码没有这个问题，是因为当时 cell 不是 App 的局部变量，Context value 也不是用 `useMemo(() => ({ messages, contextState, ... }))` 拼出来的。

## 怎么修

原则：**大数据不要成为大组件里会被闭包读到的局部变量。**

1. 把「订阅大对象 → 投影出小结果」放进自定义 hook。hook 是另一次函数调用，有自己的 Context；App 只拿到投影结果（`sessionRecord`、`historyBefore`）。

   ```ts
   export function useChatSessionRecord(store, sessionId, root) {
     const cell = useSessionCell(store, sessionId, selectCell);   // cell 只存在于这个 hook 的 Context
     const sessionRecord = useMemo(() => cell ? selectChatSession(cell, root) : null, [...]);
     return { sessionRecord, historyBefore: cell?.window?.beforeSeq ?? null };
   }
   ```

2. 需要引用稳定的对象，不用带工厂函数的 `useMemo`，改用「浅比较后复用上一次对象」的 hook。对象字面量在 App 里直接求值，没有闭包，`messages` 等就不会因为它进 Context。

   ```ts
   const activeSession = useShallowStable({ sessionId, messages, contextState, onSend, ... });
   ```

两步都做之后，30 轮循环里堆从第 10 轮起稳定在 15 MB，比基线还低。只做第一步时仍缓慢增长，剩下的就是 `contextState`：它被 Context value 的 `useMemo` 工厂读到了。

## 核心要点

- 闭包捕获的是**作用域**，不是单个变量；同一函数里任何一个闭包读到的变量，所有闭包都会一起留住。
- `useCallback` / `useMemo` 返回的旧函数会留住**旧渲染**的整个作用域。回调之间互相依赖时，旧作用域会连成链。
- 组件越大、局部变量越多，这种泄漏越容易出现，而且单测几乎测不出来：jsdom 里没人量堆，store 层面的释放也确实是对的。
- 定位方法：GC 后对比两次堆快照，按字符串内容做差，找增长最多的内容，再求它到 GC root 的最短持有路径。路径上出现 `system / Context` 和 `useCallback` 产生的函数名，基本就是这个问题。

## 常见陷阱

- 以为「`useMemo` 的依赖里只列了 `cell?.window`，所以只捕获 window」。依赖数组只决定何时重算，捕获看的是工厂函数体里读了什么。
- 以为 store evict 成功就等于内存释放。store 只是持有者之一。
- 用 WeakMap 做缓存时，堆快照会显示「WeakMap 持有」，看起来像根因。其实 WeakMap 的 key 本身被别处强引用，要排除 WeakMap 边后再看最短路径。

## 自检问题

1. 一个组件里有 `const big = useBig(); const a = useCallback(() => log(1), []); const b = useMemo(() => f(big), [big]);`，`a` 会留住 `big` 吗？为什么？
2. 为什么把 `useMemo` 换成「浅比较复用」能减少泄漏，而不只是换一种写法？
3. 如果不能拆组件，还有什么办法让旧渲染的作用域不被留住？（提示：回调用 ref 读最新值，依赖设为 `[]`）

来源：[14 执行过程「Electron 检查与内存修复」](../../exec-runs/20261005-desktop-fe-14-renderer-state/execution-process.md)，现行规范 §8。
