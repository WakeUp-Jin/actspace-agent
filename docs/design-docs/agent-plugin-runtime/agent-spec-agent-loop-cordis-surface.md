# Agent Loop Cordis 插入面与通知面

状态：当前源码契约，2026-10-06。模式、异常隔离和 scope 的共性规则见 [Cordis ABI](agent-spec-cordis-event-abi-and-eventhub-retirement.md)；本文只维护 Loop 边界。

## 八个干预点

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

## 必须等待的 checkpoint

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

## 观察面

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

## 生命周期与验证

插件用 `apply(ctx, config)`、`ctx.on()` 和 Effect 接入。通知异步工作由插件拥有；真正的干预和 tool lease 仍由 scope/drain 等待。退出停止接纳、处理取消、等待业务与 checkpoint，再释放相应资源。

保护行为的测试归属：

- core-agent：subject/carrier 一致、父子与兄弟隔离、scope dispose 后拒绝调用、通知不延长 Run 生命周期。
- core-agent-loop：模型与工具 checkpoint 顺序、取消结算失败、stream/retry、干预和工具结果。
- checkpoint-policy：服务存在、等待 flush、存活 Session 校验与失败传播。
- boot/harness-control：新旧组合独立、失败候选不切换、最后 Run 释放后卸载。

CLI 单次运行、Desktop 会话与远端 Host 复用以上语义；真实界面验收与自动化测试分开报告。
