# todo-tools

`@actspace/tools-todo-tools` 拥有 todo_read、todo_write 的工具定义、注册和 lifecycle。

公开入口：`.`、`./manifest`、`./plugin`、`./codec`。

依赖 Session Journal、Session Persistence 和 Session Projection；新事件为 `plugin/actspace.todo/todo-write`，不兼容旧事件。

详细契约见 [Tool 插件边界](../../../docs/design-docs/agent-plugin-runtime/agent-tool-plugin-boundaries.md)。
