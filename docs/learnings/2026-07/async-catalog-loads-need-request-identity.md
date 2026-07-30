# 异步目录加载需要 request identity

## 是什么

当 UI 根据 workspace、账号、项目或筛选条件异步加载目录时，仅记录“当前参数已加载”并不足以保证状态正确。用户快速切换参数后，旧请求可能晚于新请求返回，最终把旧数据覆盖到新界面。

## 典型竞态

```text
请求 A(workspace-a) 发出
用户切换到 workspace-b
请求 B(workspace-b) 发出并先返回，界面显示 B
请求 A 后返回，界面被错误覆盖为 A
```

缓存 key 只能避免重复请求，不能判断一个已经在途的响应是否仍然属于当前 UI 状态。

## 解决模式

为每次真实加载生成单调递增的 request id。响应、错误和 loading 收尾都必须先确认自己仍是最新请求：

```ts
const requestId = latestRequestRef.current + 1;
latestRequestRef.current = requestId;

try {
  const result = await loadCatalog(scope);
  if (latestRequestRef.current !== requestId) return;
  setItems(result.items);
} catch (error) {
  if (latestRequestRef.current !== requestId) return;
  setError(toMessage(error));
} finally {
  if (latestRequestRef.current === requestId) setLoading(false);
}
```

这不是取消网络请求，而是拒绝过期响应提交状态。若底层支持 `AbortController`，可以同时取消旧请求以节省资源，但提交前的 identity 检查仍是稳妥的最后防线。

## 常见陷阱

- 只保护成功响应，不保护 `catch`：旧请求的错误会覆盖新请求的成功状态。
- 无条件在 `finally` 里关闭 loading：旧请求可能让仍在进行的新请求提前结束 loading。
- 只比较 workspace 字符串：同一 workspace 的强制 Retry 也会产生多个并发请求，request id 能统一处理。
- 组件参数变化后清空 cache，却不隔离在途请求：旧响应仍可写回。

## 自检问题

1. 用户连续切换两次 workspace 时，最慢的响应会不会赢？
2. 旧请求失败时，会不会把新请求已经加载成功的目录改成 error？
3. Retry 与自动加载并发时，哪个请求有权结束 loading？

来源：`docs/histories/2026-07/20260730-1419-composer-slash-command-menu.md`。
