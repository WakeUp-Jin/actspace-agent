# 内存采样工具

从 app 启动一直录到退出：
- 每 0.5 秒记一次各进程的内存、CPU 和主线程延迟；
- 全程开着 V8 分配采样，包括已经被 GC 回收的对象。

录完之后，可以按函数统计「谁分配了多少 MB」、按调用链查来源，也能对比两轮的差异。

适用场景：
- 用户反馈卡顿、内存高；
- 改了高频路径（见 [性能与内存约定](../../coding-standards/perf-memory-conventions.md)）之后做实机对比。

要做的优化和每轮的结果记在 [性能待办](../../exec-plans/perf-backlog.md)。

脚本在 `scripts/diagnostics/heap-monitor/`：
- `monitor.mjs`：录制；
- `analyze.mjs`：分析。

录下的数据放在 `tmp/heap/<runN>/`，不进仓库。

## 录一轮

1. 用调试端口启动 app。主进程 inspector 用 9229，界面进程用 9230，都只绑本机：

   ```bash
   ACTSPACE_INSPECT_MAIN=9229 pnpm dev
   ```

2. 另开一个终端开始录：

   ```bash
   node scripts/diagnostics/heap-monitor/monitor.mjs tmp/heap/run9
   ```

   - 加 `--wait-new`：已经在跑的 app 不录，等你重启后从启动那一刻开始录。
   - 端口不是 9229 时，录制这边也设同样的 `ACTSPACE_INSPECT_MAIN`。

3. 在 app 里做要测的操作。尽量和上一轮做同样的事：同样的会话数、同样的提问，自动审查和子 Agent 开关也和上一轮一致。这样两轮的数字才能比。

4. 在录制的终端按 Ctrl+C，或者直接退出 app。最后一段采样会自动保存。

录下来的文件：

| 文件 | 内容 |
|---|---|
| `samples.jsonl` | 每 0.5 秒一行：主进程堆和 RSS、各 Electron 进程的工作集和 CPU、界面进程堆、主线程延迟 |
| `main-NNN.heapprofile` | 主进程分配采样，每 60 秒一段 |
| `renderer-NNN.heapprofile` | 界面进程分配采样，每 60 秒一段 |

`.heapprofile` 也可以拖进 Chrome DevTools 的 Memory 面板查看。

## 分析

```bash
A=scripts/diagnostics/heap-monitor/analyze.mjs

# 每 30 秒一行：堆、RSS、主线程延迟、CPU、界面进程内存
node $A summary tmp/heap/run9

# 分配最多的函数：自身分配，以及包含它调用的函数在内的分配
node $A top tmp/heap/run9 main --top=30
node $A top tmp/heap/run9 renderer --filter=components/messages

# 某个函数的分配是从哪些调用方来的（往上 5 层）
node $A callers tmp/heap/run9 main '^readEvents$' --depth=5

# 两轮对比（按函数的包含分配）
node $A compare tmp/heap/run8 tmp/heap/run9 main --top=30
```

### 怎么读

- **自身分配：** 内存就是在这个函数里申请的，例如 `JSON.parse`、字符串拼接、数组复制。
- **包含分配：** 这个函数加上它调用的所有函数一共分配了多少。看是哪段业务代码引发的，主要看这一项。
- **数字的含义：** 是采样期间**累计分配**了多少，不是常驻内存。分配多会让 GC 更频繁、CPU 更高、主线程延迟更大。常驻内存看 `summary` 里的堆和 RSS。
- **对比两轮：** 两轮的工作量不同时（时长、请求数、自动审查次数），合计分配不能直接比，要按具体函数比，或者除以请求数。
- **跨版本对比：** 主进程代码是打包后的，函数名后面的文件名可能是 `agent-factory.js`、`chunk-XXXX.js` 这种。按函数名找，不要按行号找。

## 常见热点的样子

| 现象 | 通常的原因 |
|---|---|
| `readEvents event-history.js`、`snapshotSessionJson` 很大 | 有代码在高频路径上整份读日志，内存窗口外的事件逐行从文件解析。用 `callers` 查是谁 |
| `parseStreamingJson`、`repairJson` 很大 | 模型流式返回工具参数时，每个片段都把已收到的全部参数重新解析一遍 |
| 界面进程 `renderRootSync`、`beginWork` 很大 | React 重新渲染太多，用 `--filter=` 限定到组件目录再看 |
| `summary` 里堆呈锯齿状大幅波动 | 短时间内大量分配又回收，按上面的方法找分配源 |
