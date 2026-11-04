# LLM 重试与错误契约：重试放哪一层、尝试的终态、错误码即调度协议

合并自三篇：流式 LLM 自动重试放哪一层、重试不是让失败请求继续运行、错误码也是调度协议。终态协议总览见 [Turn 终态协议](agent-turn-cancellation-is-a-lifecycle-protocol.md)。

## 1. 流式调用的重试放 agent loop 层，不放 service 层

非流式调用在 service 层重试没问题（调用方无感知）。流式调用的增量已经泄漏：`processStream` 边收 chunk 边 emit `thinking_delta`/`text_delta`，第 500 个 token 后网关挂掉，UI 已渲染半截作废内容。service 内部悄悄重试：UI 不知道发生了重试，旧半截与新内容拼接；service 没有带外通知 UI 的通道；每个 provider service 都要各写一遍。loop 层统一处理：一份逻辑覆盖所有 provider；loop 持有 emit 通道可发 `llm_retry` 让 UI 清掉半截并显示“正在重试”；次数/退避可挂在 loop 配置上按调用方定制。

三个必须处理的细节：
1. **重试前把 error message 从会话历史弹出**：流式消费函数通常把最终消息（含 error）push 进 `context.messages`。不弹，下一次请求带着 `stopReason: "error"` 的脏 assistant 消息——轻则被 provider 防御逻辑跳过，重则破坏 prompt cache 前缀（缓存全 miss，重试反而更贵）。
2. **失败尝试的 usage 照常累进**：失败调用 prompt tokens 已计费，丢掉会和 provider 账单对不上；usage/usageCalls 全量记录，只是内容事件不落库。
3. **退避 sleep 响应 AbortSignal**：普通 `setTimeout` 会让“停止”在 3 秒退避里延迟生效；用监听 abort 提前 resolve 的可中断 sleep。

错误元数据要一路带到消费点：loop 做重试决策需要 `retryable`；典型断链是 service 定义了带 `kind`/`retryable` 的错误类型，转成最终消息时只留 `errorMessage` 字符串（本仓库是 `AssistantMessage.errorKind`/`errorRetryable`，结构化错误作为一等字段走完整链路，不在任何转换点降级成文本）。

## 2. 重试后，失败的那次尝试已经结束

一个任务可含多次模型请求尝试：第一次失败、重试成功、任务成功，但第一次请求已结束。事件日志只记“准备重试”而恢复器仍认为原请求在运行，会在重启时补写多余终态或拒绝之后的 Task 结算。身份三层：Task（用户的工作）、Run（固定执行组合下的一次运行）、requestId（一次实际模型调用）；重试保留 Task/Run，下一次尝试用新 requestId。

```text
Task A / Run B
  request 1: start -> retry（本次失败，已结束）
  request 2: start -> finish（成功）
  Run B: finish ;  Task A: settled
```

关键是事件对状态机的含义：`retry` 已声明本次尝试失败，在线校验与冷启动恢复必须一致地把它视为该 request 的终态——不能一处关闭一处保留 pending，也不能为接受后续事件放松重复终态检查。验证三条路径：重试后成功、重试耗尽、等待重试时取消；每条都重开持久会话，确认旧请求不被再次结算、旧任务不自动重跑、writer 能重新取得。确定性 HTTP fixture 保留真实 Loop、错误分类、事件写入、进程退出，只控制外部响应，比替换整个执行器更易暴露在线执行与持久恢复的语义漂移。自检：一个事件同时表示“这一层失败”和“上一层还会继续”时，在线状态机、投影、恢复扫描是否给出相同解释？

## 3. 错误码也是调度协议

异步任务系统中的异常不只给人看，也决定调度器下一步做什么。恢复阻塞=“保留任务、暂停执行、修复环境后允许继续”；未知异常通常=执行器内部失败；两者都没创建 Run，恢复策略不同。事故链路：持久化的 Harness 与当前 Host 契约不兼容 → 控制层拒绝获取租约 → HMR 包装成普通 Error → 调度器识别不到可恢复错误码 → 任务仍 pending 而队列没进入暂停状态；界面只知道“尚未开始”。

跨层转换异常时先决定下一层该执行哪种恢复动作，再选稳定的错误类型/码；保留 `RECOVERY_BLOCKED` 复用已有暂停/恢复协议，换一句更清楚的文字不能替代契约。验证至少覆盖：上游确实输出带码异常；下游确实把它转成可恢复状态；再用真实跨层运行确认没有中间适配器丢信息。排查：UI 显示排队、账本 pending 时，先查是否拿到执行租约、队列是否 paused，再查网络；任务接纳成功只证明输入已持久化，不证明执行已开始；别把“没有 Run”直接归因为模型服务慢。

## 自检

1. 流式 service 内部重试后，UI 半截内容谁清理？失败那次的消息还留在历史里会不会破坏缓存前缀？
2. 用户中止时退避 sleep 能立即打断吗？
3. 这个异常跨层后，调度器还认得出它的恢复语义吗？

来源：`docs/histories/2026-07/20260705-2230-llm-error-retry-and-error-event.md`，及 2026-10 重试尝试终态、恢复阻塞相关修复。
