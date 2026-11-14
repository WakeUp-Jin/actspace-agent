# Agent Plugin Runtime 文档导航

这个专题管 v2 Agent Runtime 的当前事实：Host / Harness / Run 分层、Profile-first 的多包 Cordis 插件组装、Session 事件与投影、Tool 与 Prompt 的公共契约、LLM 适配层，以及独立 Host 的部署方式。读代码之前先读这里；每份文档只写当前实现，实现状态与未完成门禁写在各自正文里。

## 先读

1. [总体架构](agent-target-overall-architecture.md)：Host、Profile、应用 Service、Agent 与 Journal / Projection 的整体关系。
2. [Runtime 与 Composition](agent-target-runtime-architecture.md)：生产 `BootedRuntimeProfile`、Host / Harness 组合、启动失败与 shutdown。
3. [插件组装与 Agent 启动](agent-spec-dsh-plugin-assembly-and-agent-startup.md)：从三个 Host 入口到 TaskLedger、Run Factory 和 Loop。
4. [Task、Run 与 Harness 生命周期](agent-task-run-lifecycle.md)：任务调度、执行与组合租约。
5. [测试策略](agent-testing.md)：自动化、Host 和外部人工门禁的边界。

## 契约文档

| 主题 | 文档 |
|---|---|
| 插件与包 | [Plugin Runtime ABI](agent-spec-plugin-runtime-abi.md)、[Profile / Bundle / Patch 分层](agent-spec-profile-bundle-patch-layering.md)、[包结构与插件打包](agent-spec-package-layout-and-plugin-packaging.md)（含 Service 所有权与契约）、[包地图](../../../packages/README.md) |
| Cordis 事件与 Loop 插入面 | [Cordis 事件 ABI 与 Agent Loop 插入面](agent-spec-cordis-event-abi-and-eventhub-retirement.md) |
| Session 事件 | [Session 业务与存储后端边界](agent-spec-session-core-persistence-separation.md)（接纳、observer、durability barrier、checkpoint）、[Session Format v1](agent-spec-session-format-v1.md)、[DSH 事件模型](agent-spec-dsh-event-model.md)（当前事件词汇的唯一来源） |
| 请求与流式 | [流式输出只走实时通道](agent-spec-live-assistant-stream.md)、[请求记录与上下文估算](agent-spec-request-record.md)、[对话内容只存一份](agent-spec-surface-derived.md)、[上下文引擎直接用日志视图](agent-spec-context-trusted-surface.md) |
| 投影与读模型 | [Runtime Projection](agent-spec-runtime-projection.md)（Durable / Live / Diagnostics 三平面、Generic Tool DTO、当前读取实现与水位） |
| Agent 与 Scope | [Agent Core 所有权](agent-target-agent-core.md)、[Agent Scope 模型](agent-spec-agent-scope-model.md)、[子智能体运行规范](../collaboration/agent-subagent-runtime.md) |
| Tool | [Tool Runtime 内核与外壳](agent-spec-tool-runtime-boundary.md)、[Tool Runtime ABI](agent-spec-tool-runtime-abi.md)、[Tool Name 契约](agent-spec-tool-name-contract.md)、[Tool 插件边界与 Todo 领域事件](agent-tool-plugin-boundaries.md) |
| Prompt 与上下文贡献 | [Prompt 与 Context Contributor](agent-spec-prompt-context-contributors.md) |
| LLM | [LLM Adapter 目标](agent-target-llm-adapter.md)、[LLM Core Pi](agent-llm-core-pi.md)（含 pi-ai 内置服务商复用）、[多供应商与模型管理](../model-context/agent-multi-provider-llm.md) |
| 契约矩阵 | [生成与检查边界](agent-spec-contract-matrix-generation.md)、[生成结果](agent-contract-matrix.generated.md)（审计视图，由脚本生成） |
| Host 与插件 | [独立 Agent Host 指南](agent-host-guide.md)（启动、配对、WSS / SSH、附件、停机、[systemd 示例](actspace-host.service.example)）、[英语辅助学习插件](agent-english-learning.md) |

Session Format v1 是当前 v2 使用的格式版本，不能按名称归入旧产品资料。早期逻辑语义与后续事件规范冲突时，以 DSH 事件模型和实际 codec 为准。写入 / 恢复先读存储边界，读取 / 投影先读 Runtime Projection。

## 决策背景

[Harness 与 Host 重构：最终决定](agent-harness-host-refactor-decisions.md)汇总 Profile-first、v2 foundation、Cordis 采用范围与门禁的理由；它解释取舍，不替代上面的当前实现入口。

## 验收边界

真实 Provider、Browser / Chrome Extension、Electron reload / quit / flush、签名公证和发行制品是否通过，以各文档正文写明的验证边界和[技术债表](../../exec-plans/tech-debt-tracker.md)为准；本页不把旧环境状态描述成当前实测结果。
