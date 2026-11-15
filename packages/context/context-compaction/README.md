# @actspace/context-compaction

压缩策略：什么时候压、压哪一段、怎样生成摘要；向引擎的协调器登记，提供 `compaction.runtime`、`compaction.surface`。摘要的提交在 `context-engine` 的 `compaction.ts`，不在本包。行为规则见[上下文压缩](../../../docs/design-docs/上下文管理引擎设计/agent-context-compaction.md)，这里只说代码在哪。

公开入口：`.`、`./manifest`、`./plugin`。

| 文件 | 内容 |
| --- | --- |
| `plugin.ts` | `CompactionService`：选摘要路由、建摘要器、向协调器登记策略；`CompactionPlugin`：策略本身，含可覆盖的触发比例（`withTriggerRatio`） |
| `policy.ts` | 默认比例、预留和最少条数（`DEFAULT_COMPACTION_POLICY`），阈值算法（`compactionThreshold`） |
| `region.ts` | 选段（`chooseCompactionRegion`）：留下最后一条，不拆开工具调用和它的结果 |
| `summarizer.ts` | `LlmCompactionSummarizer`：一次不带工具的辅助请求；`DeterministicCompactionSummarizer` 只给测试用 |
| `prompts.ts` | 摘要的系统指令、模板和合并旧摘要的规则。改措辞只改这里 |
| `OPEN_CODE_LICENSE.txt` | 提示词上游（OpenCode）的 MIT 许可证 |

测试：`pnpm --filter @actspace/context-compaction test`。
