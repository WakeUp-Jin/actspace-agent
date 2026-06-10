# 事件回放重建上下文必须保真块顺序：tool_use 要收尾

> 提炼自 `docs/histories/2026-06/20260610-0820-fix-history-replay-order-and-review-image-preview.md`

## 是什么

把消息拆成事件流（thinking / tool_call / assistant_message / tool_result）落盘，再从事件流重建 LLM 消息时，**重建结果必须和原始消息的内容块顺序一字不差**。否则上下文在"内存直连"和"落盘重建"两条路径下行为不一致——这类 bug 只在第二轮对话才爆发，第一轮永远正常。

## 为什么需要

本仓库的落盘顺序是 `thinking → tool_call → assistant_message(text)`，重建代码顺着事件流拼出了 `[thinking, toolCall, text]`；而流式组装的原始消息是 `[thinking, text, toolCall]`。

这个失真碰上了 provider 的硬约束：DeepSeek 的 Anthropic 兼容端要求 **`tool_use` 必须是 assistant 消息的末尾块**，下一条消息紧跟 `tool_result`。text 排在 `tool_use` 后面直接 400：

```text
messages.1.1: `tool_use` ids were found without `tool_result` blocks immediately after
```

由于每轮 turn 都从 `session.jsonl` 重建上下文，只要上一轮用过工具，后续每条消息都会失败——用户看到的现象是"只有第一条消息有响应"，离真实根因（块顺序）隔了三层。

## 怎么想

- **事件落盘顺序 ≠ 消息内容顺序**。事件流为前端展示服务（先展示思考、再展示工具卡片、最后是正文），不能假设它就是模型协议要的顺序。重建函数要负责"还原原始消息"，而不是"按事件顺序堆块"。
- **修在数据保真层，不修在协议适配层**。也可以在 Anthropic converter 里强行把 tool_use 挪到末尾兜底，但那样掩盖了"重建失真"这个真问题；恢复原始顺序后所有 provider 路径天然正确。
- **双路径一致性测试**：凡是"内存直连 + 落盘重建"双路径的数据，回归测试应断言 round-trip 后的块顺序逐项相等，而不只是"角色对、条数对"。

## 常见陷阱

- 第一轮对话永远测不出这类 bug——必须带着"上一轮用过工具的历史"测第二轮。
- 错误信息指向 provider（"少了 tool_result"），但 tool_result 其实在场，只是同一条 assistant 消息里 tool_use 后面多了 text 块。排查时对比 cache-audit / 请求快照里的实际块序比读报错文案有效得多。
- Anthropic 官方 API 对 text-after-tool_use 宽容，兼容网关（DeepSeek 等）往往更严格；不能拿"官方能跑"当作协议正确性的标准。

## 自检问题

1. 你的事件 → 消息重建函数，输出顺序是跟着事件流走，还是跟着原始消息结构走？
2. 如果第二轮对话才出错、第一轮永远正常，你会先查哪一层？
