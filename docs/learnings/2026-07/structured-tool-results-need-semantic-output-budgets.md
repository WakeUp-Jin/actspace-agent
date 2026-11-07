# 工具输出的预算与压缩：按语义分类，契约型输出不被通用压缩改写

合并自：结构化工具结果需要语义化输出预算、工具输出压缩要尊重契约边界、工具元数据要穿过压缩链路、Raw Prefix Plus Summary Compression。

关联：`docs/histories/2026-07/20260712-1825-browser-output-fidelity.md`、`docs/histories/2026-06/20260604-0234-agent-tool-contract-output.md`、`docs/histories/2026-06/20260614-1245-glob-size-mtime-output.md`、`docs/histories/2026-06/20260614-1826-tool-output-raw-prefix-summary.md`

> 历史说明：文中 `processToolOutput()`、`preserveModelOutput`、`finalReportFromAgentSummary`、`[已压缩摘要]` 是 v1 调度层的具体实现，当前代码已不存在（已 grep 确认）。保留的是分类原则与测试方法；新实现时请先在 `packages/core/` 里找现行的输出预算入口再对照。

统一的工具输出裁剪器按字符数工作：短输出原样，长输出截断或交给快速模型摘要。对日志、网页正文合适，对结构化事实、契约型输出、带决策元数据的输出都有隐藏风险。

## 1. 先给输出分类

| 类别 | 例子 | 策略 |
|---|---|---|
| 可摘要正文 | 网页正文、普通说明、冗长日志、`generic`/`web_search`/大段 `read_file` | 摘要或头尾截断 |
| 结构化列表 | 搜索结果、DOM 节点、历史记录 | 分页，只在完整 item 边界停止，带 total/returned/truncated |
| 精确协议事实 | 工具 schema、错误码、参数约束 | 合理硬上限内逐字保留 |
| 契约型输出 | `bash`（自己流式落盘、头部截断、`outputRef`）、`agent`（`modelOutput` 已是 SubAgent 最终报告+证据摘要+`transcriptRef`+stats） | executor/runtime 拥有格式，调度层只透传 |

摘要本身可以语言流畅、结论合理，却删掉恰好位于中间、下一步要操作的唯一标识符，迫使 Agent 猜测、重复扫描或坐标探测。正确抽象不是调大阈值，而是 executor 声明“我已按语义完成预算控制”，调度器据此跳过通用摘要（旧实现是 `ToolResult.preserveModelOutput`）。设置该声明的 executor 要满足：有明确字符/item 上限；超限可观测；不截断半个结构单元；输出含 total/returned/truncated 或等价元数据；测试覆盖目标位于中后部的情况。

```text
DOM snapshot total=637 returned=500 rendered=472 truncated=true
[4:1] <a> text="首页" href="/"
...
[DOM_SNAPSHOT_TRUNCATED] omitted=165
```
列表型则 `{ values, total, offset, returned, has_more }`。

## 2. 契约型输出：负向锁定 + 事实源明确

对契约型工具，通用后处理应显式排除（旧代码 `if (tool.previewKind === "bash" || "agent") return result`），不要靠 `previewKind` 名字相似性判断；也别让通用后处理改写 executor 设好的 `outputRef`。测试用负向锁定：造一个超普通阈值的 Agent summary，断言不含压缩标记、`outputRef` 仍是 executor 设置的。别只测短输出，压缩 bug 往往只在超阈值时出现。UI 也不要从 sidecar 日志“最后一条 assistant 文本”猜最终报告——日志顺序是过程，最终结果要有明确字段（`message.summary` 是持久化 view model，transcript 文本只是旧数据兜底）。

## 3. 压缩要保留“高保真锚点”和决策元数据

- **原始前缀 + 模型摘要**：压缩标记（说明非完整原文并给恢复路径）+ 原始前 N 字符（固定预算，旧实现 2000）+ 模型摘要。前缀常含路径、命令、文件头、表头、错误上下文、版本信息，摘要可能改写或漏掉；适用于完整原文可通过重跑/分页/`rawOutputRef` 找回的长输出。无摘要模型的 fallback 确定性头尾截断本身已保留头尾，不要再拼前缀造成膨胀。bash 仍走逐字头部 + 文件路径策略。
- **元数据穿过压缩链路**：新增“帮助模型判断复杂度/相关性”的字段（文件大小、mtime）时检查三处：executor/renderer 原始输出含该字段；truncator/summarizer prompt 要求压缩后保留；测试锁住“字段存在”和“字段语义”。小仓库里工具变聪明、大结果集里一压缩又退回路径列表，就是漏了第二处。排序使用某字段不等于模型看到了它：`glob` 按 mtime 倒序只暗示相对顺序，模型不知道差 1 分钟还是 3 个月。

## 陷阱汇总

- **双重裁剪**：executor 硬切一次，scheduler 再摘要一次，后层调高阈值也恢复不了前层丢的内容。
- 静默默认值：把显式的 0 改成较大默认值，制造难解释的外部状态变化。
- pretty JSON 膨胀：逐 item 紧凑行更适合模型读取。
- 只保留总摘要：batch 工具只返回 action 名称会丢掉 action 的实际价值。
- 全局扩容：因一个结构工具被截断就调高所有工具阈值，局部修复变上下文膨胀。

## 自检

1. 输出中任一中间 item 会不会成为下一步操作目标？截断时模型知道遗漏数量与如何读下一页吗？
2. 这个工具返回的是原始文本，还是已设计好的跨模块契约？调度层压缩会丢什么字段？
3. executor 与 scheduler 会各裁一次同一份结果吗？
4. 这个字段是 UI 装饰还是模型决策信号？压缩后还在吗？
