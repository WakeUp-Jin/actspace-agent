# Kimi $web_search 两轮调用协议：tool_result 的正确用法

来源：`docs/histories/2026-05/20260525-2100-three-bug-fix-abort-search-webtools.md`

## 是什么

Kimi 的 `builtin_function.$web_search` 需要两轮 API 调用：

1. **第一轮**：发送用户消息，Kimi 返回 `tool_calls`（类型为 `builtin_function`）。
2. **第二轮**：将 tool_calls 对应的 `role=tool` 消息追加到 messages 后再次请求，Kimi 返回最终文本答案。

关键：第二轮 `role=tool` 消息的 `content` 字段**必须是 `JSON.stringify(tool_call.function.arguments)`**——即把第一轮 tool_call 的 arguments 原封不动 JSON 化后回传。

## 为什么不是 "ok" 或空字符串

Kimi 文档明确要求回传 arguments。内部推测 Kimi 用 tool_result 的内容作为搜索的实际执行参数——它不是在问"你确认了吗？"，而是在说"这是我决定的搜索参数，你确认后把它给回我，我来执行"。

如果传 `"ok"`：
- Kimi 仍然会返回 200，不报错。
- 但 `content` 字段为空字符串（或极短的无意义内容）。
- 没有任何错误提示，让人以为是其他环节出了问题。

## 正确示例

```typescript
const firstResponse = await kimi.completeMessages(messages);
const toolCalls = getToolCalls(firstResponse);

if (toolCalls.length > 0) {
  const toolMessages = toolCalls.map((tc) => ({
    role: "tool" as const,
    tool_call_id: tc.id,
    content: JSON.stringify(tc.arguments), // 关键：原封不动回传
  }));

  const secondResponse = await kimi.completeMessages([
    ...messages,
    firstResponse,
    ...toolMessages,
  ]);
  return getTextContent(secondResponse); // 这里才有真正的搜索结果
}
```

## 核心要点

1. **两轮调用是协议要求**，不是 hack——`$web_search` 的设计就是让模型先"决策搜什么"，再"执行搜索"。
2. **tool_result 内容 = JSON.stringify(arguments)**，不是确认字符串。
3. **错误会静默发生**：无效的 tool_result 不会触发 HTTP 错误，只会导致空响应。
4. 这个模式同样适用于 Kimi 的其他 builtin_function（如果有的话）。

## 常见陷阱

- 以为 tool_result 只是"确认"，随便填什么都行——实际上内容有严格要求。
- 只看 HTTP status 判断成功——200 + 空 content 是 Kimi 的"静默失败"模式。
- 没有做两轮请求——直接用第一轮的 content（通常为空）作为最终结果。

## 自检问题

1. 如果 Kimi 第一轮直接返回了文本而没有 tool_calls，你应该怎么处理？
2. tool_result 中的 `tool_call_id` 必须和第一轮的哪个字段对应？
3. 如何区分"Kimi 没有搜索结果"和"tool_result 协议错误导致的空响应"？
