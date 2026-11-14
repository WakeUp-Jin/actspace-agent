# Cordis 事件 ABI 与 Agent Loop 插入面

本文是 Cordis 原生事件契约与 Agent Loop 干预面/通知面的唯一规范，EventHub 已退役。

## 唯一事件机制

插件使用真实 Cordis Context 注册和分发事件。ActSpace 不维护 EventHub、第二份监听集合或手工调用 `events.dispatch()` 返回的 callbacks。`@actspace/cordis-adapter` 只提供类型、carrier 适配与通知监听异常隔离。

必须成功的动作使用明确 Service。例如 `session.checkpoint.flush()` 是持久化屏障，调用者必须等待并接收失败；不能靠“存在某个事件监听者”证明其执行。具体屏障位置见下文「Agent Loop 插入面」。

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

类型中的生命周期名称不代表每个名称都有生产发布者或订阅者；以源码里的发射和注册处为准，`pnpm check:harness-events` 校验声明与调用模式一致。恢复仍来自 Journal；WSS/IPC、投影订阅和 durable Journal 各有自己的协议，不能为了统一插件事件而机械替换。

## Subject 与 scope

`createAgentEventDispatcher()` 将真实 Agent subject 与 opaque scope carrier 绑定，拒绝身份不一致；`scopeContext()` 沿 Cordis filter chain 隔离 Agent。父 scope 可观察子 scope，兄弟 scope 不能串线。同一 descriptor 的两个运行实例也必须分离。

`serial`、`waterfall` 持有 scope 直到业务完成；通知不持有。新旧 Harness 独立装配，旧 Run 保留旧树至最后释放；不跨组合共享插件实例。Fiber/Effect 回收插件登记的监听和资源，Run 租约保护仍在执行的领域操作。

## 声明与验证入口

- `packages/composition/cordis-adapter/src/event-contract.ts`：Loop 名称与基础 typed events。
- `packages/core/agent-service/src/service.ts`、`packages/harness-evolution/harness-control/src/contracts.ts`、`packages/core/runtime/src/session/session-plugin.ts`：领域声明。
- `pnpm check:harness-events`：交叉检查显式发布调用与 `@mode`。
- `pnpm test:harness-events`：负向 fixture，不能接受错模式或未声明名称。
- `pnpm gen:contract-matrix`：从源声明生成目录；禁止手改生成物。
- cordis-adapter/core-agent 测试：continuation、bail、carrier、同步/异步异常、非阻塞 emit 和资源释放。

旧 EventHub 已退役，不增加兼容 alias。Session 事实与持久化只维护在 [Session 持久化规范](agent-spec-session-core-persistence-separation.md)。

## Agent Loop 插入面

模式、异常隔离和 scope 的共性规则见上文；本节只维护 Loop 边界。

### 八个干预点

| 插入点 | 模式 | 阶段与结果 |
| --- | --- | --- |
| `agent/pre-step` | waterfall | 接受、改写或跳过候选 step |
| `agent/request` | waterfall | 请求提交前生成/修改 LLM call config |
| `llm/stream` | waterfall | 包裹整个 Provider AsyncIterable，而非逐 chunk 观察 |
| `agent/request-error` | waterfall | 生成 retry/terminal decision |
| `tools/pre-execute` | waterfall | 参数物化后干预，结果再次校验，随后权限与审批 |
| `tools/execute` | waterfall | checkpoint 后包裹 executor 执行入口 |
| `tools/post-execute` | waterfall | body settle 后修饰输出；保留执行成败，异常记入 finalizerFailures 后继续清理 |
| `agent/turn-stopping` | serial | 本轮停止前返回第一个继续/停止决策 |

系统提示词、规则、Skill 和动态内容通过 Context 来源接口贡献；英语学习使用按 Session/Agent 隔离的 PromptExtensionRegistry。`system-prompt/assemble` 已移除，模型输入只有 Context 转换链路。

干预结果最终通过 Session 的 request、assistant、tool、step 等事实体现。监听本身不另建持久化。工具安全细节见 [Tool Runtime ABI](agent-spec-tool-runtime-abi.md)。

### 必须等待的 checkpoint

`session-checkpoint-policy` 提供 `session.checkpoint`：

```ts
flush({ sessionId, throughSeq, reason }): Promise<void>
```

Loop 等待四类屏障：

| reason | 要保证的行为 |
| --- | --- |
| `before-llm-dispatch` | 请求前已有事实写入完成 |
| `before-tool-body` | dispatch fact 持久化后才进入副作用边界 |
| `before-next-step` | 前一步结果落定后再开始下一步 |
| `after-turn-settled` | 终态持久化完成后才报告结算成功 |

生产 Context 缺少服务、目标 Session 不存活或 flush 失败，均传播错误。没有 Context 的单元执行保留直接 `session.flush()`。子 Session 必须在 Session runtime 注册到其 scope 释放，才能使用同一屏障。

`session/checkpoint` 不再是事件；`session/flush` 是完成后的观察通知。通知不能替代以上任何屏障。

### 观察面

| 通知 | 发布者/时机 |
| --- | --- |
| `agent/session-start` | Loop 绑定 Session、开始一次运行 |
| `agent/status` | Loop 或 Headless 状态变化 |
| `agent/error` | Loop 或 Headless 错误报告 |
| `llm/chunk` | 模型流中的即时观察 |
| `tools/result` | 工具结果被处理并追加相应事实后 |
| `session/event` | Session 内存接纳事件后，不承诺此时已 fsync |
| `agent/tasks-updated` | 调度器发布任务快照变化 |

以上均为 `emit`，不等待观察者。任务内容队列不保存模型配置；消息交付时读取当前配置。Run 固定 Harness 组合，任务中不切换 Loop。同一会话下一次运行可以使用最新成功启用的组合；子 Run 独立选择。

### 生命周期与验证

插件用 `apply(ctx, config)`、`ctx.on()` 和 Effect 接入。通知异步工作由插件拥有；真正的干预和 tool lease 仍由 scope/drain 等待。退出停止接纳、处理取消、等待业务与 checkpoint，再释放相应资源。

保护行为的测试归属：

- core-agent：subject/carrier 一致、父子与兄弟隔离、scope dispose 后拒绝调用、通知不延长 Run 生命周期。
- core-agent-loop：模型与工具 checkpoint 顺序、取消结算失败、stream/retry、干预和工具结果。
- checkpoint-policy：服务存在、等待 flush、存活 Session 校验与失败传播。
- boot/harness-control：新旧组合独立、失败候选不切换、最后 Run 释放后卸载。

CLI 单次运行、Desktop 会话与远端 Host 复用以上语义；真实界面验收与自动化测试分开报告。
