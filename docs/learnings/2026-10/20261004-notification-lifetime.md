# 插件副作用的释放权：Effect 所有权、通知观察者生命周期、依赖顺序关闭

合并自四篇：不等待通知仍要管理观察者生命周期、把继承钩子改成通知时谁负责释放副作用、Cordis 插件激活与 Effect 所有权、释放资源也需要依赖顺序。主线：**框架能回收监听器和服务，但不能撤销已发出的请求、已写入的文件，也不知道跨服务的先后关系；这些要由创建副作用的一方声明释放，并由 Host 编排顺序。**

## 1. 通知只说明“发生了什么”，观察者自己拥有它启动的工作

`emit()` 返回只表示通知已分发。误写成 `await Promise.allSettled(listeners)` 会让日志、语音、界面观察者拖住任务结算；全部 fire-and-forget 又可能在插件卸载后访问已关闭的资源。把两个等待拆开：发布者只等业务必需操作，观察者的插件在退出时等待或取消自己的工作。

```text
业务任务 → await checkpoint.flush() → emit(status) → 任务结束
                                        ↓ 观察者同步接纳到自己的队列
                                        ↓ 插件 dispose → stop queue → await pending
```

- checkpoint 是正确性屏障，不存在或失败就不能跨越副作用边界；通知是观察，单个监听者同步 throw/异步 rejection 在注册处捕获并诊断，不阻断兄弟观察者（异步回调要接住返回 Promise 的 rejection，只在 emit 外层 try/catch 不够）。
- 继承钩子（`onPreparing()` 之类）改成通知后，插件仍拥有它启动的请求、计时器和退出等待。例：自动标题——主任务发准备通知，标题插件启动独立请求；生成失败不阻断主任务，用户手动命名必须胜过迟到的结果，所以命名通知的监听器在同步部分取消旧请求，写入前再检查取消状态与当前标题。`emit` 不等待，不等于不用考虑顺序。
- 销毁时取消全部请求并等待收尾，切换组合前的 idle 检查也要看到后台任务。移除监听器收不回已发出的网络请求，更撤销不了已写入文件。
- `clearInterval()` 只阻止下一次回调，不取消在途上传；关闭顺序是停止调度 → 等待在途 Promise → 释放存储。

三问：发布者必须等这个动作吗？异步工作由谁持有（AbortController 在谁手里）？退出时谁证明它已停止？答不出来，把钩子改成事件只是搬动代码。能答出来，通常不需要再引入事件总线或通用后台调度器。

## 2. Cordis 中“能执行”不等于“资源能回收”

Cordis 按函数形态判断插件是否像构造器。具名普通函数可能进入 constructor 路径：函数体照常运行、启动看起来成功，但函数返回的 disposer 被构造语义丢弃。服务和监听器正常出现（监听器由 Fiber 自动回收，disposal 看似部分正常），只有插件自己返回的 timer、文件句柄、后台任务 disposer 泄漏；启动测试通常只验证 service 存在，发现不了。

稳定做法：
1. Loader 适配器用对象插件 + 箭头 apply：`{ name: entryId, inject, apply: (ctx, config) => behaviorApply(ctx, config) }`，不把模块导出的普通函数原样交给 Cordis。
2. 资源用 `ctx.effect(() => { const t = setInterval(run, 1000); return () => clearInterval(t) }, 'poller')` 绑定到当前 Fiber，插件卸载、Include 更新、root dispose 都会清理。
3. 生命周期测试验证关闭后的事实：listener 已注销、child plugin 已 dispose、timer/后台任务已停、apply 失败后 root 无残留 Fiber、重复 dispose 幂等。

可迁移：框架拥有生命周期，插件只声明 Effect；Host 不收集来源不明的 disposer 再猜顺序，资源创建时就绑定到明确 scope/fiber，由框架按树形反向释放。

## 3. 关闭顺序由“谁在关闭期间仍会调用谁”决定

“全部 dispose 了”不代表关闭正确：Session 关闭时还要写最后一条事件，而 storage 已被另一个清理回调关闭，正常退出也会丢最后的状态。不要按插件注册顺序猜：A 关闭时仍需调用 B，就先完成 A 再释放 B。Agent 的正常顺序：停止接纳并排空执行 → Session 最后写入与 flush → 释放存储与插件树。Cordis 作用域回收管局部副作用，跨服务先后关系由拥有这些服务的 Host 显式编排。

失败时仍向前释放：一个 Session flush 失败不能阻止其他 Session 释放写锁——收集错误、逐项尝试、最后统一报告。关闭应可重复调用：并发调用共用进行中的 Promise，真实失败后可重试，不永久缓存 rejected Promise。

测试：只断言每个 dispose 被调用发现不了先后问题。让底层资源 close 后拒绝读写，检查上层最后一次持久化发生在底层关闭前；再在其中一步制造失败，确认后面的释放仍发生；补一个真实进程退出、重启读取末尾状态的用例，验证真实装配没绕过顺序。

## 自检

1. 谁持有 AbortController，谁等待完成，用户操作与迟到结果冲突时谁胜出？
2. 插件函数会不会被 Cordis 当构造器，disposer 是否丢了？
3. 依赖图只画了运行时调用吗？关闭阶段的调用纳入了吗？某步清理失败后剩余资源还有释放机会吗？

本轮实例见 [P5 测试接替](../../exec-runs/20261003-agent-harness-host-refactor/phase-5-test-map.md)；领域租约仍有独立价值，因为 Effect 不能撤销已发生的写入或外部请求。
