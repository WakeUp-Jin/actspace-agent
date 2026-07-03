# 运行态工具预览必须补齐完成态

关联 history：`docs/histories/2026-07/20260703-0937-write-tool-finished-preview.md`

## 是什么

工具 UI 预览不是只有“开始执行”时需要。对 `write_file` 这类先流式展示参数、再执行生成结果的工具，`tool_started.preview` 和 `tool_finished.preview` 必须来自同一套 typed preview 契约。

否则前端会在完成态继续拿 running 阶段的半成品 view model 渲染。

## 为什么会出问题

这次问题里，`write_file` 的 running preview 是对的：

- `tool_call_streaming` 从 partial args 里提取 `path` / `content`
- `tool_started` 用完整 args 补 `streamingContent`

但普通工具的 `tool_finished` 事件没有携带最终 preview，只有 SubAgent 的完成态会带 `uiPreview`。前端收到完成事件后只能把原来的 running preview 标记为完成，于是 `diff=""`、`additions=0` 的半成品数据被当成最终态显示，形成空白 diff 框。

## 怎么修

事件桥接层应在 `tool_end` 时用工具执行记录里的原始 args 和工具结果文本重新生成 preview：

```ts
const args = toolExecutions.get(event.toolCallId)?.args ?? {};
const output = getToolResultOutputText(event.result);
const summary = getToolSummary(event.toolName, previewKind, args, ok, output);

preview: event.result.subagent?.uiPreview
  ?? createToolUiPreview(previewKind, args, output, summary, ok)
```

这样实时事件和最终持久化事件都使用同一套 `createToolUiPreview()` 规则，`write_file` 完成后自然带上最终 diff 和行数统计。

## 核心要点

- `tool_started.preview` 适合表达“正在做什么”，不要拿它冒充最终结果。
- `tool_finished.preview` 应该表达“做完后发生了什么”，尤其是 diff、数量、状态这类只能执行后确认的字段。
- 前端组件不应该从 raw args 或 toolName 反推结果；缺 final preview 时应修 bridge 契约，而不是在 renderer 临时补逻辑。
- session 恢复 selector 也要保留同样字段，否则实时链路和恢复链路会出现展示差异。

## 常见陷阱

1. **只测 running，不测 finished**：流式 UI 看起来正常，但完成态会退回空数据。
2. **只修持久化，不修实时事件**：刷新后正常，运行中仍闪烁或空白。
3. **只在前端兜底**：短期遮住空框，长期会让每个工具都长出自己的猜测逻辑。

## 自检问题

1. 这个工具有哪些字段只能在 executor 完成后才知道？
2. `tool_started.preview`、`tool_finished.preview`、`tool_result.uiPreview` 是否使用同一套展示语义？
3. 如果从历史恢复同一条事件，renderer 会不会看到和实时运行时不同的字段？
