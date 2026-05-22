# 工具调度、权限审批与输出裁剪

工具调度器管理工具从 LLM 输出到最终结果回填的完整生命周期。

## 工具调度生命周期

一次工具调用经历以下状态流转：

```
validating → awaiting_approval → scheduled → executing → success/error/cancelled
```

1. **validating**：解析参数 + 调用 check_permissions 验证权限
2. **awaiting_approval**：审批模式检查，判断是否需要用户确认
3. **scheduled**：验证通过，准备执行
4. **executing**：调用 handler 执行工具逻辑
5. **render_result**：将 ToolResult 格式化为 LLM 可读文本
6. **OutputTruncator**：对输出进行裁剪/摘要
7. **success / error / cancelled**：最终状态

每次状态变更都记录到 ToolCallRecord 中，包含时间戳和耗时信息，用于调试和性能分析。

## 权限审批机制

### 审批模式

- **YOLO 模式**：全部自动批准，适合开发调试
- **Default 模式**：非只读工具需要用户确认

### 权限验证函数（check_permissions）

每个工具可以有自己的权限验证函数，在 validating 阶段调用。它可以：
- 拒绝执行并返回错误原因
- 通过验证并修正参数（通过 sanitized_args 返回）
- 通过验证使用原始参数

验证函数的设计原则：做安全检查和参数清洗，不要做业务逻辑。

### 权限配置文件

更高级的权限控制通过配置文件实现：

```
allow: ["Read", "Bash(git *)"]     # 自动通过
deny:  ["Bash(rm -rf*)"]           # 始终拒绝
ask:   ["Bash(npm publish*)"]      # 始终询问
```

这让用户可以细粒度控制 Agent 的能力边界，而不是只能切换整体模式。

### AllowList 机制

当用户选择"本次会话允许"时：
- 命令执行工具：记录命令前缀到 allowList，后续相同前缀的命令自动通过
- 编辑类工具：切换到编辑模式，该类工具全部自动通过

## 输出裁剪（OutputTruncator）

工具执行完毕后，输出可能非常大（比如读取一个大文件、执行一个输出大量日志的命令）。OutputTruncator 在结果回填到上下文之前进行裁剪。

裁剪策略：
- 设定最大字符数阈值（建议 2000 字符）
- 未超过阈值：直接使用完整输出
- 超过阈值：调用快速模型生成摘要，或保留头尾截断中间
- 特殊处理：将完整输出写入临时文件，摘要中包含文件路径供 Agent 按需深读

摘要函数（SummarizeFn）是可注入的依赖——可以用不同的模型或策略来实现摘要逻辑。

## 并行调度

只读工具（is_read_only=true）可以并行执行。当 LLM 一次输出多个 tool_calls 时：
- 所有只读工具并行执行
- 非只读工具串行执行（避免竞态）
- 混合情况：只读工具先并行执行，非只读工具排队

参考代码: `examples/tool-scheduler.ts`

## 注意事项

- 审批超时需要有兜底——如果用户长时间不响应，工具状态应变为 cancelled 而非无限等待
- OutputTruncator 的摘要质量直接影响 Agent 后续决策。如果摘要丢失关键信息，Agent 可能重复执行相同操作
- ToolCallRecord 的耗时数据对性能优化很有价值——可以发现哪些工具是瓶颈
- 调度器不应该了解具体工具的业务逻辑，它只管理生命周期
