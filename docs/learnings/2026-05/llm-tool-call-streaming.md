# LLM Tool Call Streaming：后端转发颗粒度等于前端可消费颗粒度

关联 history：`docs/histories/2026-05/20260526-2030-tool-call-streaming-4stage.md`

## 是什么

Agent 桥接层把后端事件转发给前端时，永远要先问一个问题：

> 前端能直接消费什么颗粒度？

答案有三档，决定了同一个原始事件该被「字节转发 / 结构化解析后转发 / 凑齐再一次性转发」中的哪一档：

| 前端能直接消费的形式 | 转发策略 | 仓库内代表事件 |
| --- | --- | --- |
| raw 字节 / 文本片段 | 转发字节流 | `assistant_text_delta` / `assistant_thinking_delta` |
| 结构化语义 typed payload | 后端解析成 typed payload 再转发 | `tool_call_streaming { preview: ToolUiPreview }` |
| 需要完整结构才能用 | 后端堵到完整再一次性推 | `tool_started` / `tool_finished` / `turn_finished` |

这条原则把流式协议从「按 LLM SDK 给什么就转什么」上升为「按 UI 需要什么就给什么」。

## 为什么需要

actspace-agent 在加入 `write_file` 工具后第一次踩到这个坑：

- DeepSeek/Kimi 把 `tool_call.arguments` 拆成一连串 `delta.tool_calls[].function.arguments`，单次 chunk 只有几十字节。
- 之前 bridge 直接丢弃 `tool_call_delta`，导致 assistant 文本结束到 `tool_started` 之间出现 2–3s 静默（write_file content 一千多字符全在 LLM 串 args 阶段产生）。
- 自然想法 ①：把 raw delta 透传给前端，前端自己解析 partial JSON 提取 path / content。
- 自然想法 ②：让后端在已经累积 partial args 的地方「随手」解析出 typed payload 再下发，前端拿到的本质上就是 `ToolUiPreview`，复用 `tool_started` 那套渲染分支。

最终选 ② 的关键原因：

1. **DRY**：后端已经有 `createToolUiPreview` 一套规则把 args→preview。把 partial 也走同样路径，规则不会跨进程出现两套实现。
2. **多 provider 兼容**：不同 LLM SDK 的 partial chunk 切分不一样，partial JSON 怪习（unicode escape 中断、trailing backslash）都在后端用一个 state machine 集中应对，前端不接触。
3. **新工具零前端改动**：在 `streaming-preview-extractors.ts` 加一行 extractor 就能让新工具拥有 streaming 表现，前端的 `toolEntryToBlock` 不动。
4. **节流单点**：50ms throttle 只在后端做一次，前端不会被 LLM chunk 频率轰炸（write_file 一秒 30 个 chunk 时前端只收到约 20 个事件）。

## 怎么用

### Before：raw delta 透传

```ts
// bridge.ts
case "tool_call_delta":
  return { type: "tool_call_delta_raw", delta: delta.delta }; // ❌

// 前端
case "tool_call_delta_raw": {
  state.toolArgsBuffer[event.toolCallId] += event.delta;
  const parsed = tryParsePartialJson(state.toolArgsBuffer[event.toolCallId]);
  if (parsed?.path) { ... }
  // 解析规则散在前端，每个工具都要重写
}
```

### After：后端解析后再下发

```ts
// engine/streaming-preview-extractors.ts
write: (s) => ({
  kind: "write",
  filePath: extractStringField(s, "path")?.value ?? "",
  streamingContent: extractStringField(s, "content")?.value,
  additions: 0, deletions: 0, diff: "", collapsedLines: 0,
}),

// bridge.ts
case "tool_call_delta": {
  const entry = state.toolCallStreaming.get(delta.toolCallId) ?? { partialArgsText: "", ... };
  entry.partialArgsText += delta.delta;
  if (throttledNow(entry)) {
    streamCb({
      type: "tool_call_streaming",
      toolCallId: delta.toolCallId,
      toolName: delta.toolName,
      isInitial: !entry.emittedInitial,
      preview: extractStreamingPreview(previewKind, entry.partialArgsText),
    });
  }
}

// App.tsx
case "tool_call_streaming": {
  const existing = state.activeTools.get(event.toolCallId);
  if (existing) existing.preview = event.preview;        // ✅ 直接覆盖，零解析
  else {
    state.activeTools.set(event.toolCallId, { preview: event.preview, ... });
    state.segments.push({ type: "tool", toolCallId: event.toolCallId });
  }
}
```

`toolEntryToBlock` 完全复用 `tool_started` 的渲染分支 —— 因为 preview 字段已经是 typed `ToolUiPreview`。

## 核心要点

1. **流式协议设计：先问 UI 能直接消费什么**。三档策略选错档会产生跨进程重复实现或前端阻塞。
2. **后端是 partial-state 的天然 owner**：累积、节流、JSON escape、provider 兼容性都在一个进程内做完。
3. **「typed payload」≠「完整 payload」**：write 的 streamingContent 是 partial 文本但已经 typed，前端可以直接渲染，这就是「结构化语义」一档的精髓。
4. **执行副作用永远在最完整态发生**：write_file 真正写盘仍在 tool execute 阶段（atomic write tmpfile→fsync→rename），LLM 流式期间只生成 UI 字段，避免 LLM 重试导致脏写。
5. **不是所有工具都适合 typed streaming**：edit-file 的 diff 需要文件原内容 + old/new 三者齐全才能定位，partial old/new 强行展示反而误导用户。这种情况 extractor 只输出 path，前端 fallback 到普通 shimmer 行。

## 常见陷阱

- **以为 partial JSON 解析很简单**：`\u4e2d\u6587` 这类 unicode escape 可能在 `\u4e` 处断流，提取字段时要识别「未闭合的 \\u 序列」并暂时不写入输出。我们的 `extractStringField` 把这类情况归到 `closed: false` + 已累积部分。
- **节流忘了首帧**：dispatched 阶段必须 emit 一次 `isInitial: true`，否则前端在 LLM 串 args 的整段时间内仍然没有反馈。throttle 实现要把首帧豁免。
- **tool_started 阶段把 streamingContent 弄丢**：tool_started 用完整 args 重新构造 preview，如果不在 output 为空时填 streamingContent，前端会突然丢内容然后再补 diff，造成视觉闪烁。`createToolUiPreview` 的 write 分支按 `output.length` 区分这两个阶段。
- **segment 位置乱**：tool_call_streaming 首帧 push tool segment，后续帧和 tool_started 都只覆盖 preview。如果每次 streaming 都 push 一个新 segment，工具会重复出现；如果 tool_started 又 push 一次，工具位置可能跳到末尾，破坏「按 LLM 输出顺序展示」原则。
- **每帧都写 run log 会爆 jsonl**：throttle 后仍有几十帧每秒。把 `tool_call_streaming` 视为 delta，跳过 `writeRunLog`，只保留完整态 tool_event 入 log。

## 自检问题

1. 如果你要给 Bash 工具加「命令流式拼写」的视觉效果，按这条原则应该走哪一档？需要在哪个文件加什么代码？
2. 如果某个工具 args 的某个字段是 number 而不是 string（例如 `read_file.limit`），partial-args extractor 该怎么写？应该用什么作为 fallback？
3. 假设新接入一个国产 LLM，它一次性吐完整个 tool_call args 而不是 chunked，前端体验会变成什么样？要不要在后端造假 chunked？
