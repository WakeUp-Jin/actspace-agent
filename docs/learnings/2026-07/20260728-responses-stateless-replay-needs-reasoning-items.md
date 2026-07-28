# Responses 无状态工具循环仍需回放推理项

关联 history：`docs/histories/2026-07/20260727-2321-duckcoding-multi-key-model-catalog.md`

## 核心结论

使用 Responses API 时，`store: false` 加“每轮发送完整历史”并不等于只回放 user、assistant 和 tool 消息。对于会产生 reasoning item 的模型，后续工具轮次还必须带回供应商返回的推理项；否则本地看到的对话虽然完整，协议状态仍可能不完整。

缓存键与会话状态也是两件事：`prompt_cache_key` 只帮助网关识别稳定前缀，不能替代消息、工具结果或 reasoning item。

## 为什么容易误判

Chat Completions 的常见无状态循环通常只需要：

```text
messages + tool calls + tool results
```

切换到 Responses 后，很容易沿用这个心智模型，然后认为：

```text
store=false + full input = complete stateless replay
```

但 Responses 的输出是有类型的 item 序列。某些推理模型会在 assistant message 或 function call 之前产生 reasoning item；当服务端不保存 response 时，调用方必须把这些 item 与普通历史一起管理。

## 可复用的实现模式

### 1. 把协议状态放在统一消息模型的 opaque 载体中

如果系统已经有可持久化的 thinking signature，可以让它承载序列化后的 provider reasoning item：

```text
ThinkingContent.signature
  = provider-specific prefix
  + serialized encrypted reasoning item
```

优点是 Agent loop、session store 和恢复逻辑不需要理解 Responses 内部结构；只有 Responses converter 负责编码和解码。

事件还要同时保存产生该签名的 `api`、`provider` 和 `model`。否则“只有工具调用、没有 assistant 正文”的历史在恢复时可能失去身份，安全转换层无法判断签名是否属于当前目标：要么错误丢弃，要么存在跨协议误发风险。

### 2. 保留原始顺序

回放时 reasoning item 必须出现在它原本关联的 assistant text 或 function call 之前。不能把所有签名集中放到请求结尾，也不能只保留最后一个。

### 3. 不把加密内容当成可读思考

encrypted content 是协议连续性状态，不是面向用户的 reasoning summary：

- 可以持久化和原样回放。
- 不应写入普通调试日志。
- 不应解密、拼接或展示为思考文本。
- 不应发送给不同 provider 或不同 API protocol。

可读 Thinking 是另一条显式输出通道。以 Responses 为例，调用方通常需要请求 `reasoning: { summary: "auto" }`，再消费 `response.reasoning_summary_text.delta` 或最终 reasoning item 的 `summary`。仅请求 `reasoning.encrypted_content` 只能保证拿到可回放的 opaque 状态，不能保证出现用户可见文本。

同理，usage 中 `reasoning_tokens > 0` 只证明模型消耗了推理 token，不证明 API 将推理过程或摘要暴露给调用方。诊断时至少要分别观测：

```text
reasoning tokens       -> 模型是否发生了推理计算
encrypted reasoning    -> 是否返回可回放的协议状态
reasoning summary/text -> 是否返回可展示内容
```

不要用其中任意一项替代另外两项。

如果产品必须保存 signature-only reasoning event 以支持恢复，展示层应按“是否存在可读 content”决定是否生成 UI block，而不是按事件类型或 signature 是否存在决定。也就是说，同一条事件可以对协议恢复可见、对用户界面不可见；不要为了消除空 UI 而删除底层协议状态。

### 4. 缓存与状态分别设计

```text
prompt_cache_key  -> 优化重复前缀
local context     -> 保存对话事实
reasoning item    -> 保持 Responses 推理协议连续性
```

三者不能互相替代。缓存未命中不应破坏对话；更换缓存键也不应改变会话语义。

## `previous_response_id` 与本地上下文的取舍

如果产品已经有自己的 session、压缩和重放系统，使用 `store: false` 并由本地管理完整上下文通常更一致：

- 会话事实不依赖供应商保存期限。
- 上下文压缩和多 provider 切换仍由本地控制。
- 数据边界更清晰。

代价是调用方必须完整处理 Responses item，包括工具 `call_id`、assistant phase 和 reasoning item。若使用 `previous_response_id`，实现更省事，但会把会话连续性部分交给外部状态，不一定符合本地优先产品的架构目标。

## 自检问题

1. 当 `store: false` 时，工具调用后的下一次请求是否包含之前返回的 reasoning item？
2. provider signature 是否能经过落盘、应用重启和 session 恢复后保持字节级内容不变？
3. 切换到另一个 provider 或 Chat Completions 时，opaque Responses reasoning item 是否会被正确过滤而不是误发？
4. UI 展示的 Thinking 来自显式 summary/text 事件，还是误把 opaque 状态或 reasoning token 当成了正文？
