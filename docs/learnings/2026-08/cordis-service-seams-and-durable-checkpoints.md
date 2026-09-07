# Cordis Service seam 与 durable checkpoint 的分层

## 是什么

一个可替换的运行时能力应拆成三层：Definition 描述稳定契约，Provider 持有具体实现和外部资源，Consumer 只依赖 Definition。Cordis Service 负责把 Provider/Consumer 放进 Context 与 Fiber 生命周期，而不是让 Runtime 通过 `new` 形成第二套容器。

Session 同时还需要区分两个时间点：`session/event` 是事实已经被 writer 接受并提交后的 post-commit 通知；`session/flush` 是调用方等待到 durable checkpoint 的边界。把两者混成一个回调，会让观察者失败、写入失败和关闭失败无法分别诊断。

## 为什么需要

普通 class 即使被放进 `ctx.provide()`，也不自动拥有 Cordis 的依赖重载、Fiber unregister 和 Effect cleanup。反过来，直接让 live Session 知道 JSONL 文件布局，又会让未来的 SQLite/远程 provider 迁移变成 AgentLoop 和 UI 的联动改造。

## 怎么用

```ts
const definition = defineServiceDefinition({
  id: "session.persistence",
  description: "Durability provider",
})

class JsonlPersistenceService extends Service {
  static inject = ["actspace.host.session", "session.journal"]

  constructor(ctx: CordisServiceContext) {
    super(ctx, "session.persistence")
    ctx.effect(() => () => undefined, "session.persistence")
  }
}
```

SessionStore 只调用 `SessionPersistence.create/open/inspect/fork`；JSONL provider 内部继续复用 writer、lease 和 recovery 算法。append 完成后发 `session/event`，显式 `flush()` 完成后再发 `session/flush`。

## 核心要点

1. Cordis Service 的价值是 ownership：注册、依赖、卸载和 effect 都有唯一 owner。
2. Provider seam 应隐藏文件/协议细节，Consumer 不应导入 Provider 私有 class。
3. post-commit observer 可以是 fire-and-forget；durable checkpoint 必须是可等待、可失败、可观测的边界。
4. 具体 executor、序列化算法和 projection 不需要为了 Service 化而重写。

## 常见陷阱

- 只把 `new X()` 移到 `apply(ctx)`，却没有让 X 通过 `super(ctx, name)` 注册，属于表面 Service 化。
- 在 `session/event` 回调里做 writer 写入，会形成隐式双写或递归；持久化应先完成，事件才代表已提交事实。
- 将 Context/Fiber/Provider 实例返回给 Host facade，会重新泄漏内部生命周期，破坏 Definition 边界。
- 依赖 package 的 `dist` 未重建时，workspace typecheck 可能读到旧导出；先构建依赖闭包再判断类型错误是否真实。
