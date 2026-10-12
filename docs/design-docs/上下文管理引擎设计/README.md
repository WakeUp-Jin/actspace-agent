# 上下文管理引擎设计

本专题同时保留第一版实现契约与第二版设计。这里的“V2”指上下文管理引擎的第二版，不是整个 ActSpace Runtime 的版本，也不意味着 Session 存储格式升级。

- **下一版设计**：[上下文管理引擎 V2](上下文管理引擎V2/README.md)。2026-10-11 讨论整理，等待文档审阅，尚未编写执行计划或修改实现。
- **当前实现**：[Context 与 LlmInput](Context数据结构和模型输入数据结构的设计规范.md)、[插件职责](上下文管理引擎的插件拆分和上下文的插件拆分.md)。当前 Context 仍是请求级不可变对象，来源行为尚未全部拆成独立 workspace 包。
- **延续的领域规则**：[渐进式披露](agent-progressive-disclosure.md)、[压缩提示词](agent-compaction-prompt.md)、[插件设计原则](agent-plugin-design-principles.md)。具体继承与变化见 V2 漂移核对。
- **历史实施证据**：[第一版执行摘要](../../exec-runs/20261006-context-management-engine/execution-summary.md)、[后续修复摘要](../../exec-runs/20261006-context-acceptance-bugfix/execution-summary.md)。旧验收不等于 V2 已实现或已通过验收。

阅读 V2 时，从组装、使用和下一次组装开始；查当前生产行为时，仍要对照第一版源码与执行证据。尚未实现的 V2 契约不能覆盖当前事实。
