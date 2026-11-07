# Sidecar Transcript：子智能体可观测但不污染主上下文，详情页再适配回主消息语法

合并自：Sidecar Transcript 让子智能体可观测但不污染主上下文、Sidecar Transcript 详情页要适配回主消息语法。

关联 history：`docs/histories/2026-06/20260603-0804-agent-subagent-runtime-closeout.md`、`docs/histories/2026-06/20260604-0145-subagent-transcript-ui.md`

## 1. 拆分“主 Agent 需要知道什么”和“人类需要回看什么”

子智能体隔离探索时会产生整套事件：收到的 prompt、thinking、读文件、grep、最终报告、usage、错误。全部写进主 session 的问题：
- **上下文污染**：主 Agent 下一轮把子智能体的全部工具轨迹当成自己的历史，token 膨胀、推理焦点变散。
- **角色混淆**：历史恢复时主消息流混入子智能体内部 user/tool/assistant 事件。
- **恢复脆弱**：主 session selector 要同时理解两套事件语法，长期变成高耦合分支。

做法：主 session 只存主 Agent 继续推理需要的摘要、stats 和 `transcriptRef`；完整事件流写 sidecar JSONL（`subagents/<parentTurnId>/<runId>.jsonl`）；UI 经 typed ref 读取。

```ts
type AgentToolResult = {
  modelOutput: string;                 // 给主 Agent：summary + stats + transcript ref
  subagent: { transcriptRef: SubAgentTranscriptRef; transcriptEvents: SessionEvent[]; uiPreview: AgentToolPreview };
};
// 主 session：tool_result.payload.uiPreview = { kind: "agent", description, status, summary, stats, transcriptRef }
// runtime streaming：{ type: "subagent_event", toolCallId, transcriptRef, event /* 追加到 live modal */, preview /* 覆盖主流 Agent block */ }
```

重点不是文件名而是职责分层：主 session 是恢复与主上下文的事实来源，sidecar 是可观测性事实来源，runtime event 是当前 turn 的交互反馈。

陷阱：
- 不要把完整 transcript 塞进 `modelOutput`；
- 不要让 renderer 用 raw args/output 反推 SubAgent 状态，聚合工具应提供 typed preview 或 typed stream event；
- 不要让 renderer 传绝对路径读 transcript，IPC 输入是 `SubAgentTranscriptRef`，main 从 session root 派生路径并做 segment 校验；
- 不要把 sidecar 当普通 session 恢复源，它服务回放和排障；
- abort 要级联：主 turn 被取消时子智能体 run 也必须停止并落 error/aborted 事件。

判断标准：一段内部事件“人类需要回看，但主模型不该每轮重读”，就适合 sidecar（后台研究的检索过程、批量文件分析的逐文件诊断、planner 候选方案同理）。

## 2. 详情页展示时加一层薄 UI adapter

raw event 对排障有价值，但不是用户界面语言。直接展示 JSON 参数、时间戳、边框卡片会造成：同一 Agent 行为在主消息区是 `Thinking / Read / Glob`、打开详情却变成调试面板（视觉分裂）；弹窗自己实现一套标题/状态/错误/工具摘要规则、长期与主区漂移；内部 prompt、raw tool name、完整参数成为噪音。

做法：sidecar 仍保存完整事件，详情页读取后适配成主消息区已有组件的输入。`tool_call`（参数）与 `tool_result`（输出）按 id 配对，展示成 `Read App.tsx` 这类主流工具行：

```ts
{ kind: "read", filePath: "App.tsx", displayText: "Read App.tsx", status: "completed" }
```

映射：`thinking` → `ThinkingBlock`；`read_file`/`grep`/`glob`/`list_directory` → `ToolLogLine`；`user_message` → 详情页顶部任务输入区；`assistant_message` → 底部最终输出区；`llm_usage` → 轻量 usage 行。

陷阱：
- 不要为复用主 session selector 把 sidecar 混进恢复路径；
- 工具行只需短摘要，长输出留给明确的展开路径；
- 内部 prompt 不混进过程日志，需要确认任务时放顶部独立区；
- 最终 assistant report 单独收在底部，避免“日志中途突然插入结论”；
- 后端若给 sidecar `tool_result` 提供 typed `uiPreview`，adapter 先消费 preview，再回退到 `tool_call` 参数推导。

核心判断：主界面已有成熟组件语法时，详情页适配回那套语法，而不是再做一套 raw event UI。

## 自检

1. 这份数据刷新后还要恢复到主消息流吗？不要就可能不属于主 session。
2. 主 Agent 下一轮需要完整过程，还是只要摘要和引用？
3. 详情读取的是 typed ref 派生的 sidecar 路径，还是不安全的原始路径？
4. 详情页是否在复用主消息区的组件语言？
