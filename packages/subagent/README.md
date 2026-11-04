---
description: "子智能体：把任务交给独立的子会话，后台并行，可续派、可插话、可中断；也可以交给本机的 Codex / Claude Code。管理器在 Host，工具定义在 Harness。"
kind: "package-group"
---

# subagent

子智能体是主会话派出的独立子会话（`agent_id` 就是子会话 id）。默认后台运行，完成后给主会话发通知；空闲后可以用 `send_message` 续派，运行中可以插话或 `interrupt_agent` 中断。全程留痕：每个子智能体有一份 Markdown transcript，路径在创建时、运行中和完成时都告诉主智能体。

管理器（`SubagentManager`）在 Host，工具定义（`agent`、`agent_fork`、`send_message`、`wait_agent`、`list_agents`、`interrupt_agent`、`list_subagent_models`）在每个会话的 Harness 里，两者通过 `actspace.host.subagents` 端口相连。预设两个：`general`（继承父会话可用工具，可写）、`explore`（只读）。子智能体不弹审批，需要审批的操作直接返回说明文字；同一主会话最多 10 个子智能体。

外部子智能体（`agent_codex`、`agent_claude_code`）把任务交给本机的 Codex / Claude Code CLI：只跑一次、不能续派，用 CLI 自己的权限和模型设置，不经 ActSpace 的审批和沙箱；留痕是 CLI 自己的会话日志（JSONL），路径同样返回给主智能体。它们和普通子智能体共用 `SubagentManager` 的并发上限、事件、完成通知和 `list_agents`。两个插件默认关，本机找不到命令时不注册工具。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `subagent` | 接口 | 不在默认组合 | — | `SubagentManager`（创建、fork、续派、插话、中断、完成通知、重启后补 `lost`、外部子智能体 `spawnExternal`）、child Session、Preset、模型可见文字、七个工具和外部工具的注册函数、外部 CLI 的公共件（`resolveCommand`、`terminate`）；由运行时创建、`tool-subagent` 注册工具 |
| `tool-subagent` | 工具 | 会话 | 开 | 七个子智能体工具插件；提供 `tools.subagents` |
| `subagent-codex` | 工具 | 会话 | 关 | `agent_codex`：`codex app-server` 跑一个非临时线程、一轮；记录是线程的 rollout 文件；设置 `approvalPolicy`、`sandbox`；提供 `tools.subagent-codex`（含可用性）；可在“插件”页开关 |
| `subagent-claude-code` | 工具 | 会话 | 关 | `agent_claude_code`：`claude -p --output-format stream-json`，会话 id 由 ActSpace 生成；记录在 `~/.claude/projects/<编码后的目录>/<id>.jsonl`；设置 `permissionMode`；提供 `tools.subagent-claude-code`；可在“插件”页开关 |

## 包之间怎么连

- `core/runtime` 的 `agent-runtime` 创建 `SubagentManager`（子会话的运行租约来自 `harnesses.acquireForScope`，循环来自 `agent-factory` 的 `createSubagentLoop`）；启动时（`runtime/src/startup/boot.ts`）把它以 Host 端口 `actspace.host.subagents` 暴露给 Harness。打开会话时 `recoverLost` 把上次没收尾的激活补成 `lost` 并通知主会话。
- 状态全部从主会话 Journal 的 `subagent/spawned`、`subagent/activation` 折叠出来（`@actspace/shared/runtime-v2` 的 `foldSubagentTree`）；老会话的 `delegation/*` 只读展示。
- `tool-subagent` inject `tools.runtime`、`agent.registry`、`actspace.host.subagents`：用 `subagent` 的 `registerSubagentTools` 把七个工具注册到工具运行时；卸载时撤销注册。
- `subagent-codex`、`subagent-claude-code` inject 同样三项：启动时用登录 shell 找命令，找到才用 `registerExternalSubagentTool` 注册工具，调用走端口的 `spawnExternal`。插件设置来自 manifest 的 `config` 默认值，Host 的 `pluginConfig` 覆盖在上面。
- 外部记录不在 Host 可读目录里：`agent-factory` 的文件可读判断额外放行主会话子智能体投影里登记过的那几个记录文件（`isExternalRecordPath`，精确到文件）。
- 运行中的子智能体清单由 `context/context-subagents` 写进主会话上下文（读端口的 `running(sessionId)`）。
- `subagent` 依赖 `agent-loop`、`scope`、`agent`（收件箱）、`session-journal`、`session-persistence`（创建子会话）、`tool-runtime`。

## 入口与测试

- `subagent/src/manager.ts`、`tools.ts`、`messages.ts`、`child-session.ts`、`preset.ts`、`external.ts`、`external-cli.ts`；`tool-subagent/src/plugin.ts`；`subagent-codex/src/backend.ts`、`subagent-claude-code/src/backend.ts`。包 README 见 [subagent](subagent/README.md)。
- 测试在各包 `src/test/`：`pnpm --filter @actspace/subagent test`、`pnpm --filter @actspace/tool-subagent test`、`pnpm --filter @actspace/subagent-codex test`、`pnpm --filter @actspace/subagent-claude-code test`（后两个用假 CLI，不调真实命令）。
- 设计见[子智能体设计规范](../../docs/design-docs/子智能体和后台任务设计规范/02-子智能体设计规范.md)、[外部子智能体设计规范](../../docs/design-docs/子智能体和后台任务设计规范/04-外部子智能体设计规范.md)。

## 怎么扩展

新增一种预设：在 `subagent/src/preset.ts` 加工具集，在 `@actspace/shared/runtime-v2` 的 `SUBAGENT_PRESETS` 登记，再把 `agent` 工具的 `agent_preset` 枚举和设计 02 的说明文字一起改。通用步骤见[总地图](../README.md)。
