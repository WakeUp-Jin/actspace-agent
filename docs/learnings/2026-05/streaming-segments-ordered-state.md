# 流式 UI 状态：按事件到达顺序建模，而非按类型分桶

> 来源：`docs/histories/2026-05/20260526-1501-filediff-ui-streaming-order.md`

## 问题

一个典型的 Agent 对话流中，后端依次推送：

```
text_delta("我来读一下文件") → tool_started(read) → tool_finished(read) → text_delta("文件内容是…")
```

前端需要将这些事件实时渲染为消息列表。最直觉的做法是按类型分桶：

```ts
type StreamingState = {
  thinkingText: string;    // 所有 thinking delta 拼接
  assistantText: string;   // 所有 text delta 拼接
  activeTools: Map<...>;   // 所有工具状态
};
```

然后 `toBlocks()` 按桶顺序输出：thinking → tools → text。

**看似合理，但有一个反直觉的 bug**：当 Agent 在两段文字之间插入工具调用时，用户看到的是"所有工具在最前面，所有文字在最后面"，而不是真实的交叉顺序。

## 解法：segments 有序数组

用一个按到达顺序 push 的 `segments` 数组取代分桶字段：

```ts
type StreamingSegment =
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | { type: "tool"; toolCallId: string };

type StreamingState = {
  segments: StreamingSegment[];
  activeTools: Map<string, ToolEntry>;
};
```

事件处理时，如果当前 segment 和新事件类型一致（都是 text 或都是 thinking），就追加到同一 segment；否则新建一个。工具永远新建独立 segment。

`toBlocks()` 只需顺序遍历 segments，每个 segment 映射为对应的 MessageBlock，天然保持时序正确。

## 核心要点

1. **分桶是空间思维，segments 是时间思维**。流式 UI 本质是时间轴展示，用时间轴数据结构更自然。
2. **合并连续同类 segment** 是必要的——否则每个 delta 一个 block，会导致大量碎片化的 assistant text block。
3. **工具状态仍用 Map**。segments 只记录 toolCallId 引用，tool_finished 时更新 Map 中的状态，渲染时通过 toolCallId 查找。
4. 这个模式适用于任何"多种类型的有序事件流 → UI 列表"场景，不限于 Agent。

## 常见陷阱

- **忘记合并连续 delta**：不合并会导致 "streaming-assistant-0"、"streaming-assistant-1"... 上百个独立文本 block，React 渲染压力大且视觉碎片。
- **tool_finished 时忘记更新 preview**：有些工具（如 edit/write）的 preview 在 finished 时才包含 diff 数据，如果不在 tool_finished 处更新 preview，流式阶段看不到正确内容。
- **segments 里不要存大数据**：text/thinking segment 的 `text` 字段存累积文本是安全的（和分桶字段等价）；但 tool segment 只存 `toolCallId`，实际数据在 `activeTools` Map 里，避免双份存储。
