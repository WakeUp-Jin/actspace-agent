# Agent 长命令的「超时转后台 + turn 边界事件注入」模式

> 提炼自：`docs/histories/2026-07/20260703-1555-bash-background-execution-model.md`

## 是什么

Agent 的 bash 工具处理长命令的一种执行模式：前台等待参数不叫 `timeoutMs` 而叫 `blockMs`——它约束的是**模型等多久**，不是**进程活多久**。到点后进程不杀、输出继续落盘，工具立即返回 `{ status: "backgrounded", taskId, outputFilePath }`；进程的后续状态（退出、关键日志出现、疑似卡死）以结构化通知在 **turn 边界**注入模型上下文。

## 为什么需要

传统「超时 = 杀进程 + 报错」对两类命令是灾难：

1. `pnpm dev` 这类常驻进程：「一直活着」就是成功状态，超时杀掉等于毁掉任务目标。
2. 慢构建/测试：杀掉重跑浪费，模型还常常改用 `timeout 300 pnpm build` 之类的 workaround。

反过来，如果让工具调用一直阻塞到进程结束，agent loop 就被一条命令锁死，也做不了别的事。「转后台」把两难解开：工具调用有界返回，进程生命周期与工具调用解耦。

## 关键设计点

1. **事件回流走 steering 注入，不走轮询**。发起命令的工具调用早已返回，后台事件不是工具结果，无法塞回原 tool_result。正确的注入点是 agent loop 每次调 LLM 前的 steering message 检查（loop 通常已有这个 hook，接上即可）。配套地，工具描述必须明确禁止 `sleep N && check` 轮询，否则模型会自己发明轮询。
2. **三个事件源覆盖全部场景**：终态通知（一次性命令）、输出订阅（常驻进程永不退出，终态通知一辈子不会来——这是订阅存在的唯一原因）、卡死看门狗（「无输出增长」+「尾行像交互提问」双条件，缺一必误报慢构建）。
3. **竞态必须处理**：blockMs 到点的瞬间进程恰好退出 → 撤销转后台，按前台结果返回全量输出，并抑制冗余通知。用「进程句柄 + settled 标志」实现：`Promise.race([handle.wait, timer])` 之后再查一次 `handle.settled`。

## 常见陷阱

- **detached 子进程不随宿主退出**。为了进程组信号（杀掉整棵进程树）spawn 时用了 `detached: true`，代价是 app 退出时它们变孤儿。必须在退出钩子里显式收割（对进程组发 SIGTERM），且要用同步路径——Electron 的 `before-quit` 不会等 async 回调。
- **跨 turn 状态不能挂在每 turn 新建的对象上**。本仓的 Agent 及其 deps 每个 turn 都重建，任务注册表若做成 Agent 成员变量，turn 结束就丢。要放模块级单例（按 sessionId 分组），这与「进程活不过 app 退出，注册表不需要持久化」是自洽的。
- **权限层的 `sanitizedArgs` 会静默吃掉新参数**。permission checker 返回归一化参数替换原始 args 传给 handler，新增工具参数（`intent`、`notifyOnOutput`）若不显式透传，在生产链路上会消失——而直接调 executor 的单测发现不了这个洞。加参数时永远检查 sanitizedArgs 的构造处。
- **模型写的正则要防 ReDoS**：订阅 pattern 限长、行截 4KB 再匹配、编译失败直接工具报错，三道防线都便宜，别省。

## 自检问题

1. 为什么输出订阅（notifyOnOutput）不能用终态通知替代？（常驻进程永不退出）
2. 看门狗为什么必须双条件？只用「45s 无输出」会怎样？（慢构建全部误报）
3. blockMs=0 的语义是什么，和 `command &` 有什么本质区别？（注册表托管 + 事件回流 + 会话收割 vs 完全失控的孤儿进程）
