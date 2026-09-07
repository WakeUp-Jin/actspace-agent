# Cordis 原生事件 ABI 与 EventHub 退役规范

> 状态：已执行；保留真实 Provider、真实工具副作用与 Desktop/Electron 为外部验收边界
>
> 日期：2026-08-29

本文定义 ActSpace Agent Runtime 的最终事件 ABI。目标不是把 API 名称改成 `ctx.on`、`ctx.waterfall`，而是让插件获得与 DSH/Cordis 一致的 continuation、bail、scope、错误隔离和生命周期语义。

本文覆盖 Agent Loop、Tool Runtime、Session 通知和 Runtime 生命周期事件；CLI `run` 是第一验收宿主，CLI `chat` 不在本轮实施范围内。

## 1. 终态决策

1. 插件公共事件 API 以真实 Cordis Context 为唯一运行时入口：`ctx.on()`、`ctx.once()`、`ctx.emit()`、`ctx.parallel()`、`ctx.serial()`、`ctx.waterfall()`。
2. `packages/cordis-adapter/src/events.ts` 中的自定义 `EventHub`、`createEventHub()`、`createCordisEventHub()` 和相关类型不属于终态架构。
3. EventHub 只作为本轮迁移的临时桥接层；迁移完成后删除源码、公共导出、测试、调用点和依赖类型，不保留兼容 alias、空实现或“仅供未来使用”的死代码。
4. 旧 `activate()` 事件注册方式不迁移。插件必须在自己的 Cordis fiber 中调用 `ctx.on()`，由 `ctx.effect` 自动拥有 disposer。
5. 核心事件使用 TypeScript declaration merging 扩展 Cordis `Events`，事件名、payload、`this` subject、`next` 参数和返回值必须可被编译器检查。
6. Agent subject 与 scope carrier 必须绑定，不能由调用方分别传入一个 Agent 和另一个 Agent 的 scope。

## 2. 四种调度语义

### 2.1 `emit`

`emit` 是同步、非阻断通知语义：调用方不等待 listener 返回值，也不使用返回值决定流程。

Agent、Session 和 Runtime 的通知消费者属于观察者；观察者的同步 throw 和异步 rejection 必须逐 listener 隔离并记录 diagnostics，不能阻断后续 listener，也不能撤销已提交的事实。

底层 Cordis 的通用 `ctx.emit()` 不自动承诺错误隔离。ActSpace 的 `agent/*`、`session/event` 等领域 Service 必须在自己的通知发布点执行 containment；不能把“调用了 ctx.emit”当作错误隔离的证明。

### 2.2 `parallel`

`parallel` 并发调用所有匹配 listener，并等待全部 settlement。适用于 `session/flush` 这类“所有持久化或观察者都必须完成”的 checkpoint。

`parallel` 的失败结果是聚合错误；调用方必须决定是否 fail closed。对于通知事件不得使用 `parallel` 代替 contained `emit`，否则一个观察者故障可能错误地改变业务流程。

### 2.3 `serial`

`serial` 按注册顺序等待 listener。listener 返回非 `null`、非 `false`、非 `undefined` 的值时立即停止，并把该值作为 dispatch 结果返回；没有 bail value 时继续下一个 listener。

`agent/turn-stopping` 使用 `serial`。stop listener 可以返回明确的继续/停止决策；后续 listener 不得在已有决策后再次修改结果。

### 2.4 `waterfall`

`waterfall` 是 around-middleware。最后一个参数是内建行为提供的 `next()`：

```ts
ctx.on("agent/request", async (payload, next) => {
  const request = await next()
  return { ...request, model: "replacement-model" }
})
```

执行关系如下：

```text
outer listener A
  -> await next()
      -> listener B
          -> await next()
              -> built-in behavior
          <- B 可改写结果
      <- A 可包装/改写结果
```

不调用 `next()` 会短路剩余链和内建行为；直接返回 replacement 是合法的短路方式。listener 可以在 `next()` 前后执行逻辑，但不能修改已经提交的 Session 事实。

禁止使用以下伪 waterfall：

```ts
// 禁止：第二个参数不是 next，且所有 listener 都被强制执行
handler(payload, context) => transformedPayload
```

## 3. Typed Events ABI

领域包通过 declaration merging 扩展 Cordis `Events`：

```ts
declare module "@deepseek-ai/cordis" {
  interface Events {
    "agent/request"(
      this: Scoped<Agent>,
      payload: AgentRequestPayload,
      next: () => Promise<LlmCallConfig>,
    ): Promise<LlmCallConfig>

    "agent/turn-stopping"(
      this: Scoped<Agent>,
      payload: TurnStoppingPayload,
    ): TurnStoppingDecision | undefined
  }
}
```

约束：

- Agent 事件的 payload 必须包含真实 `agent` subject，或由 fused dispatcher 注入；
- `this` 必须携带 scope carrier；
- waterfall 事件的最后一个参数必须是 `next`；
- serial/parallel/emit 事件不得伪造 `next`；
- 返回值必须表达该事件的决策语义，不能使用 `unknown` 逃逸；
- 事件声明是唯一的 payload 真源，插件不得自行复制第二份事件接口。

## 4. 九个 Agent Loop 插入点

| 事件 | 模式 | 内建 `next()` 行为 |
|---|---|---|
| `system-prompt/assemble` | waterfall | 生成默认 prompt assembly |
| `agent/pre-step` | waterfall | 接受当前候选 step |
| `agent/request` | waterfall | 生成当前 LLM call config |
| `llm/stream` | waterfall | 调用已选 Provider 并返回 `AsyncIterable` |
| `agent/request-error` | waterfall | 返回默认 terminal/retry decision |
| `tools/pre-execute` | waterfall | 接受已物化且通过基础校验的 tool call |
| `tools/execute` | waterfall | 调用 ActSpace 既有 executor shell |
| `tools/post-execute` | waterfall | 规范化、脱敏并准备提交 result |
| `agent/turn-stopping` | serial | 返回默认 stop decision |

关键调用边界：

1. `llm/stream` 必须包围整个模型 stream，而不是在消费每个 chunk 之后调用一个 serial observer。
2. `agent/request-error` 必须能够返回 retry decision；不能只通知错误后由 Loop 私有逻辑猜测恢复。
3. 三个 `tools/*` 事件围绕 ToolRuntime 的现有执行本体；事件层可以替换 policy、参数、外壳和 result，但不得重写 read/list/edit/bash/Browser Bridge executor 的行为契约。
4. 插入点没有独立持久化；其最终影响必须通过 `request/*`、`assistant/*`、`tool/*`、`step/*` 或 retry 扩展事件体现。

## 5. 通知与 Session 事件

五个主要通知仍是：

```text
agent/session-start
agent/status
agent/error
tools/result
session/event
```

其中：

- `agent/session-start`、`agent/status`、`agent/error`、`tools/result` 使用 contained `emit`；
- `session/event` 在 Journal append commit 后发布，observer 失败只进入 diagnostics；
- `session/flush` 是 `parallel` checkpoint，不是通知；
- `session/created`、`session/disposed`、`agent/created`、`agent/disposed`、`agent/inbox/*` 是生命周期通知，不计入五个主要通知；
- 任何通知都不是恢复事实，恢复必须从 Session Journal 重建。

发布顺序固定为：

```text
validate envelope
→ Journal append commit
→ contained session/event
→ projection/live observer
→ status/tools/result notification
```

## 6. Scope 与 subject

事件分发使用 Cordis scope chain，而不是 ActSpace 旧的 `kind + id` 精确匹配：

```text
runtime
└── preset
    └── agent
        └── child-agent / tool execution
```

规则：

- 父 scope 可以观察已授权的子 scope；
- 子 scope 不接收兄弟或后代 scope 的事件；
- Agent dispatch 同时绑定 payload 中的 Agent 和 `this` carrier；
- 跨 Agent 的只读观测订阅 runtime/session 事件；
- 修改某个 Agent 的 request、tool 或 turn 只能在该 Agent 的 scope 内进行；
- `ctx.effect` 负责 listener、timer、lease、subprocess 和 watcher 的逆序清理。

## 7. EventHub 退役清单

迁移结束时必须满足：

| 对象 | 终态动作 |
|---|---|
| `packages/cordis-adapter/src/events.ts` | 删除整个文件 |
| `packages/cordis-adapter/src/index.ts` | 删除 `events.ts` export |
| `packages/cordis-adapter/src/cordis-types.ts` | 删除 `EventHub`、`CordisActivationScope.events` 和相关 adapter 类型 |
| `packages/cordis-adapter/src/cordis-root.ts` | 不再创建或返回 EventHub；root 只暴露真实 Context |
| `packages/core/agent-loop/src/loop.ts` | 删除 EventHub dependency，直接使用 typed Context dispatch |
| `packages/core/agent-loop/src/service.ts` | 删除 `Pick<EventHub, "emit">`，改为 Context/typed notification seam |
| `packages/runtime/src/runtime/agent-factory-plugin.ts` | 删除 `createCordisEventHub` 和 `eventEmitter` |
| `packages/runtime/src/runtime/boot.ts` | 删除所有 `bootEvents`、bridge 和 legacy event wiring |
| `packages/tools/runtime/src/prepared-execution.ts` | 删除 `events?: EventHub`，改为 ToolRuntime 持有的 typed Context |
| `packages/headless/src/runner.ts` | 删除 EventHub 类型依赖，订阅 Context 或 Agent Service |
| `packages/headless/src/plugin.ts` | 删除 bridge 创建，直接注入 Context service |
| `packages/cordis-adapter/tests/events.spec.ts` | 删除旧 EventHub 测试，改为真实 Cordis contract tests |
| 所有 `createEventHub` / `createCordisEventHub` 引用 | 搜索结果必须为空 |

EventHub 删除不包含删除真实 Cordis 的 `EventsService`；删除的是 ActSpace 自己的重复事件层。

## 8. 验收矩阵

### 8.1 Waterfall

- listener A 在 `next()` 前执行；
- listener B 在 A 的 `next()` 内执行；
- built-in behavior 是最内层；
- A 可以包装 B/built-in 的结果；
- 不调用 `next()` 时，后续 listener 和 built-in 不执行；
- `llm/stream` 可以返回自定义 `AsyncIterable`；
- `agent/request-error` 可以返回 retry/abort/escalate decision。

### 8.2 Serial / Parallel / Emit

- serial 按顺序 await，首个 bail value 停止后续 listener；
- parallel 并发执行并等待全部 settlement；
- contained emit 中一个同步 throw 或异步 rejection 不阻断其他 listener；
- 通知失败不回滚已提交 Session 事件。

### 8.3 Scope / Lifecycle

- 两个 Agent 的干预互不串线；
- parent scope 可按规则观察 child scope；
- plugin fiber dispose 后 listener 不再执行；
- root dispose 等待 in-flight waterfall/serial/parallel 和 tool lease；
- 没有 EventHub、`EventContext` 或 bridge 的运行时引用。

## 9. 非目标与延期项

- 本轮不做 CLI chat 的交互式 inbox UX；
- 本轮不做动态不可信插件的沙箱执行；
- 本轮不把 DSH 所有能力事件一次性迁移到 ActSpace；先完成 Agent、Tool、Session、Runtime 四个事件域；
- `bail` 保留为底层 Cordis 能力，但不是 Agent Loop 首批公共领域事件；
- Session 数据不迁移、不双写、不提供旧 EventHub 兼容读取。

## 10. 最脆弱假设

本规范假设当前锁定的 `@deepseek-ai/cordis` runtime family 可以在 ActSpace 的真实 Loader、测试 double、CLI managed ESM 和 Desktop host 中统一提供 typed waterfall、serial、parallel、scope filtering 和 effect cleanup。若该假设不成立，不能恢复自定义 EventHub；应在 `@actspace/cordis-adapter` 内修正公开 Context 类型和测试 fixture，保持领域包只依赖 Cordis ABI。
