# Cordis 插件激活与 Effect 所有权

## 核心结论

在 Cordis 中，插件“能执行”与“资源能被正确回收”是两件事。Behavior 应通过真实 `Context` 注册 `ctx.on()`、`ctx.provide()`、`ctx.plugin()` 和 `ctx.effect()`；需要持有资源时，优先把 disposer 放进 `ctx.effect()`，不要只依赖普通函数 `apply()` 的返回值。

## 为什么容易踩坑

Cordis 会根据函数形态判断插件是否像构造器。一个具名普通函数可能进入 constructor 路径：函数体仍会运行，因此启动看起来成功，但函数返回的 disposer 会被构造语义丢弃。结果是服务和监听器正常出现，关闭时自定义资源却没有释放。

这类问题很隐蔽，因为：

- 启动测试通常只验证 service 是否存在；
- 监听器由 Cordis Fiber 自动回收，看起来 disposal 也部分正常；
- 只有插件自己返回的 timer、文件句柄或后台任务 disposer 会泄漏。

## 稳定做法

### 1. Loader 适配器使用对象插件和箭头 apply

```ts
return {
  name: entryId,
  inject,
  apply: (ctx, config) => behaviorApply(ctx, config),
}
```

适配器不把模块导出的普通函数原样交给 Cordis，而是包装为明确的对象插件。这样返回值由普通插件调用路径收集，不会误入 constructor 语义。

### 2. 插件资源使用 ctx.effect 所有权

```ts
export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(run, 1000)
    return () => clearInterval(timer)
  }, 'poller')
}
```

Effect 与当前 Fiber 绑定，插件卸载、Include 更新或 root dispose 时都会按生命周期清理。

### 3. 生命周期测试必须验证关闭后的事实

不要只断言 `ctx.get('service')`。还应验证：

- listener 已注销；
- child plugin 已 dispose；
- timer/后台任务已停止；
- apply 失败后 root 没有残留 Fiber；
- dispose 重复调用保持幂等。

## 可迁移的设计模式

“框架拥有生命周期，插件只声明 Effect”适用于任何可热更新或可组合的同进程插件系统。Host 不应收集一堆来源不明的 disposer 再猜测关闭顺序；资源应在创建时绑定到明确的 scope/fiber，由框架按树形生命周期反向释放。

## 来源

本结论来自 ActSpace DSH 风格 `cordis.yml + Include + Loader` 启动重构及其真实 Cordis lifecycle fixture。
