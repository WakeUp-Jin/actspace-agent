---
description: "子智能体：把任务交给独立的子会话，后台并行，可续派、可插话、可中断。管理器在 Host，工具定义在 Harness。"
kind: "package-group"
---

# subagent

子智能体是主会话派出的独立子会话（`agent_id` 就是子会话 id）。默认后台运行，完成后给主会话发通知；空闲后可以用 `send_message` 续派，运行中可以插话或 `interrupt_agent` 中断。全程留痕：每个子智能体有一份 Markdown transcript，路径在创建时、运行中和完成时都告诉主智能体。

管理器（`SubagentManager`）在 Host，工具定义（`agent`、`send_message`、`wait_agent`、`list_agents`、`interrupt_agent`、`list_subagent_models`）在每个会话的 Harness 里，两者通过 `actspace.host.subagents` 端口相连。预设两个：`general`（继承父会话可用工具，可写）、`explore`（只读）。子智能体不弹审批，需要审批的操作直接返回说明文字；同一主会话最多 10 个子智能体。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `subagent` | 接口 | 不在默认组合 | — | `SubagentManager`（创建、续派、插话、中断、完成通知、重启后补 `lost`）、child Session、Preset、模型可见文字、六个工具的注册函数；由运行时创建、`tool-subagent` 注册工具 |
| `tool-subagent` | 工具 | 会话 | 开 | 六个子智能体工具插件；提供 `tools.subagents` |

## 包之间怎么连

- `core/runtime` 的 `agent-runtime` 创建 `SubagentManager`（子会话的运行租约来自 `harnesses.acquireForScope`，循环来自 `agent-factory` 的 `createSubagentLoop`）；启动时（`runtime/src/startup/boot.ts`）把它以 Host 端口 `actspace.host.subagents` 暴露给 Harness。打开会话时 `recoverLost` 把上次没收尾的激活补成 `lost` 并通知主会话。
- 状态全部从主会话 Journal 的 `subagent/spawned`、`subagent/activation` 折叠出来（`@actspace/shared/runtime-v2` 的 `foldSubagentTree`）；老会话的 `delegation/*` 只读展示。
- `tool-subagent` inject `tools.runtime`、`agent.registry`、`actspace.host.subagents`：用 `subagent` 的 `registerSubagentTools` 把六个工具注册到工具运行时；卸载时撤销注册。
- 运行中的子智能体清单由 `context/context-subagents` 写进主会话上下文（读端口的 `running(sessionId)`）。
- `subagent` 依赖 `agent-loop`、`scope`、`agent`（收件箱）、`session-journal`、`session-persistence`（创建子会话）、`tool-runtime`。

## 入口与测试

- `subagent/src/manager.ts`、`tools.ts`、`messages.ts`、`child-session.ts`、`preset.ts`；`tool-subagent/src/plugin.ts`。包 README 见 [subagent](subagent/README.md)。
- 测试在各包 `src/test/`：`pnpm --filter @actspace/subagent test`、`pnpm --filter @actspace/tool-subagent test`。
- 设计见[子智能体设计规范](../../docs/design-docs/子智能体和后台任务设计规范/02-子智能体设计规范.md)。

## 怎么扩展

新增一种预设：在 `subagent/src/preset.ts` 加工具集，在 `@actspace/shared/runtime-v2` 的 `SUBAGENT_PRESETS` 登记，再把 `agent` 工具的 `agent_preset` 枚举和设计 02 的说明文字一起改。通用步骤见[总地图](../README.md)。
