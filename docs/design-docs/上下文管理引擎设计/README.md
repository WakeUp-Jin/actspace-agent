# 上下文管理引擎设计

这里的“V2”指上下文管理引擎的第二版，不是整个 ActSpace Runtime 的版本，也不意味着 Session 存储格式升级。本专题同时包含第一版实现契约与 V2 设计。

- **当前实现（V2）**：[上下文管理引擎 V2](上下文管理引擎V2/README.md)。V2 引擎（按 `Session + Agent 逻辑作用域` 管理的长期 Context 实例）、Context 面板与 SQLite 联合实现已落地，代码在 `packages/context/`。
- **数据结构与职责**：[Context 与 LlmInput](Context数据结构和模型输入数据结构的设计规范.md)、[插件职责](上下文管理引擎的插件拆分和上下文的插件拆分.md)。每次模型调用从 Context 生成不可变的 `LlmInput`；各来源行为分属 `packages/context/` 下独立 workspace 包。
- **性能约束**：[上下文引擎不再每次请求复制对话](../agent-plugin-runtime/agent-spec-context-trusted-surface.md)：日志交出的对话视图直接引用，`contextRevision` 与会话源缓存按对话版本号判断。
- **延续的领域规则**：[渐进式披露](agent-progressive-disclosure.md)、[压缩提示词](agent-compaction-prompt.md)、[插件设计原则](agent-plugin-design-principles.md)。
- **实施证据**：[第一版执行摘要](../../exec-runs/20261006-context-management-engine/execution-summary.md)、[后续修复摘要](../../exec-runs/20261006-context-acceptance-bugfix/execution-summary.md)、[V2 联合执行摘要](../../exec-runs/20261011-context-sqlite-integration/execution-summary.md)。

阅读 V2 时，从组装、使用和下一次组装开始。
