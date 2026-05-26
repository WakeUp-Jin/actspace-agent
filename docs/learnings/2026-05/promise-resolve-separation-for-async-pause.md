# Promise resolve 分离：异步暂停恢复模式

关联 history：`docs/histories/2026-05/20260526-1400-tool-approval-pause-resume.md`

## 是什么

将 `new Promise()` 的 `resolve` 函数从 Promise 构造函数中提取出来，存到外部数据结构中，在未来某个不确定的时间点由外部事件（如 IPC 消息、用户操作）调用 resolve，从而唤醒 await 这个 Promise 的代码。

```ts
let externalResolve: (value: string) => void;

const promise = new Promise<string>((resolve) => {
  externalResolve = resolve; // 把钥匙存起来
});

// 某处 await（被暂停）
const result = await promise;

// 某处 resolve（唤醒）
externalResolve("done");
```

## 为什么需要

Agent 执行循环需要在工具审核时暂停——等用户看到命令、做出决策后再继续执行。直觉方案（while 轮询、setTimeout 检查标志位）会阻塞事件循环或浪费 CPU。

Promise resolve 分离的优势：
- `await` 只暂停当前 async 函数，不阻塞事件循环。
- IPC 消息、UI 渲染、定时器等正常运转。
- 暂停时间不确定（可能 5 秒，可能 5 分钟），不需要预设轮询间隔。
- 可以用 `setTimeout` + 自动 resolve 实现超时取消。

## 怎么想

### 核心洞察：await 是注册回调，不是阻塞

JavaScript 的 `await` 本质上是把当前函数的后续代码注册为一个回调，等 Promise resolve 时再执行。它类似于：

```ts
promise.then((value) => {
  // await 后面的代码都在这里
});
```

所以 `await` 一个永远不 resolve 的 Promise 不会死锁——它只是永远不会继续执行这个函数，但 Node.js 事件循环照常运转。

### 模式结构：Registry + Gate

这个模式有两个角色：

- **Gate（接口）**：暴露 `waitForDecision()` 方法给消费方。消费方只知道"await 这个方法就能等到结果"。
- **Registry（实现）**：维护 `Map<id, { resolve, timer }>`，接收外部事件（IPC）并调用对应的 resolve。

分离的好处：消费方（ToolScheduler）在 agent-core 包里，不依赖 Electron。实现方（PendingApprovalRegistry）在 desktop 包里，知道 IPC。两者通过接口解耦。

### 陷阱：return vs return await

在 async 函数的 try-catch 中，`return someAsyncCall()` 和 `return await someAsyncCall()` 行为不同：

```ts
async function execute() {
  try {
    return runHandler(); // 如果 runHandler reject，catch 不会捕获！
  } catch (err) {
    // 不会执行
  }
}
```

因为 `return` 直接传递 Promise 给调用方，try-catch 来不及捕获 rejection。必须写 `return await runHandler()` 才能让当前函数的 catch 块生效。

## 核心要点

1. **`resolve` 函数可以存起来**：这是 Promise 规范的合法用法。resolve 被调用时，所有 await 这个 Promise 的代码恢复执行。
2. **Map 存 resolve 实现多路暂停**：每个待审核工具一个 entry，互不干扰。
3. **幂等是免费的**：从 Map 中 delete 后再 resolve 一次无效果（Promise 只能 resolve 一次）。
4. **超时用 setTimeout + resolve**：不需要 reject，直接 resolve 一个 `{ decision: "timeout" }` 让消费方统一处理。
5. **`return await` 不是冗余的**：在 try-catch 中，它保证异常被当前函数捕获。

## 常见陷阱

- 忘记清理 Map entry → 内存泄漏。必须在 resolve、超时、取消时都 delete。
- 忘记 clearTimeout → 超时回调在 resolve 后仍然触发，导致重复调用（虽然 Promise 只 resolve 一次，但 Map 操作可能出错）。
- `return asyncFn()` 在 try-catch 中不被捕获。
- 测试中 `const promise = scheduler.execute(...)` 后立即访问 gate 的 pending 列表——需要 `await tick()` 等一个微任务让内部的 async 走到 waitForDecision。

## 自检问题

1. 如果 resolve 函数丢失了（比如 Map 被意外清空），await 这个 Promise 的代码会怎样？
2. 一个 Promise 被 resolve 两次，第二次调用会发生什么？
3. 在什么场景下 `return await` 和 `return` 的行为完全一致，没有区别？
