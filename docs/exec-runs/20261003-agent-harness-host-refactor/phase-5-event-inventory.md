# P5 事件与资源清单

本表记录当前生产入口，不新增运行时事件注册表。Session Journal、投影订阅、IPC/WSS 和 Node socket/process 回调不是 Cordis 插件事件，不在本轮强行合并。

| 事件/操作 | 模式 | 发布者 | 当前订阅者/使用者 | 失败策略与所有者 |
| --- | --- | --- | --- | --- |
| system-prompt/assemble | waterfall | Loop | English-learning scoped listener；候选可插入插件 | 失败传播；Harness Fiber + Agent scope |
| agent/pre-step、agent/request、llm/stream、agent/request-error | waterfall | Loop | 默认 next；候选可插入插件 | 业务插入点传播错误/按 Loop 重试；Run scope 等待 |
| tools/pre-execute、tools/execute、tools/post-execute | waterfall | PreparedToolExecution | 默认 next；候选工具插件 | pre 校验/权限，execute 失败归一化，post 失败保留事实并完成 finalizer；tool lease |
| agent/turn-stopping | serial | Loop | 默认停止；候选插件 | 第一个 bail 决策；Run scope 等待 |
| agent/session-start、agent/status、agent/error | emit | Loop / Headless | 当前主要为契约测试；外部插件可订阅 | 注册处 containment，异步工作归插件 |
| llm/chunk、tools/result | emit | Loop | 当前主要为契约测试；客户端另走 live/projection ports | 同上，不影响事实和结算 |
| session/event | emit，carrier.sessionId | Runtime Session controller | English-learning | containNotification；SpeechQueue 拥有并取消/等待 TTS 工作 |
| agent/tasks-updated | emit | AgentRuntimeService | Host bootstrap 经 CLI 注册、Desktop registry | Host containNotification；Desktop 同步回调隔离；返回的 remove 归 Host/registry |
| harness/selection-updated | emit | AgentRuntimeService | 当前无生产 Cordis 订阅者 | 观察用途；选择持久化不依赖它 |
| session/created、session/disposed、session/flush | emit | Runtime Session controller | 当前无生产 Cordis 订阅者 | 观察用途，不替代持久化 Promise |
| session.checkpoint.flush | 必需 Service，不是事件 | Loop | checkpoint-policy 提供，session.runtime 执行 flush | 缺失/写入失败向调用方传播；Host Session 生命周期 |

Cordis `RuntimeLifecycleEvent` 中尚无生产发布点的名称仅是声明，不据此声称功能存在。测试中用于模拟失效的通知监听也要按注册契约包装；不能靠发射器遍历并等待所有 handler。

资源归属：

- Cordis Fiber/Effect：监听和插件本地资源；scope disposer：正在执行的 waterfall/serial；generation lease：固定 Harness。
- 工具 registration lease：审批、body、finalizer、commit 期间保持 executor；取消/失败仍释放。
- Host bootstrap：网关、admin、订阅、维护 timer；维护 Promise 等待后释放 Runtime 和传输。
- Desktop registry：任务/投影订阅随 registry 关闭；不变更用户设置生命周期。
