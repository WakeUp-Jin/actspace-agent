# Subprocess timeout must resolve

来源：`docs/histories/2026-07/20260703-0955-bash-timeout-returns.md`

## 是什么

对子进程设置 timeout 时，不能只调用 `child.kill("SIGTERM")` 然后继续等待 `close`。对 Agent 工具来说，timeout 的真正契约是：到点后工具必须返回一个结构化结果，让 Agent Loop 可以继续执行。

## 为什么需要

`SIGTERM` 只是一个请求，不是完成事件。命令可能通过 shell 启动了子进程，真正长跑的是孙进程；也可能进程忽略 `SIGTERM`，或者仍然持有 stdout/stderr pipe。此时父进程的 `close` 事件可能迟迟不触发，工具 Promise 就会一直挂起。

Agent Loop 遇到这种状态时不会进入下一轮：日志里通常只看到 `tool_started`，看不到 `tool_finished`、`turn_end` 或 `run_finished`。

## 怎么做

更稳的 timeout 路径应该包含三层：

1. 超时到点立刻标记 `timedOut = true`。
2. 尝试终止整组进程：非 Windows 平台可用 detached process group，并对 `-pid` 发信号。
3. `SIGTERM` 后给一个短暂 grace period，再发 `SIGKILL`，并且主动 resolve 当前已捕获输出。

示意：

```ts
timer = setTimeout(() => {
  timedOut = true;
  signalProcessGroup(child, "SIGTERM");

  killTimer = setTimeout(() => {
    signalProcessGroup(child, "SIGKILL");
    resolveTimedOutResult();
  }, 500);
}, timeoutMs);
```

## 核心要点

- `kill` 不是 `await`，它不会保证进程已经退出。
- `exit` 只表示进程结束，`close` 还要等 stdio 关闭；被子进程继承的 pipe 会拖住 `close`。
- 对工具系统来说，超时本身就是一个合法结果，不应该依赖底层进程自然收尾。
- 强制 resolve 后，late `close` / `error` / stream chunk 都要通过 `settled` guard 忽略，避免重复 resolve 或向已关闭 stream 写入。

## 常见陷阱

- 只杀 shell，不杀进程组：`bash -lc "npm run dev"` 里真正长跑的 dev server 可能继续活着。
- 只升级到 `SIGKILL`，但仍然等 `close`：如果 pipe 没关，Promise 仍可能不返回。
- 强制返回后继续处理 stream chunk：可能写入已经 `end()` 的 file stream。

## 自检问题

1. 为什么 `child.kill("SIGTERM")` 后仍然可能没有 `close`？
2. `exit` 和 `close` 的差别是什么？
3. 对 Agent Loop 来说，为什么 timeout 应该返回结构化结果，而不是继续等待进程？
