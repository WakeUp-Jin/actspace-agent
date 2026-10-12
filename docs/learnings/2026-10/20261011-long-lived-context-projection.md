# 长期 Context 与调用快照要分成两层

本轮上下文管理引擎 V2 的关键变化，是把“长期存在的 Context 状态”和“给一次模型调用使用的输入”拆成两层。这个模式适用于任何需要跨请求积累派生状态、又必须保证单次调用输入一致性的 Agent 系统。

## 为什么不能让 Context 直接等于快照

如果每个 step 都新建一个 Context，系统很容易把模块状态、会话恢复和当前请求混在一起：Conversation 每次都要全量重建，插件无法保留自己的水位，前端也无法区分“当前 Context”与“上一次实际发送的请求”。

更稳妥的模型是：Harness 在 `Session + logicalAgentScopeId` 下持有一个可恢复的长期实例；引擎从这个实例读取并组装内容，然后发布深冻结的 `LlmInput` 或 `ContextProjection`。模型和工具的输出先进入 Session Journal，再由 reducer 按 owner 更新 Context 的局部切片。

```text
Session Journal（事实和持久化权威）
        │ 事件 / durable watermark
        ▼
长期 Context 实例（模块状态、revision、恢复水位）
        │ 组装
        ├──▶ LlmInput（单次模型调用的不可变快照）
        └──▶ ContextProjection（Host/UI 的不可变只读投影）
```

## 局部 reducer 为什么比整体覆盖安全

Context 不是一个允许插件任意替换的“大对象”。每个 reducer 先声明自己拥有的字段，例如 conversation、tools 或 status；提交事件时只能返回这些字段的更新。引擎恢复时先从当前组装结果开始，再把 reducer 所拥有的切片恢复回来。这样新增一个用户记忆插件时，它只影响自己的 slice，不会覆盖系统提示词或工具状态。

## 恢复必须有水位

只记录 `revision` 不足以判断一个 Context 是否已经处理过 Journal。实例还需要 `throughJournalSeq`，reconcile 只回放上次水位之后的事件，并拒绝超过 `durableSeq` 的目标水位。遇到迟到的旧事件时，实例保留较新的内容和水位，只更新允许变化的 request 元数据，避免回退已经发布的状态。

## 常见陷阱

- 把 `requestId` 或模型名变化当成 Context 状态变化，会让模型切换误触发整棵 Context 重建。
- 只冻结返回值、不冻结内部切片，会让插件或前端通过引用偷偷修改已发布快照。
- 把 accepted 事件当成 durable 事件，会在持久化失败后发布无法恢复的 Context revision。
- 让 renderer 直接拿到 Context 实例，会把运行时可变状态泄漏到 UI；UI 应只接收序列化 Projection。

## 自检问题

1. 如果模型从 A 切到 B，哪些字段应该变化，哪些字段不应该因为模型名变化而重置？
2. 一个事件已经被 Context 处理过，但 Journal 尚未 durable，系统重启后应该依据哪个事实恢复？
3. 前端想显示当前 Context 时，为什么需要 Projection，而不是直接读取 Context 对象？

关联实现：`packages/context/src/instances.ts`、`reducers.ts`、`projection.ts`；关联设计：`docs/design-docs/上下文管理引擎设计/上下文管理引擎V2/`。
