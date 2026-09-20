# Agent Plugin Runtime 文档导航

> 当前入口：v2 Profile-first、多包 Cordis Plugin Runtime。本文按用途导航；每份文档的实现状态与未完成门禁分别维护。v2 决策保留原位置，v1 资料集中到 [archive/v1](../../archive/v1/README.md)。

## 当前架构与启动

1. [总体架构](agent-target-overall-architecture.md)：Host、Profile、应用 Service、Agent 与 Journal/Projection 的整体关系。
2. [Runtime 与 Composition](agent-target-runtime-architecture.md)：生产 BootedRuntimeProfile、基础 BootedProfile、组合、启动失败与 shutdown。
3. [插件组装与 Agent 启动](agent-spec-dsh-plugin-assembly-and-agent-startup.md)：从 Cordis 装载到 Session attach、followup、Inbox 和 Loop。
4. [Agent Run / Turn 分层](../agent-runtime/agent-turn-layers.md)：运行层级与数据流。
5. [测试策略](agent-testing.md)：自动化、Host 和外部人工门禁的边界。

## 领域契约

- [Session 事件持久化重构](agent-session-event-persistence-refactor.md)：2026-09-20 核心行为已实施；接纳、observer、durability barrier 与 checkpoint 语义以此为准，[执行记录](../../exec-plans/completed/20260920-session-event-persistence/README.md)。

| 主题 | 规范 |
|---|---|
| Plugin 与包边界 | [Plugin ABI](agent-spec-plugin-runtime-abi.md)、[Package layout](agent-spec-package-layout-and-plugin-packaging.md)、[包清单](agent-package-ledger.md) |
| Session 与上下文 | [Session/Context](agent-target-session-and-context.md)、[Session Format v1](agent-spec-session-format-v1.md)、[DSH 事件模型](agent-spec-dsh-event-model.md)、[Prompt contributors](agent-spec-prompt-context-contributors.md) |
| Agent 与 Loop | [Core 所有权](agent-target-agent-core.md)、[Agent/Subagent](agent-spec-agent-and-subagent.md)、[Scope](agent-spec-agent-scope-model.md)、[Loop surface](agent-spec-agent-loop-cordis-surface.md) |
| Cordis Service 与事件 | [Service 三层契约](agent-spec-service-definition-provider-consumer.md)、[Cordis 原生事件 ABI](agent-spec-cordis-event-abi-and-eventhub-retirement.md) |
| LLM | [Adapter](agent-target-llm-adapter.md)、[多供应商](../model-context/agent-multi-provider-llm.md) |
| Tools | [内核与外壳](agent-spec-tool-runtime-boundary.md)、[Prepared execution ABI](agent-spec-tool-runtime-abi.md)、[Tool name](agent-spec-tool-name-contract.md) |
| Projection | [Runtime Projection](agent-spec-runtime-projection.md)、[持久化与投影收敛](agent-target-session-persistence-projection-architecture.md) |
| 英语辅助学习 | [会话双语 Prompt 与英文语音](agent-english-learning.md) |

Session Format v1 是当前 v2 使用的格式版本，不能按名称归入旧产品资料。早期逻辑语义与后续事件规范冲突时，以 DSH 事件模型和实际 codec 为准。

## 部分实施与后续收口

| 工作 | 已有范围与剩余任务 | 入口 |
|---|---|---|
| Session Core / Persistence | contract slice 已交付；CLI persist/resume 独立验收与 G1 交接尚待收口 | [规范](agent-spec-session-core-persistence-separation.md)、[P1-A](../../exec-plans/active/20260829-actspace-p1-session-core-persistence/README.md) |
| Service Definition / Provider / Consumer | 三层 contract slice 已交付；核心 Provider 全域迁移与 G1 尚待收口 | [规范](agent-spec-service-definition-provider-consumer.md)、[P1-B](../../exec-plans/active/20260829-actspace-p1-service-roles/README.md) |
| Profile / Bundle / Patch | schema、digest、transport parity 已交付；restart-only 与 one-shot 回归尚待收口 | [规范](agent-spec-profile-bundle-patch-layering.md)、[P1-C](../../exec-plans/active/20260829-actspace-p1-profile-bundle-patch/README.md) |
| Contract Matrix | 已有 generator、双产物、字节漂移检查与 CI；2026-09-09 复核确认语义 validator / 负向 fixtures 仍有缺口 | [规范](agent-spec-contract-matrix-generation.md)、[生成矩阵](agent-contract-matrix.generated.md)、[P2](../../exec-plans/active/20260829-actspace-p2-contract-matrix/README.md) |
| Session Projection | P00/P01 验收候选、P02/P03 基础与首批消费者已实现；最终消息映射与集成验收待继续 | [计划](../../exec-plans/active/20260830-actspace-session-persistence-projection/README.md) |
| 最终事件/CLI 验收 | P00–P04 有通过证据；P05 deterministic retry/error fixture 尚缺 | [计划](../../exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/README.md) |

完整依赖与 G1/G2 见 [P1/P2 总计划](../../exec-plans/active/20260829-actspace-p1-p2-contract-and-composition/README.md)。不得把这些部分实施项写成完全未开始，也不得因已有类型或生成产物就声明验收完成。

## 决策与研究背景

以下材料用于理解取舍，不替代上面的当前实现入口：

- [P0 核心 Service 设计](agent-spec-core-cordis-services.md)：保留领域职责与 Service 化背景；当前三层 ABI 由上面的 Service 契约维护。
- [Profile-first 决策](agent-decision-profile-first-headless-desktop.md)：两种 Profile 与应用操作所有权，保留当时迁移步骤。
- [v2 foundation 决策](agent-decisions-v2-foundation.md)、[Cordis 采用](agent-decision-cordis-adoption.md)：方向、适用范围和证据边界。
- [DSH-native 早期提案](agent-decision-dsh-native-plugin-runtime.md)、[全量插件组装决策背景](agent-spec-dsh-runtime-as-plugin-composition.md)：其中旧 facade、Host 与阶段说法是历史背景，不能据此恢复接口。
- [DSH 研究](agent-research-dsh-architecture.md)、[能力去留研究](agent-research-capability-disposition.md)：研究快照与迁移判断。
- [ActSpace v1 后端研究](../../archive/v1/design-docs/agent-research-actspace-current-state.md)：`v1-final` 历史快照。

## 验收边界

已实现计划位于 [completed](../../exec-plans/completed/)，执行记录仍在 exec-runs。真实 Provider、Browser/Chrome Extension、Electron reload/quit/flush、签名公证和发行制品是否通过，以具体执行摘要为准；本页不将旧环境状态描述成当前实测结果。
