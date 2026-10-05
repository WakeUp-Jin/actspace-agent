# Agent Plugin Runtime 文档导航

当前分层以 [Host/Harness/Run 总览](agent-target-overall-architecture.md)为入口；[P5 摘要](../../exec-runs/20261003-agent-harness-host-refactor/phase-5-summary.md)汇总已完成的自动化及 Computer Use；本次冗余与文档收尾见[清理计划](../../exec-plans/completed/20261004-agent-refactor-cleanup.md)。

P2 当前接线：[Task、Run 与 Harness 生命周期](agent-task-run-lifecycle.md)；[阶段验证记录](../../exec-runs/20261003-agent-harness-host-refactor/phase-2-summary.md)。


- [Tool 插件边界与 Todo 领域事件](agent-tool-plugin-boundaries.md)：独立工具包、Host port、Projection Contributor、scope 和不兼容旧 Todo 的事件断点。

> 当前入口：v2 Profile-first、多包 Cordis Plugin Runtime。本文按用途导航；每份文档的实现状态与未完成门禁分别维护。v2 决策保留原位置，v1 资料集中到 [archive/v1](../../archive/v1/README.md)。

## 当前架构与启动

1. [总体架构](agent-target-overall-architecture.md)：Host、Profile、应用 Service、Agent 与 Journal/Projection 的整体关系。
2. [Runtime 与 Composition](agent-target-runtime-architecture.md)：生产 BootedRuntimeProfile、Host/Harness 组合、启动失败与 shutdown。
3. [插件组装与 Agent 启动](agent-spec-dsh-plugin-assembly-and-agent-startup.md)：从三个 Host 入口到 TaskLedger、Run Factory 和 Loop。
4. [Agent Run / Turn 分层](../agent-runtime/agent-turn-layers.md)：运行层级与数据流。
5. [测试策略](agent-testing.md)：自动化、Host 和外部人工门禁的边界。

## 领域契约

- [Session 事件持久化重构](agent-session-event-persistence-refactor.md)：2026-09-20 核心行为已实施；接纳、observer、durability barrier 与 checkpoint 语义以此为准，[执行记录](../../exec-plans/completed/20260920-session-event-persistence/README.md)。

| 主题 | 规范 |
|---|---|
| Plugin 与包边界 | [Plugin ABI](agent-spec-plugin-runtime-abi.md)、[Package layout](agent-spec-package-layout-and-plugin-packaging.md)、[包清单](agent-package-ledger.md) |
| Session 与上下文 | [Session/Context](agent-target-session-and-context.md)、[Session Format v1](agent-spec-session-format-v1.md)、[DSH 事件模型](agent-spec-dsh-event-model.md)、[Prompt contributors](agent-spec-prompt-context-contributors.md) |
| Agent 与 Loop | [Core 所有权](agent-target-agent-core.md)、[Agent/Subagent](agent-spec-agent-and-subagent.md)、[Scope](agent-spec-agent-scope-model.md)、[Loop surface](agent-spec-agent-loop-cordis-surface.md) |
| Cordis Service 与事件 | [Service 所有权与契约](agent-spec-service-definition-provider-consumer.md)、[Cordis 原生事件 ABI](agent-spec-cordis-event-abi-and-eventhub-retirement.md) |
| LLM | [Adapter](agent-target-llm-adapter.md)、[Core Pi 收敛目标（已实施）](agent-llm-core-pi.md)、[多供应商](../model-context/agent-multi-provider-llm.md) |
| Tools | [内核与外壳](agent-spec-tool-runtime-boundary.md)、[Prepared execution ABI](agent-spec-tool-runtime-abi.md)、[Tool name](agent-spec-tool-name-contract.md) |
| Projection | [Runtime Projection](agent-spec-runtime-projection.md)、[持久化与投影收敛](agent-target-session-persistence-projection-architecture.md) |
| Session 三类读模型 | [设计规范](agent-session-three-read-models.md)、[执行计划](../../exec-plans/completed/20260922-session-three-read-models.md)、[执行记录](../../exec-runs/20260922-session-three-read-models/execution-summary.md) |
| 英语辅助学习 | [会话双语 Prompt 与英文语音](agent-english-learning.md) |

Session Format v1 是当前 v2 使用的格式版本，不能按名称归入旧产品资料。早期逻辑语义与后续事件规范冲突时，以 DSH 事件模型和实际 codec 为准。

## 本轮清理与证据

[第二轮清理计划](../../exec-plans/active/20261004-agent-storage-and-cleanup/README.md)统一跟踪存储整体解耦、任务入口和文档校准；[执行摘要](../../exec-runs/20261004-agent-storage-and-cleanup/execution-summary.md)是本轮验证入口。

写入/恢复先读[存储规范](agent-spec-session-core-persistence-separation.md)，读取/投影先读[投影架构](agent-target-session-persistence-projection-architecture.md)。格式、Codec、三类读模型继续独立维护详细契约。

六份早期后端计划的目标和独有欠账见[旧计划结算](../../exec-runs/20261004-agent-storage-and-cleanup/legacy-plan-resolution.md)。矩阵是审计视图，范围与未实现检查见[生成规范](agent-spec-contract-matrix-generation.md)。

## 决策与研究背景

以下材料用于理解取舍，不替代上面的当前实现入口：

- [Harness 插件化与 Agent Host 分离讨论](agent-harness-host-refactor-decisions.md)：最终目标与决定；P1–P5 批准范围已验收，冗余与文档收尾仍在执行。自进化功能后续独立开发。

- [Profile-first 决策](agent-decision-profile-first-headless-desktop.md)：Profile 与应用操作所有权的历史理由。
- [v2 foundation 决策](agent-decisions-v2-foundation.md)、[Cordis 采用](agent-decision-cordis-adoption.md)：方向、适用范围和证据边界。
- [DSH 研究](agent-research-dsh-architecture.md)、[能力去留研究](agent-research-capability-disposition.md)：研究快照与迁移判断。
- [ActSpace v1 后端研究](../../archive/v1/design-docs/agent-research-actspace-current-state.md)：`v1-final` 历史快照。

## 验收边界

已实现计划位于 [completed](../../exec-plans/completed/)，执行记录仍在 exec-runs。真实 Provider、Browser/Chrome Extension、Electron reload/quit/flush、签名公证和发行制品是否通过，以具体执行摘要为准；本页不将旧环境状态描述成当前实测结果。
