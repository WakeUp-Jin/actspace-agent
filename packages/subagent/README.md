---
description: "子 Agent：把任务交给独立的子会话去做。调度在 Host，工具定义在 Harness。"
kind: "package-group"
---

# subagent

子 Agent 使用独立的 child Session 和受限的 Scope，一次性运行，不支持续跑。调度（开子会话、起循环、记录终态）在 Host，工具定义（`agent`、`explore`）在每个会话的 Harness 里，两者通过 `actspace.host.subagents` 端口相连。

当前两个内置 Preset（`actspace.agent`、`actspace.explore`）只允许只读工具，默认最多 1000 步、30 分钟；Bash、编辑和子任务审批暂不开放，workspace guard 不变。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `subagent` | 接口 | 不在默认组合 | — | 一次性子 Agent 调度库：`OneShotSubagentProvider`、child Session、Preset、终态结果、`agent` / `explore` 工具注册函数；由 `tool-subagent` 与运行时直接调用 |
| `tool-subagent` | 工具 | 会话 | 开 | `agent`、`explore` 工具插件；提供 `tools.subagents` |

## 包之间怎么连

- `core/runtime` 的 `agent-runtime` 创建 `OneShotSubagentProvider`；启动时（`runtime/src/startup/boot.ts`）把它的 `invoke` / `launch` 以 Host 端口 `actspace.host.subagents` 暴露给 Harness。
- `tool-subagent` inject `tools.runtime`、`agent.registry`、`actspace.host.subagents`、`actspace.host.background-tasks`：用 `subagent` 的 `registerSubagentTools` 把两个工具注册到工具运行时，通过登记表支持后台子 Agent；卸载时撤销注册。
- `subagent` 依赖 `agent-loop`（子会话的循环）、`scope`、`agent`、`session-persistence`、`session-persistence-jsonl`（创建子会话）、`llm-service`、`tool-runtime`、`background-tasks`。

## 入口与测试

- `subagent/src/provider.ts`、`child-session.ts`、`preset.ts`、`agent-tool.ts`、`explore-tool.ts`、`tool-plugin.ts`；`tool-subagent/src/plugin.ts`。包 README 见 [subagent](subagent/README.md)。
- 测试在各包 `src/test/`：`pnpm --filter @actspace/subagent test`、`pnpm --filter @actspace/tool-subagent test`。
- 设计见[子 Agent 运行时](../../docs/design-docs/collaboration/agent-subagent-runtime.md)。

## 怎么扩展

新增一种子 Agent：在 `subagent/src/preset.ts` 注册新的 Preset（可用工具、步数、时限、委派深度），再在 `agent-tool.ts` / `explore-tool.ts` 同类位置暴露工具。通用步骤见[总地图](../README.md)。
