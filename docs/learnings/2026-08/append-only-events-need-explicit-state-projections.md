# Append-only 事件需要显式状态投影

## 问题

工具调用日志天然适合 append-only：每次调用都有 call 和 result，便于审计和恢复。但 Todo、进度条、当前配置等 UI 表达的是“现在是什么状态”，不是“发生过多少次操作”。如果 renderer 直接逐条展示事件，同一个 Run 每更新一次 Todo 就会多出一张列表；如果恢复器简单寻找最近一个 Todo 事件，又可能把筛选后的读取结果或失败写入误当成权威状态。

## 先区分事实与投影

事件日志保存过程事实，状态投影负责折叠这些事实：

```text
todo_write success revision 1  -> authoritative snapshot 1
todo_read filtered             -> observation only
todo_write failed              -> old snapshot remains authoritative
todo_write success revision 2  -> authoritative snapshot 2
```

恢复规则不是“找最近相关事件”，而是“找最近满足权威条件的事件”。这里的条件包括同一 `sessionId + agentRunId`、工具名为 `todo_write`、执行成功，以及结构化快照通过防御性校验。

## 实时与恢复必须共用 View Model

实时流和历史恢复如果各自解析 raw arguments，迟早会漂移。更稳妥的路径是让状态所有者生成一个结构化 preview：

1. executor 提交成功后生成完整 snapshot。
2. bridge 把 snapshot 转成统一的 UI preview。
3. renderer 按稳定的 Run 级 key 替换旧投影。
4. session selector 从持久化结果生成同一种 preview。

这样实时界面与重启后的历史界面消费同一契约。raw args 仍用于执行和审计，但不是展示事实源。

## Partial JSON 是另一类风险

字符串路径可以从不完整工具参数中安全提取，但数组状态不能。模型流式输出 Todo 数组时，半个对象可能缺 ID、状态或后续项目；提前解析会制造闪烁和错误完成数。状态型工具在参数未闭合时应继续展示上一个稳定快照，等 executor 完整校验并原子提交后再切换。

## 可迁移规则

- 先定义哪些事件能改变权威状态，读取、预览和失败事件默认不能。
- reducer 的 key 应对应产品状态作用域，而不一定是单次 `toolCallId`。
- executor 先全量校验再一次提交，失败时 revision 和旧快照都不变。
- 持久化结构化状态，而不是在恢复时解析模型文案或压缩后的 output。
- UI preview 是跨运行时与 renderer 的稳定契约，不是临时日志摘要。

本知识点来自 [Agent Todo 工具 V1 history](../../histories/2026-08/20260809-0010-agent-todo-tools.md)。
