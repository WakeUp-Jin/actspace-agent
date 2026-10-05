# Cordis 原生事件 ABI 与 EventHub 退役规范

状态：P5 源码契约，2026-10-04 校准；自动化与实机验收分别见 [P5 摘要](../../exec-runs/20261003-agent-harness-host-refactor/phase-5-summary.md)。

## 唯一事件机制

插件使用真实 Cordis Context 注册和分发事件。ActSpace 不维护 EventHub、第二份监听集合或手工调用 `events.dispatch()` 返回的 callbacks。`@actspace/cordis-adapter` 只提供类型、carrier 适配与通知监听异常隔离。

必须成功的动作使用明确 Service。例如 `session.checkpoint.flush()` 是持久化屏障，调用者必须等待并接收失败；不能靠“存在某个事件监听者”证明其执行。具体屏障位置见 [Loop surface](agent-spec-agent-loop-cordis-surface.md)。

## 分发模式

模式是公开契约，声明用 `@mode`，调用必须匹配。以当前锁定 Cordis 的行为为准：

| 模式 | 行为 | 用途 |
| --- | --- | --- |
| `emit` | 按注册顺序调用，不等待返回的 Promise，不消费返回值 | 状态与事实通知 |
| `waterfall` | continuation/around 语义；handler 可 `await next()` 包裹下游或短路，调用方等待业务结果 | prompt、request、stream、工具扩展 |
| `parallel` | 并行等待匹配 handler | 明确要求等待的并行扩展；不是本项目 checkpoint 或纯通知 |
| `serial` | 按序等待；首个非 null/false/undefined 结果终止后续调用 | `agent/turn-stopping` |
| `bail` | 同步按序寻找 bail 值 | Cordis 原生能力；当前 Loop 无领域调用点 |

`waterfall` 不等于遍历数组并依次改写 payload：

```ts
ctx.on("agent/request", async (payload, next) => {
  const request = await next()
  return { ...request, model: "replacement-model" }
})
```

不调用 `next()` 会短路下游。权限、审批、参数复检、checkpoint、工具执行事实与 Journal invariant 仍由领域 Service 守住，不能被插入点绕过。

## 通知的错误与生命周期

`emitNotification(ctx, type, payload, carrier?)` 只调用原生 `ctx.emit()`，返回 `void`。不等待观察者，不因通知为 Run scope 获取租约。

通知监听注册时包装 `containNotification(ctx, listener)`：同步 throw 与异步 rejection 进入 Cordis logger，兄弟监听继续收到通知。包装保留 `this` carrier，不维护注册表，不替代 `ctx.on/once`、Fiber 或 Effect 的注销能力。

```ts
ctx.on("session/event", containNotification(ctx, function (event) {
  service.observe(this?.sessionId, event)
}))
```

包装只用于通知，不用于 waterfall、serial 或必需 Service；后者失败必须传播。异步观察者自己持有队列、AbortController 或在途任务，退出时停止接纳并等待/取消自己的工作。`emit()` 返回不代表观察者完成，清理插件也不自动撤销已发生的外部文件、网络或进程副作用。

生产订阅者包括 English-learning 的 Session 观察、Host tasks 订阅和 Desktop tasks 订阅。English-learning 由 SpeechQueue 负责终止和等待；Host 的上传维护归 bootstrap 所有，停止计时器后等待当前维护任务。通知包装不引入通用后台任务调度器。

## 通知与持久事实

- `session/event`：Session 内存接纳成功后发布；接纳与排队持久化不等于 fsync。观察者失败不能撤销已接纳事实。
- `session/flush`：显式持久化完成后的 `emit` 通知。真正的屏障是 Service 的 Promise，不能等待此通知来证明写入成功。
- `agent/status`、`agent/error`、`agent/session-start`、`llm/chunk`、`tools/result`：Loop/Headless 的运行观察。
- `agent/tasks-updated`：任务快照变化；`harness/selection-updated`：组合选择变化。
- `session/created`、`session/disposed`：会话生命周期观察。

类型中的生命周期名称不代表每个名称都有生产发布者。当前发布者、订阅者和资源归属见 [P5 事件清单](../../exec-runs/20261003-agent-harness-host-refactor/phase-5-event-inventory.md)。恢复仍来自 Journal；WSS/IPC、投影订阅和 durable Journal 各有自己的协议，不能为了统一插件事件而机械替换。

## Subject 与 scope

`createAgentEventDispatcher()` 将真实 Agent subject 与 opaque scope carrier 绑定，拒绝身份不一致；`scopeContext()` 沿 Cordis filter chain 隔离 Agent。父 scope 可观察子 scope，兄弟 scope 不能串线。同一 descriptor 的两个运行实例也必须分离。

`serial`、`waterfall` 持有 scope 直到业务完成；通知不持有。新旧 Harness 独立装配，旧 Run 保留旧树至最后释放；不跨组合共享插件实例。Fiber/Effect 回收插件登记的监听和资源，Run 租约保护仍在执行的领域操作。

## 声明与验证入口

- `packages/cordis-adapter/src/event-contract.ts`：Loop 名称与基础 typed events。
- `packages/agent-service/src/service.ts`、`packages/harness-control/src/contracts.ts`、`packages/runtime/src/session/session-plugin.ts`：领域声明。
- `pnpm check:harness-events`：交叉检查显式发布调用与 `@mode`。
- `pnpm test:harness-events`：负向 fixture，不能接受错模式或未声明名称。
- `pnpm gen:contract-matrix`：从源声明生成目录；禁止手改生成物。
- cordis-adapter/core-agent 测试：continuation、bail、carrier、同步/异步异常、非阻塞 emit 和资源释放。

旧 EventHub 已退役，不增加兼容 alias。详细 Loop 调用阶段只维护在 [Loop surface](agent-spec-agent-loop-cordis-surface.md)，Session 事实与持久化只维护在 [Session 持久化规范](agent-spec-session-core-persistence-separation.md)。
