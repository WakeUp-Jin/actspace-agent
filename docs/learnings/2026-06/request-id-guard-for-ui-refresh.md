# 用 request id guard 防止旧请求覆盖新 UI 状态

关联 history：`docs/histories/2026-06/20260604-0307-review-summary-refresh.md`

## 是什么

当一个 UI 状态来自异步请求，而且用户可以快速切换输入条件时，后发请求不一定后返回。request id guard 是一个轻量模式：每次刷新前递增一个本地序号，请求返回后只在序号仍然是最新时写入 state。

这次 Review summary 的刷新逻辑就是这个形状：

```ts
const requestId = ++requestIdRef.current;
setSummary({ status: "loading" });

const result = await getWorkspaceReview({ workspaceRoot });

if (requestId !== requestIdRef.current) return;
setSummary(toSummary(result));
```

## 为什么需要

React 的 state 不知道某个异步响应是不是已经过期。假设用户从 workspace A 快速切到 workspace B：

1. A 的 Review 请求先发出。
2. B 的 Review 请求后发出。
3. B 先返回并显示正确 summary。
4. A 后返回，如果没有 guard，就会把 B 的状态覆盖回 A。

这种 bug 不是类型错误，也不一定能靠普通 loading 状态避免。它通常只在网络慢、文件系统慢、用户快速切换时出现，所以很容易漏测。

## 怎么用

适合使用 request id guard 的条件：

- 同一个 state 可能被多次异步刷新。
- 刷新参数会变化，例如 workspace、query、scope、tab、filter。
- 旧结果没有继续展示的价值。
- 不一定需要取消真实请求，只需要忽略过期结果。

推荐写法：

```ts
const refreshIdRef = useRef(0);

const refresh = useCallback(async (nextInput: Input) => {
  const refreshId = ++refreshIdRef.current;
  setState({ status: "loading" });

  try {
    const data = await load(nextInput);
    if (refreshId !== refreshIdRef.current) return;
    setState({ status: "ready", data });
  } catch (error) {
    if (refreshId !== refreshIdRef.current) return;
    setState({ status: "failed", error });
  }
}, []);
```

## 常见陷阱

- 只保护 success，不保护 error：旧请求失败晚返回，也可能把新状态打成 failed。
- 把 request id 存在 state 里：这会引入额外 render，`useRef` 更适合这种不参与渲染的时序标记。
- 误以为 `setLoading(true)` 能解决竞态：loading 只能表达正在请求，不能证明返回值仍属于当前输入。
- 在应该保留多份结果的场景使用 guard：如果不同请求对应不同 cache key，应写入 keyed cache，而不是丢弃旧结果。

## 自检问题

- 这个异步结果返回时，用户看到的输入条件还一定是发请求时的条件吗？
- 旧请求失败晚返回时，会不会覆盖一个已经成功的新状态？
- 这里需要取消底层请求，还是只需要忽略过期响应？
