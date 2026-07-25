# 渲染出来的一条消息，不一定是计费边界

## 核心结论

在工具型 Agent 中，“用户看到的一条最终回复”和“供应商产生的一次模型调用”不是一一对应关系。计费事实应该按最细粒度的 LLM call 记录，再按产品需要聚合成 turn、session 或 day；不能从最终渲染消息反推费用。

## 为什么容易算少

一个用户 turn 可能经历：

```text
LLM call 1 -> thinking + tool call
tool result
LLM call 2 -> tool call
tool result
LLM call 3 -> final reply
```

界面最终可能只显示一段正文。如果尾栏直接读取 final reply 自带的 usage，就只会展示 call 3，前两次已经支付的 token 和费用会消失。可重试错误更隐蔽：失败正文通常不会持久化，但供应商仍然已经计费。

## 可复用模式：事实先细分，视图后聚合

1. 每次模型调用落一条不可变 `llm_usage` 事实。
2. 事实带 `turnId`，必要时再带 `relatedEventIds` 解释它产生了哪些消息或工具事件。
3. 产品视图从事实聚合：消息尾栏按 turn、Usage 表按 turn/day、总览按时间窗口。
4. 聚合结果可以挂到最终可见消息，但最终消息只是展示锚点，不是数据来源。

这个模式也适用于请求耗时、缓存命中、服务端工具次数和失败重试统计。

## 常见陷阱

- 把 Assistant message 数量当成 LLM call 数量。
- 失败重试没有正文，就顺手丢掉 usage。
- 不同页面各写一遍汇率换算，最终产生金额口径漂移。
- 为了方便 UI，把完整价格快照复制进每条消息，导致事实和视图耦合。

## 自检问题

- 工具循环中的中间模型调用是否进入统计？
- 没有可见正文的失败调用是否仍然计费？
- 消息尾栏、每日统计和会话统计是否复用同一折算规则？

关联变更：[`20260725-2106-turn-usage-cost-visibility.md`](../../histories/2026-07/20260725-2106-turn-usage-cost-visibility.md)
