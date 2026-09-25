# 稳定 Prompt 前缀与持久化动态尾部

Agent 请求同时需要两类信息：长期稳定、适合缓存的身份与规则；以及每轮变化、但模型确实需要知道的运行事实。最容易踩的坑，是把两者都序列化进 system prompt。一个随机 run ID 就会让供应商的前缀缓存从变化字节处失效。

## 三层事实模型

把输入分成三层：

1. `prompt-section`：稳定身份、安全规则和显式选择的完整指令正文；
2. `model-fact`：模型需要看见的稳定结构化事实，例如 descriptor 和 capability 摘要；
3. `request-fact`：只用于审计和诊断的动态事实，例如 run、request、Host invocation identity。

snapshot 同时保存 `facts` 和 `modelFacts`，但 system prompt 只渲染 `modelFacts`。这样不会为了缓存而牺牲可审计性。

## 为什么动态信息必须持久化在消息末尾

若某项逐轮事实模型必须知道，例如 Agent 当前是 Plan 还是 Agent，只在 dispatch 前临时拼接是不够的。下一轮请求会从 Journal 重放旧消息，却找不到当时的临时尾部，导致“现场请求”和“历史重放”不等价。

正确做法是把动态块与用户消息一起持久化，并放在当前上下文末尾：

```text
system: stable prompt sections + stable model facts
history: durable Journal Surface
current user:
  text
  attachments
  runtime-context
```

UI、标题和自然语言摘要可以隐藏内部块，但 token 估算仍要计算，因为模型确实收到了它。

## 附件也是同一个问题

文本附件若只在第一次 dispatch 时从本地路径读取，重放时就可能文件消失或内容变化。把校验后的正文随 `user/message` 持久化，Artifact 保留原始字节，才能同时获得可恢复性、用户可见附件和模型输入一致性。

## 常见陷阱

- 把审计 ID 放进 system prompt，再用“模型需要上下文”解释缓存抖动；
- 只在内存里追加动态尾部，导致后续重放缺失；
- 为隐藏内部块而从 token estimate 中删除，低估真实上下文；
- 文本附件只保存路径，重启后依赖易失的外部文件；
- 在创建第一个 Artifact 后才校验后续文件，失败时留下孤儿数据。

## 自检问题

1. 一个事实如果只用于 Trajectory 调试，应该进入 `modelFacts` 吗？
2. 为什么逐轮 mode 不能只在 LLM adapter 内临时追加？
3. 附件正文、原始 Artifact 和 UI attachment chip 分别承担什么职责？

对应变更记录：`docs/histories/2026-09/20260924-2308-main-chat-form.md`。
