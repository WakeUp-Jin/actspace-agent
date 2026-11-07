# 用 request id guard 防止旧请求覆盖新 UI 状态

合并自：用 request id guard 防止旧请求覆盖新 UI 状态（Review summary 刷新）、异步目录加载需要 request identity（slash 命令菜单）。

关联：`docs/histories/2026-06/20260604-0307-review-summary-refresh.md`、`docs/histories/2026-07/20260730-1419-composer-slash-command-menu.md`

## 问题

UI 状态来自异步请求，且用户能快速切换输入条件（workspace、账号、项目、query、tab、filter、强制 Retry）时，后发请求不一定后返回：

```text
请求 A(workspace-a) 发出 → 切到 workspace-b → 请求 B 发出并先返回，界面显示 B → 请求 A 后返回，界面被覆盖成 A
```

React state 不知道响应是否过期；缓存 key 只能避免重复请求，不能判断在途响应是否仍属于当前 UI；`setLoading(true)` 只能表达“正在请求”，不能证明返回值属于当前输入。这类 bug 不是类型错误，只在网络/文件系统慢且用户快速切换时出现，很容易漏测。

## 解决：单调递增的 request id，响应、错误、loading 收尾都先验证

```ts
const refreshIdRef = useRef(0);
const refresh = useCallback(async (input: Input) => {
  const id = ++refreshIdRef.current;
  setState({ status: "loading" });
  try {
    const data = await load(input);
    if (id !== refreshIdRef.current) return;
    setState({ status: "ready", data });
  } catch (error) {
    if (id !== refreshIdRef.current) return;
    setState({ status: "failed", error });
  } finally {
    if (id === refreshIdRef.current) setLoading(false);
  }
}, []);
```

这是拒绝过期响应提交状态，不是取消网络请求；底层支持 `AbortController` 时可同时取消旧请求省资源，但提交前的 identity 检查仍是最后防线。适用条件：同一 state 会被多次刷新、参数会变、旧结果没有继续展示价值。

## 陷阱

- 只保护 success 不保护 catch：旧请求晚失败会把新的成功状态打成 failed。
- 无条件在 `finally` 关 loading：旧请求让仍在进行的新请求提前结束 loading。
- request id 放 state：多一次 render；用 `useRef`。
- 只比较参数字符串：同一 workspace 的强制 Retry 也产生并发请求，request id 能统一处理。
- 参数变化后清 cache 却不隔离在途请求：旧响应仍会写回。
- 应保留多份结果的场景（不同 cache key）不要用 guard 丢旧结果，写入 keyed cache。
- effect 里的异步响应同样要检查本次 effect 是否已失效（先开 A 再开 B，A 迟到不能覆盖 B）。

## 自检

1. 响应返回时，用户看到的输入条件还一定是发请求时的条件吗？
2. 旧请求失败晚返回，会覆盖已成功的新状态吗？
3. Retry 与自动加载并发时，哪个请求有权结束 loading？
4. 需要取消底层请求，还是只忽略过期响应？
