# 不等待通知，仍然需要管理观察者的生命周期

`emit()` 返回，表示通知已经分发，不表示所有观察者工作已经完成。把它误写成 `await Promise.allSettled(listeners)` 会让日志、语音或界面观察者拖住任务结算；把所有工作直接 fire-and-forget，则可能在插件卸载后继续访问已关闭的资源。

解决办法是把两个等待拆开：发布者只等待业务必需操作；观察者自己的插件在退出时等待或取消工作。

```text
业务任务 → await checkpoint.flush() → emit(status) → 任务结束
                                        ↓
                              观察者同步接纳到自己的队列
                                        ↓
                              插件 dispose → stop queue → await pending
```

checkpoint 是正确性屏障：不存在或失败就不能跨越副作用边界。通知是观察：单个监听者的同步 throw、异步 rejection 应在注册处捕获并诊断，不阻断兄弟观察者。异步回调失败需要接住返回 Promise 的 rejection；只在 emit 外层 try/catch 不够。

同样，`clearInterval()` 只阻止下一次回调，不会取消已经发起的上传清理。正确的关闭顺序是停止调度→等待在途 Promise→释放存储，而不是先关闭资源再希望回调自然退出。

检查设计时问三个问题：发布者必须等这个动作吗？异步工作由谁持有？退出时谁证明它已经停止？能回答这三个问题，通常就不需要再引入一套事件总线或通用后台调度器。

本轮实例见 [P5 测试接替](../../exec-runs/20261003-agent-harness-host-refactor/phase-5-test-map.md)。Cordis 的 Effect 能释放登记的监听和资源，但不能撤销已经发生的文件写入或外部请求；运行中的领域租约仍有独立价值。
