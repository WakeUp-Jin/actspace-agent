# 流式 LLM 调用的自动重试应该放在哪一层

> 提炼自 `docs/histories/2026-07/20260705-2230-llm-error-retry-and-error-event.md`

## 是什么

给 LLM 调用加自动重试时，有两个候选位置：service 层（provider 封装内部，靠近 SDK）和 agent loop 层（执行引擎，消费 service 返回的最终消息）。直觉上 service 层"更内聚"，但对**流式**调用来说 loop 层才是对的。

## 为什么 service 层重试对流式调用是个陷阱

非流式调用里 service 层重试完全没问题——失败了内部再发一次，调用方无感知。但流式调用有个绕不开的问题：**增量已经泄漏出去了**。

`processStream` 一边收 chunk 一边 emit `thinking_delta` / `text_delta` 给 UI。当第 500 个 token 之后网关挂掉，UI 上已经渲染了半截作废内容。service 内部悄悄重试的话：

- UI 不知道发生了重试，半截旧内容和新内容会拼接在一起；
- service 没有通知 UI 的通道（它只有一个事件流，没有"带外"信令）；
- 每个 provider service 都要各写一遍同样的逻辑。

loop 层统一处理则三个问题都消解：所有 provider 一份逻辑；loop 本来就持有 emit 通道，可以发一个 `llm_retry` 事件让 UI 清掉半截内容并显示"正在重试"；重试策略（次数/退避）也能挂在 loop 配置上按调用方定制。

## 三个必须处理的细节（都踩过才知道）

1. **重试前必须把 error message 从会话历史里弹出来。** 流式消费函数通常会把最终消息（包括 error message）push 进 `context.messages`。不弹出的话，下一次请求会带着一条 `stopReason: "error"` 的脏 assistant 消息——轻则被 provider 的防御逻辑跳过，重则破坏 prompt cache 前缀（历史序列变了，缓存全 miss，重试反而更贵）。

2. **失败尝试的 usage 必须照常累进。** 失败的调用钱已经花了（prompt tokens 已计费）。如果重试时把失败尝试的 usage 丢掉，计费审计就会和 provider 账单对不上。正确做法：usage/usageCalls 全量记录，只是**内容事件**不落库。

3. **退避 sleep 必须响应 AbortSignal。** 用户点停止时如果 loop 正卡在 3 秒退避里，普通 `setTimeout` sleep 会让"停止"延迟 3 秒才生效。退避要用可中断的 sleep（监听 abort 事件提前 resolve）。

## 配套：错误元数据要一路带到消费点

loop 能做重试决策的前提是它拿得到 `retryable` 标记。典型断链：service 层定义了带 `kind`/`retryable` 的错误类型，但转成最终消息时只保留了 `errorMessage` 字符串——元数据在中间层丢了，下游想消费也没得消费。教训：**结构化错误信息要作为一等字段跟随消息对象走完整条链路**（本仓库是 `AssistantMessage.errorKind` / `errorRetryable`），不要在任何转换点降级成纯文本。

## 自检问题

1. 你的 LLM service 是流式的吗？如果是，service 内部重试后 UI 上的半截内容谁负责清理？
2. 重试前，失败那次调用留在会话历史里的消息处理掉了吗？它会不会破坏 prompt cache 前缀？
3. 用户中止时，重试退避的 sleep 能立即被打断吗？
