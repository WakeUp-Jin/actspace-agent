---
description: "Agent 身份与注册表、Agent 循环、任务调度、工具运行时，以及把所有插件装配起来的 runtime。"
kind: "package-group"
---

# core

core 是 Agent 的主干。`agent`、`scope`、`agent-loop` 定义 Agent 是什么、怎么跑一轮；`tool-runtime` 注册并执行工具；`agent-service` 负责 Session 任务的接纳与调度；`runtime` 是总装配点，持有插件清单，把会话、Agent 和 Harness 接起来。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `agent` | 接口 | 全局 | 开 | Agent 与子 Agent 的身份、描述、收件箱、事件分发和注册表；提供 `agent.registry` |
| `agent-loop` | 实现 | 不在默认组合 | — | 默认的 Agent 循环（`AgentLoop`）；`runtime` 的 `agent-factory` 直接引用它，只在 CLI 装配（`apps/cli/cordis.yml`）里作为插件加载 |
| `agent-service` | 库 | 不在默认组合 | — | Session 任务的接纳、队列和 Run 调度；Codec 由基础 Bundle 准入，行为由应用直接调用 |
| `runtime` | 装配 | 全局+会话 | 开 | 插件清单 `PLUGIN_CATALOG`、Host 启动与退出、会话接线、默认 Harness、Host 读模型；一个包里有四个插件（见下） |
| `scope` | 库 | 不在默认组合 | — | Agent 作用域（`AgentScope`）和分层注册表，由 Agent 注册表等包直接引用 |
| `tool-runtime` | 接口 | 会话 | 开 | 工具注册、参数校验、调度执行、权限评估和结果记录；提供 `tools.runtime` |

`runtime` 里的四个插件：`actspace-runtime`（运行时底座）、`session-runtime`（会话运行时）、`agent-runtime`（Agent 运行时）三个是全局插件，`agent-factory`（Agent 循环）是会话插件。它们的 manifest 在 `runtime/src/manifests.ts`。

## 包之间怎么连

连接关系来自各插件 manifest（`pnpm gen:contract-matrix` 生成的[矩阵](../../docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md)可对照）。

- **全局，启动时加载：** `actspace-runtime`（inject `actspace.host`）；`session-runtime`（provides `session.runtime`，inject `session.journal`、`session.store`、`session.projection`）；`core-agent`（`agent` 包，provides `agent.registry`）；`agent-runtime`（provides `agent.runtime`、`agent.service`、`harness.control`、`harness.hmr`、`harness.plugin-manager`；inject `agent.registry`、`session.runtime`、`session.checkpoint` 和一批 `actspace.host.*` 端口）。
- **会话，每个 Harness 一份：** `tools-runtime`（provides `tools.runtime`，inject `tools.approval`）；所有 `tool-*` 工具插件都 inject `tools.runtime`；`agent-factory`（provides `agent.run-factory`）inject `agent.registry`、`session.runtime`、`session.checkpoint`、`llm.service`、`tools.runtime`、`prompt.runtime`、`context.engine`、`context.source.system`、`context.source.conversation`。
- `agent-factory` 用 `agent-loop` 的 `AgentLoop` 建循环，并按 `context.source.*` 搭起 Context 来源；`agent-runtime` 为每个会话挂载 Harness、租用组合并运行。
- `agent-service` 不导入默认循环和 runtime，只依赖结构化的 `RunFactory` 和 `RunLease`。

## 入口与测试

- `runtime/src/plugin-catalog.ts`：唯一插件清单；`runtime/src/manifests.ts`：runtime 自带四个插件的 manifest；`runtime/cordis.yml`：由清单生成，勿手改。
- `runtime/src/startup/`、`session/`、`harness/`、`profiles/`、`projection/`：分别是启动退出、会话接线、执行组合与默认 Harness、默认声明、Host 读模型。`runtime/scripts/build-default-harness.mjs` 把清单里的会话插件打成固定 ESM。
- 测试在各包 `src/test/` 或 `src/**/*.test.ts`：`pnpm --filter @actspace/runtime test`，其他包同理。`agent-service` 另见[包 README](agent-service/README.md)。

## 怎么扩展

- 新增一个插件：见[总地图](../README.md)“新增一个插件”，登记到 `runtime/src/plugin-catalog.ts`。
- 改 Agent 循环：主体在 `agent-loop/src/loop.ts`，会话里的调用边界在 `runtime/src/harness/agent-factory-plugin.ts`。
