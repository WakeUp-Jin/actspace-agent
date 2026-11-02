# 自动化可支持的边界

以下均已包含在本轮工程链通过的测试中；不能代替相应真实UI子步骤。

| 验收点 | 已有证据 | 实机限制 |
| --- | --- | --- |
| R7步数收尾 | agent-loop/tool-stream.test.ts验证主/子Agent最后一步无工具总结；client/step-limit-projection.test.ts验证实际步数中性提示与历史窗口缺步数兜底 | 不改1000步上限，不靠合成轮次声称触发真实上限 |
| R7审批超时 | tool-runtime/runtime.test.ts验证Host返回审批超时后告诉模型不重试；prepared-execution.ts与Host registry的默认值均三小时 | 未等待三小时，真实到期与卡片呈现未覆盖 |
| R4超时/重试 | llm-pi-ai/transport-failure.test.ts覆盖超时、目标host及runtime/output等普通文本不误判；llm-service/retry-policy.test.ts验证默认两次重试及非可重试失败 | 本轮原生CUA+隔离HTTP夹具已验断连3POST/2重试、400普通文本非超时及恢复；实际timeout分支仅自动化，未拿断连代签超时 |
| H16投影一致性 | Desktop harness-stats.test.ts验证真实投影字段、同批重放/分批等价、归档重建、文件半行/截断、版本读取 | 真实Host文件、UI增量与删除重建另验 |
| H16运行时采集 | harness-stats包16测试覆盖直方图/跨月、代理对象/异步错误、listener/load错误、flush/隐私元数据与关闭开关 | 文件大小仅短时样本；不推断长期内存和月规模 |
| H16规则阈值 | tmp独立查询驱动，33个样本覆盖12规则，32通过/1失败UA-003 | 属于隔离合成数据查询验证，不是Computer Use，也不是正式新增回归测试 |

具体命令、时长、退出码见engineering.md及本地原始日志。本表引用的是本轮实际执行的现有测试，不从历史摘要迁移通过结论。
