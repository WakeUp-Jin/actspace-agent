---
title: 一次 Agent Turn
description: 从用户输入到模型、工具、审批和持久化，理解 ActSpace 的一次完整执行链路。
group: core-concepts
order: 1
updatedAt: 2026-07-27
draft: false
---

一次 Agent Turn 是从用户提交消息开始，到回复完成、失败或被中断为止的完整运行单元。

## 四层职责

### Renderer

收集用户输入、附件、工作区与模型选择；展示流式文本、工具状态、审批请求和最终消息。Renderer 不直接访问文件系统，也不持有服务商密钥。

### Main Process

管理 Electron 生命周期、IPC、窗口和主进程服务。它把 renderer 的请求交给 Agent Runtime，并把运行事件转回界面。

### Bridge

把 UI 侧请求映射为 Agent Runtime 能理解的输入，同时将流事件、审批和中断信号保持在正确的 `sessionId + turnId` 作用域内。

### Agent Runtime

负责解析模型用途、构建 Context、调用 provider、执行工具循环、记录用量，并把 session events 持久化。

## 执行状态

一个 Turn 最终必须明确落入以下状态之一：

- `completed`：模型完成回复，所有必要事件已持久化。
- `failed`：模型或执行链路失败，界面得到可恢复的错误事件。
- `aborted`：用户停止任务，审批和前台执行也同步取消。

中间状态不能被伪装成完成。例如 provider 因长度上限停止且仍有写文件工具调用时，安全阀会阻止不完整内容落盘。

## 工具循环

当模型发起工具调用时，Runtime 会：

1. 校验工具名称和参数。
2. 判断权限级别与执行边界。
3. 必要时暂停 Turn 等待审批。
4. 执行工具并产生结构化结果。
5. 将结果作为 observation 交还模型。
6. 继续循环，直到得到最终回复或终止状态。

每个工具都由自己的 `toolCallId` 标识。完成事件应立即结束对应工具的运行态，不等待同批其他工具。

## 持久化与恢复

用户消息会先写入持久化事件，再进入长时间运行。工具调用、审批、用量、Context 快照和最终回复也会按事件追加。这样即使应用退出或 Turn 被中断，会话仍能从已经落盘的事实恢复。

继续阅读[上下文管线](../context/)和[工具与审批](../tools-and-approvals/)，可以分别深入这两条关键链路。
