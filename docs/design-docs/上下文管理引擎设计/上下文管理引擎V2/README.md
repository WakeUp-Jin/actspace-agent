# 上下文管理引擎 V2

状态：2026-10-18，V2 引擎、Context 面板与 SQLite 联合实现已完成。面板契约为 schemaVersion 2，SQLite 读模型为 schema 9；联合验收已收束，M/Small 结果、用户取消的 L 剩余长测和未覆盖边界见[联合执行摘要](../../../exec-runs/20261011-context-sqlite-integration/execution-summary.md)。

**Context 是按 Session 与 Agent 逻辑作用域隔离的长期状态；每次模型调用从它生成不可变的 LlmInput。** 模型与工具输出继续先进入 Session，再由对应插件更新 Context。

## 阅读顺序

| 文档 | 回答的问题 |
| --- | --- |
| [01：总体设计与调用流程](01-总体设计与调用流程.md) | 用户输入之后如何组装、调用，再进入下一次组装；引擎管理什么；前端读取什么 |
| [02：生命周期与状态更新](02-生命周期与状态更新.md) | Context 活多久，Run 结束怎么办，如何局部更新、恢复和保持请求一致 |
| [03：插件包与职责边界](03-插件包与职责边界.md) | context 目录如何拆包，谁拥有状态，压缩策略位于哪里 |
| [04：旧文档与源码漂移核对](04-旧文档与源码漂移核对.md) | 第一版哪些仍有效，哪些是 V2 的有意变化，哪些旧表述已经滞后 |
| [05：Context 面板与 SQLite 联合设计](05-Context面板与SQLite联合设计.md) | 当前与历史数据如何分工、索引如何同步、面板如何刷新、Bug 修复如何共用基础能力 |
| [06：原会话决策与联合方案校验](06-原会话决策与联合方案校验.md) | 对照完整 SQLite 会话，哪些是已确认约束、新增提案、历史遗漏；哪些验收仍未完成 |

[联合执行计划](../../../exec-plans/completed/20261011-context-sqlite-integration/README.md) · [测试验收计划](../../../exec-plans/completed/20261011-context-sqlite-integration/acceptance.md)

## 已确认方向

1. 一个 Harness 中提供一个 Context 管理引擎服务，服务管理多个隔离 Context。
2. Context 按 Session 与 Agent Scope 隔离，持续承接状态变化；不建立进程级或跨会话共享的可变 Context。
3. 一次 Run 内多个 Step 复用所属 Context；每个 Step 都可刷新相关模块，不要求每个模块都改变。
4. Session 保留事实和持久化权威；Context 保存派生状态与模块工作状态，不保存另一套可独立写入的聊天记录。
5. Context 通过受控方法局部更新；插件只提交自己拥有的状态切片，不直接修改其他插件。
6. `LlmInput` 是单次模型调用的不可变快照。模型、系统提示词和工具定义在请求边界保持一致。
7. 前端 Context 内容与管理状态由引擎提供只读投影；组件、IPC 传输与 Provider usage 各有既有归属。
8. 每个上下文模块是独立插件包，统一归入 `packages/context/`；管理引擎是单独插件包，压缩策略通过引擎协作。

## 整理时补齐的边界

以下是对已确认方向的细化，供本次文档审阅：

当前实现入口：`packages/context/engine/src/instances.ts` 管理 `Session + logicalAgentScopeId` 实例，`packages/context/engine/src/reducers.ts` 管理受 owner/fields 约束的事件 reducer，`packages/context/engine/src/projection.ts` 生成 Host/UI 只读投影；`packages/context/*` 下的类型插件提供各自来源，`packages/core/agent-loop/src/loop.ts` 使用稳定 Agent 身份创建请求，并在已有实例时走 durable reconcile。

Host/IPC 接线已经由 Runtime 的 `context.engine.getProjection`、Desktop App 的 `readContextProjection` 和 fixed renderer `sessions.describeContext` 串起；旧轻量入口返回 `ContextState`；面板通过 `sessions.describeContextPanel` / `listContextEntries` / `readContextEntry` 查询 schemaVersion 2 投影，由 Main 的 ContextPanelService 聚合当前引擎与 SQLite 历史索引，不会把 Context 实例暴露给 renderer。

- **长期状态不要求内存对象永不释放**：当前每次 Run 会创建运行 Scope 并归还 Harness 租约，必须区分稳定逻辑身份与短期运行绑定。
- **Session 接纳不等于落盘**：保留 accepted/durable 水位，在明确持久屏障后发布可继续执行的 Context 状态。
- **当前 Context 与上次请求分别展示**：新输出尚未发送给模型时，不能把它显示成“上一次模型已经看到的输入”。
- **压缩按既有安全时机提交**：支持每 Step 刷新不等于允许任意时刻替换 Session Surface。
- **拆目录不重写历史 owner**：旧 Codec 与事件身份需要继续可发现，包名变化不能导致旧 Session 无法读取。

## 本轮边界

联合实施已接入面板与 SQLite，保留原有 Journal、权限、附件、压缩事务和模型适配边界。未来记忆、工作流、质量评估或修复 Agent 保留接入空间，不在本轮新增实现，也不为它们建立空插件包。

包迁移与 V2 生命周期的既有实施记录保留；实现完成不代表未覆盖的验收点已通过。
