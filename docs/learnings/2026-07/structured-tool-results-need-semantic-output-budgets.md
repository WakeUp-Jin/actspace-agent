# 结构化工具结果需要语义化输出预算

## 问题

统一的工具输出裁剪器通常按字符数工作：短输出原样返回，长输出截断或交给快速模型摘要。这个策略适合日志、网页正文和一般说明，但对 DOM 节点、搜索命中、协议 schema 等结构化事实存在隐藏风险。

如果后续操作依赖某个恰好位于输出中间的节点，摘要器无法提前知道它的重要性。摘要本身可能语言流畅、结论合理，却删除了唯一可操作的标识符，迫使 Agent 退化为猜测、重复扫描或坐标探测。

## 核心区分

工具输出至少应区分三类：

1. **可摘要正文**：网页正文、普通说明、冗长日志。可以使用摘要或头尾截断。
2. **结构化列表**：搜索结果、DOM 节点、历史记录。应该分页，并只在完整 item 边界停止。
3. **精确协议事实**：工具 schema、错误码、参数约束。应该在合理硬上限内逐字保留，不能改写。

统一阈值无法同时满足三类输出。正确抽象不是“把阈值调大”，而是让 executor 声明自己已经按语义完成预算控制，再由调度器决定是否跳过通用摘要。

## 推荐模式

```ts
interface ToolResult {
  data: string;
  preserveModelOutput?: boolean;
}
```

只有满足以下条件的 executor 才能设置 `preserveModelOutput`：

- 已有明确的字符或 item 上限；
- 超限行为可观测；
- 不会截断半个结构单元；
- 输出中包含 total/returned/truncated 或等价元数据；
- 测试覆盖目标位于输出中后部的情况。

例如 DOM snapshot 可以采用：

```text
DOM snapshot total=637 returned=500 rendered=472 truncated=true
[4:1] <a> text="首页" href="/"
[4:2] <a> text="动画" href="/c/douga/"
...
[DOM_SNAPSHOT_TRUNCATED] omitted=165
```

列表型工具则优先使用：

```json
{
  "values": [],
  "total": 1537,
  "offset": 200,
  "returned": 200,
  "has_more": true
}
```

## 常见陷阱

- **双重裁剪**：executor 先硬切一次，scheduler 再摘要一次。后层即使提高阈值，也无法恢复前层丢失的内容。
- **静默默认值**：把显式的 0 改成较大默认值，会制造难以解释的外部状态变化。
- **pretty JSON 膨胀**：结构化结果直接 pretty-print 会浪费大量字符预算；逐 item 紧凑行更适合模型读取。
- **只保留总摘要**：batch 工具如果只返回 action 名称，读取 action 的实际价值会完全丢失。
- **全局扩容**：因为一个结构工具被截断而提高所有工具阈值，会把局部修复变成上下文膨胀问题。

## 自检问题

1. 这个输出中的任意一个中间 item 是否可能成为下一步操作目标？
2. 截断发生时，模型能否知道遗漏数量以及如何读取下一页？
3. executor 和 scheduler 是否可能分别裁剪一次同一份结果？

关联 history：`docs/histories/2026-07/20260712-1825-browser-output-fidelity.md`。
