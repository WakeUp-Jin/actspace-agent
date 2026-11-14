# 上下文管理引擎设计

每次模型请求之前，上下文怎样组装、怎样随对话变长而整理。代码在 `packages/context/`。

| 文档 | 管什么 |
|---|---|
| [上下文引擎规范](agent-context-engine.md) | Context 的身份与寿命、来源、补充与临时插槽、每个 Step 的顺序、到 `LlmInput` 的转换、已信任的对话视图、给界面的投影 |
| [渐进式披露](agent-progressive-disclosure.md) | 路径的登记、活跃与睡眠、周期规则、和压缩一起提交 |
| [上下文压缩](agent-context-compaction.md) | 触发、选段、摘要、提交与失败处理 |

相邻主题不在这里：

- Context 面板的界面、读取接口和上下文历史索引：[front-Context面板规范](../frontend/front-Context面板规范.md)。
- 请求记录（`request/context` 等）和估算算法：[请求记录与上下文估算](../agent-plugin-runtime/agent-spec-request-record.md)。
- provider 用量与估算的区别：[Token Usage 与 Context Projection](../model-context/agent-token-usage-and-context-state.md)。
- 工具结果的体积上限与输出文件：[工具输出与引用](../tool-system/agent-tool-output-references.md)。
