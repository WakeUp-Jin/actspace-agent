# Agent 评估

评估是 Agent 开发的质量闭环——没有评估，任何改动都无法区分"改进"和"退化"。本模块从理论基础到工程实现，覆盖评估的完整链路。

## 本模块包含

| 文件 | 关注点 |
|------|--------|
| `evaluation-fundamentals.md` | 评估为何重要、四要素、开发集/留存集流程、三种评分方法（代码/人工/模型） |
| `agent-type-evaluation.md` | 四类 Agent（编码/对话/研究/计算机使用）的评估策略、pass@k 与 pass^k 指标 |
| `evaluator-implementation.md` | 评估器架构设计：测试数据集、事件系统采集、评估函数实现 |

## 阅读顺序

三个文件对应三个层次的问题：

1. **评估什么、怎么评分** → `evaluation-fundamentals.md`
2. **不同 Agent 类型有什么特殊的评估需求** → `agent-type-evaluation.md`
3. **如何把评估器落地成代码** → `evaluator-implementation.md`

如果你是第一次搭建评估体系，按顺序阅读。如果已有评估经验，直接跳到需要的文件。

## 相关代码示例

| 示例文件 | 展示的模式 |
|----------|-----------|
| `examples/evaluation-scoring.ts` | 评估工作流：测试集定义 → 批量运行 → 代码评分 → 失败分析 |
| `examples/evaluation-system.ts` | 评估器架构：类型体系 → EventBus 事件采集 → evaluate 对比函数 |

## 与其他模块的关系

- 评估中的"工具使用合理性"检查依赖 `references/tools/` 中的工具定义规范
- 评估中的"上下文利用质量"涉及 `references/context/` 中的上下文管理策略
- Agent 执行循环的评估视角参考 `references/agent-runtime/agent-patterns.md`
