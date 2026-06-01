## [2026-05-26 20:30] | Task: 工具调用 4 阶段流式协议

### 🤖 Execution Context

- **Agent ID**: 9ee277ff-d757-4edf-a064-2f0c4e3a2bb1
- **Base Model**: claude-opus-4.7
- **Runtime**: Cursor IDE

### 📥 User Query

> Write 工具调用前会出现 2–3s 静默，模型在串 args 的过程中前端没有任何反馈，体验断层；同时 running 阶段不该展示 `+0`。希望把工具生命周期从 2 阶段（`started → finished`）升级到 4 阶段（dispatched → argsProgress → executing → finished），并允许 write_file 在 args 流式期间像 cursor 一样边写边显示 content；edit-file 因为缺文件上下文，content 不可流式只流 path。
>
> 重要原则：后端转发的颗粒度取决于前端能不能直接消费 — 前端直接消费 raw 字节 → 转发字节流；前端需要结构化语义 → 后端解析成 typed payload 再转发；前端无需中间状态 → 后端堵到完整再一次性推。这条原则要写进 `docs/learnings/2026-05/llm-tool-call-streaming.md` 作为流式协议设计原则。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、`docs/`

**Key Actions:**

- **后端 LLM 事件**：`AssistantMessageEvent.tool_call_delta` 增加 `toolCallId/toolName`，`convert.ts` 和 `mock.ts` yield 时携带累积的 id/name，让下游可以按 toolCallId 维护状态。
- **新增 `engine/partial-args.ts`**：纯函数 state-machine 从 partial JSON 字符串中提取指定 string 字段，正确处理 `\"` `\\` `\n` `\uXXXX` 等 JSON escape，字段未闭合时返回累积部分。
- **新增 `engine/streaming-preview-extractors.ts`**：按 `ToolPreviewKind` 的 extractor 表，把 partial args 解析为 typed `ToolUiPreview`。`write` 同时提取 `path` 与 `content`（content 作为 `streamingContent`）；`edit_diff` 只提取 `path`；`read/grep/glob/web_search/bash` 各按主参数提取。
- **`engine/bridge.ts` 新事件**：增加 `toolCallStreaming` Map（按 toolCallId 累积 partial args、50ms throttle），处理 `message_delta.tool_call_delta` 时按 throttle emit `tool_call_streaming { toolCallId, toolName, isInitial?, preview }`；`tool_start` 时清理该工具的累积，`agent_end` 时清空整张表。`createToolUiPreview` 的 `write` 分支在 output 为空时把 args.content 当作 streamingContent，避免 argsProgress→executing 切换时 content 闪烁消失。
- **`shared/session.ts` 新增类型**：`RuntimeStreamEvent.tool_call_streaming`、`ToolUiPreview.write.streamingContent?`、`MessageBlock.write_diff.streamingContent?`。
- **前端 `App.tsx`**：新增 `case "tool_call_streaming"` —— 若 `activeTools` 中已有该 toolCallId 则只覆盖 preview，否则建 entry + push tool segment（首帧锁位置），`tool_started` 同样改造为复用 segment + 覆盖 preview，确保工具位置严格反映 LLM 首次输出时机。`toolEntryToBlock` 的 write 分支把 `streamingContent` 传给 `write_diff` MessageBlock。
- **前端 `FileDiffBlock.tsx`**：running + streamingContent 非空时展开 code preview + 闪烁光标；running 无 streamingContent 时单行 shimmer 带 `file…` fallback；completed 态去掉 `+0` 的多余显示。
- **CSS**：新增 `.file-diff-block.is-streaming`、`.file-diff-content.is-streaming-content`、`.streaming-cursor` 闪烁动画。
- **测试**：新增 `partial-args.test.ts`（13 用例）、`streaming-preview-extractors.test.ts`（10 用例）、`bridge.test.ts` 增加 `tool_call_streaming` 推送顺序与未注册工具不 emit 两个用例；新增 `file-diff-block.test.tsx`（7 用例覆盖 running shimmer / streamingContent 展开 / completed 折叠展开）。
- **文档**：`current-module-map.md` 加 partial-args/streaming-preview-extractors；`tool-preview-design-guidelines.md` 增加 `tool_call_streaming` 契约、write/edit 流式约定差异、新增工具检查清单；`中间消息区规范.md` 增加「4 阶段工具生命周期」段落；新增 `docs/learnings/2026-05/llm-tool-call-streaming.md` 沉淀流式协议设计原则。

### 🧠 Design Intent (Why)

旧 2 阶段协议 `tool_started → tool_finished` 把 LLM 串 args 的耗时整段塞在 tool_started 之前，导致 assistant 文本结束到工具行出现之间出现长时间静默。修复思路有两条路：

- 把工具调用前的所有原始 byte 转发给前端，前端自己解析 partial JSON → 工具种类 / 字段 / 状态。优点是后端简单，缺点是每个前端工具都要重写一份 partial 解析，规则散乱，容易跟后端 `createToolUiPreview` 不一致。
- 后端在已经累积 partial args 的位置上「随手」解析出 typed payload 再下发。前端零解析，复用 `tool_started` 渲染分支。

最终选了第二条，由「后端转发颗粒度 ≈ 前端可消费颗粒度」这条原则统一所有流式事件（text_delta 字节流 / tool_call_streaming typed payload / tool_finished 完整态）。具体收益：前端 toolEntryToBlock 一个分支同时承担 4 个阶段；新工具接入只要在 streaming-preview-extractors 加一行 extractor，前端零改动；多 LLM provider 的 partial JSON 怪习只在后端集中应对。

write_file 的 streamingContent 是这个协议的最佳实例 —— 后端 50ms throttle 推 typed preview，前端复用 FileDiffBlock 拿到 streamingContent 字段直接展开 code preview + 光标。edit-file 没有同等待遇是因为它的 diff 需要文件原始内容 + old/new 替换三件齐全才能生成有定位的 unified diff，强行展示 partial old/new 会误导用户，所以 extractor 故意只提取 path。

为防止 argsProgress→executing 阶段切换时 content 闪烁消失，`bridge.createToolUiPreview` 的 write 分支在 `output === ""` 时把 args.content 当作 streamingContent 传出，让 tool_started 的 preview 也带 streamingContent，前端无缝过渡到 finished 态的 diff 视图。

### 📁 Files Modified

- `packages/shared/src/session.ts`
- `packages/agent-core/src/llm/types.ts`
- `packages/agent-core/src/llm/convert.ts`
- `packages/agent-core/src/llm/services/mock.ts`
- `packages/agent-core/src/engine/partial-args.ts`（新增）
- `packages/agent-core/src/engine/streaming-preview-extractors.ts`（新增）
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/test/partial-args.test.ts`（新增）
- `packages/agent-core/src/engine/test/streaming-preview-extractors.test.ts`（新增）
- `packages/agent-core/src/engine/test/bridge.test.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/messages/FileDiffBlock.tsx`
- `packages/desktop/src/renderer/styles.css`
- `packages/desktop/src/renderer/test/file-diff-block.test.tsx`（新增）
- `docs/design-docs/agent-current-module-map.md`
- `docs/design-docs/agent-tool-preview-design-guidelines.md`
- `docs/design-docs/front-中间消息区规范.md`
- `docs/learnings/2026-05/llm-tool-call-streaming.md`（新增）
