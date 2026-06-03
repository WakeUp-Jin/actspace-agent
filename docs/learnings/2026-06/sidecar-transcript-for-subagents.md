# Sidecar Transcript 让子智能体可观测但不污染主上下文

关联 history：`docs/histories/2026-06/20260603-0804-agent-subagent-runtime-closeout.md`

## 是什么

当主 Agent 调用一个子智能体时，子智能体内部会产生一整套事件：收到的 prompt、thinking、读文件、grep、最终报告、usage、错误。这些事件对 UI 回放和排障很有价值，但不一定都应该进入主 Agent 的长期上下文。

Sidecar transcript 的做法是：

- 主 session 只保存主 Agent 需要继续推理的摘要、stats 和 transcriptRef。
- 子智能体完整事件流写到 sidecar JSONL，例如 `subagents/<parentTurnId>/<runId>.jsonl`。
- UI 通过 typed ref 读取 sidecar，展示完整 transcript。

## 为什么需要

子智能体常用于隔离探索：它可能读几十个文件、跑多轮搜索、产生大量中间判断。如果把这些内部事件全部写入主 session，会有三个问题：

- **上下文污染**：主 Agent 下一轮会把子智能体的所有工具轨迹当成自己的历史，token 膨胀且推理焦点变散。
- **角色混淆**：历史恢复时，用户看到的主消息流会混入子智能体内部 user/tool/assistant 事件，难以判断谁做了什么。
- **恢复脆弱**：主 session selector 需要同时理解主 Agent 和 SubAgent 两套事件语法，长期会变成高耦合分支。

Sidecar transcript 把“主 Agent 需要知道什么”和“人类需要回看什么”拆开：前者是短摘要，后者是完整事件流。

## 怎么做

关键是让三条链路各自有清楚边界。

```ts
type AgentToolResult = {
  modelOutput: string; // 给主 Agent：summary + stats + transcript ref
  subagent: {
    transcriptRef: SubAgentTranscriptRef;
    transcriptEvents: SessionEvent[];
    uiPreview: AgentToolPreview;
  };
};
```

主 session 写入：

```ts
tool_result.payload.uiPreview = {
  kind: "agent",
  description,
  status: "completed",
  summary,
  stats,
  transcriptRef,
};
```

sidecar 写入：

```txt
<sessionDir>/subagents/<parentTurnId>/<runId>.jsonl
```

runtime streaming：

```ts
{
  type: "subagent_event",
  toolCallId,
  transcriptRef,
  event,   // 追加到 live modal
  preview, // 覆盖主消息流 Agent block
}
```

这个模式的重点不是文件名，而是职责分层：主 session 是恢复和主上下文事实来源，sidecar 是可观测性事实来源，runtime event 是当前 turn 的交互反馈。

## 常见陷阱

- 不要把完整 transcript 塞进 `modelOutput`。主 Agent 只需要可操作摘要和 ref，完整过程会迅速吃掉上下文窗口。
- 不要让 renderer 用 raw args 或 raw output 反推 SubAgent 状态。聚合工具应该提供 typed preview 或 typed stream event。
- 不要让 renderer 传绝对路径读取 transcript。IPC 输入应是 `SubAgentTranscriptRef`，main 侧从 session root 派生路径并做 segment 校验。
- 不要把 sidecar 当成普通 session 恢复源。它服务 modal 回放和排障，不参与主对话消息流恢复。
- 不要忘记 abort 级联。主 turn 被取消时，子智能体 run 也必须停止并落 error/aborted 事件。

## 可迁移场景

这个模式不只适用于 SubAgent，也适用于任何“内部过程很长，但外部只需要摘要”的能力：

- 后台研究任务：主对话保存结论，sidecar 保存检索和引用过程。
- 批量文件分析：主消息保存 aggregate summary，sidecar 保存每个文件的诊断。
- 多工具规划器：主上下文保存最终 plan，sidecar 保存 planner 的候选方案和评分。

判断标准很简单：如果一段内部事件“人类需要回看，但主模型不该每轮都重读”，它就适合 sidecar。

## 自检问题

1. 这份数据刷新页面后是否还要恢复到主消息流？如果不要，它可能不属于主 session。
2. 主 Agent 下一轮推理需要完整过程，还是只需要结果摘要和引用？
3. UI 打开详情时，读取的是 typed ref 派生出的 sidecar，还是不安全的原始路径？
