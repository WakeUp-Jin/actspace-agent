---
description: "待办工具（给模型用）和待办视图（给界面用）。"
kind: "package-group"
---

# todo

一个包提供两个插件：会话插件“待办”让 Agent 拆分任务、跟踪进度；全局插件“待办视图”把待办事件整理成界面能显示的状态。两者共享同一份事件定义。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `tool-todo` | 工具 | 全局+会话 | 开 | `todo_read`、`todo_write`（`todo-tools`，会话）和待办视图（`todo-projection`，全局）；带 Codec，事件 `plugin/actspace.todo/todo-write` |

## 包之间怎么连

- `todo-tools`（会话）inject `tools.runtime`、`session.runtime`，提供 `tools.todo`；工具读写通过当前会话的日志。
- `todo-projection`（全局，入口 `./projection`）inject `session.projection`，向会话视图注册待办投影；它在 Host 启动时加载一次，不随 Harness 变化。
- Codec 入口 `./codec` 在清单里挂在 `todo-tools` 行上，Host 恢复会话前加载。
- 依赖 `session-journal`、`session-persistence`、`session-projection`。

## 入口与测试

- `src/todo-tool.ts`（工具）、`src/projection-plugin.ts` 与 `src/projection.ts`（视图）、`src/codec.ts`、`src/todo.ts`（状态与规则）。包 README 见 [tool-todo](tool-todo/README.md)。
- 测试在 `tool-todo/src/test/`：`pnpm --filter @actspace/tool-todo test`。

## 怎么扩展

给新的会话状态做类似“工具 + 视图”的组合：写 Codec 和事件，工具放在会话插件里，视图以全局插件注册到 `session.projection`；两者各占清单一行。通用步骤见[总地图](../README.md)。
