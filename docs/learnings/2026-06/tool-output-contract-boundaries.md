# 工具输出压缩要尊重契约边界

关联 history：`docs/histories/2026-06/20260604-0234-agent-tool-contract-output.md`

## 是什么

工具输出压缩不是一个可以无差别套在所有工具结果上的后处理。它适合处理“普通工具原文太长，模型只需要摘要”的场景，但不适合处理已经由上游 runtime 组织好的结构化结果。

Agent 工具就是这种例外：它返回给主 Agent 的 `modelOutput` 已经是 SubAgent runner 的最终报告、证据摘要、`transcriptRef` 和 stats。再把它送进普通 `processToolOutput()`，等于把一个契约输出当成普通 stdout 重新裁剪，消费方会拿到不完整甚至误导的结果。

## 为什么需要

通用后处理很容易变成“看起来安全”的统一入口：

```ts
const processed = await processToolOutput(tool.previewKind, rawData, config);
return { ...result, data: processed.modelOutput };
```

这对 `generic`、`web_search`、大段 `read_file` 输出有价值，因为它们的原始文本本来就可能很长、可重新执行或分页恢复。

但对契约型工具有风险：

- `bash` 自己负责流式落盘、头部截断和 `outputRef`，调度层再压缩会丢执行语义。
- `agent` 自己负责把 SubAgent 内部探索收敛成主 Agent 可消费报告，调度层再压缩会破坏最终 summary 和 transcript 引用。
- UI 如果从 transcript 日志里“猜最后一条 assistant 文本”，也会把中途过程消息误判成最终报告。

## 怎么做

把工具结果分成两类：

- **普通原文型输出**：适合统一压缩。比如 `generic`、`web_search`、搜索结果、文件读取结果。
- **契约型输出**：由 executor/runtime 拥有输出格式，调度层只透传。比如 `bash`、`agent`。

代码上应显式写出边界：

```ts
if (tool.previewKind === "bash" || tool.previewKind === "agent") {
  return rendered !== undefined ? { ...result, data: rendered } : result;
}
```

测试上要做负向锁定：制造一个超过普通阈值的 Agent summary，断言它不包含 `[已压缩摘要]`，且 `outputRef` 仍是 executor 设置的引用。这样未来有人调整压缩流水线时，会立刻撞到契约测试。

UI 上也要避免从过程日志推断最终状态：

```ts
const finalReport = finalReportFromAgentSummary(message) ?? transcriptFallback;
```

`message.summary` 是 Agent block 的持久化 view model，来自 SubAgent runner 最终 `output.summary`；transcript assistant 文本只是旧数据兜底。

## 常见陷阱

- 不要用 `previewKind` 的名字相似性判断是否能压缩。`agent` 虽然也是工具 preview，但它不是普通工具原文。
- 不要让通用 post-process 改写 executor 已经设置好的 `outputRef`。契约型工具的引用通常有特殊含义。
- 不要从 sidecar transcript 的“最后一条某类型事件”推导最终报告。日志顺序是执行过程，最终结果应该有明确字段。
- 不要只测短输出。压缩 bug 往往只在超过阈值时出现。

## 自检问题

- 这个工具返回的是原始文本，还是一个已经设计好的跨模块契约？
- 如果调度层压缩它，消费方会丢失哪些必须字段或语义？
- 最终 UI 显示的数据有没有明确事实源，还是从日志事件里猜出来的？
