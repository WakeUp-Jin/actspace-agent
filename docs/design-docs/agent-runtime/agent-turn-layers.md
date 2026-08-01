# Agent Run 四层职责规范

> 约束从一次用户输入到 Agent 执行、持久化与流式展示的完整链路。文件名沿用历史命名，但正文中的 `Turn` 只表示 Agent Loop 内真实的 `turn_start -> turn_end`。

## 核心层级

```text
Session
└─ User Message
   └─ Agent Run (agentRunId)
      ├─ Turn 1 (turnId, turnIndex=1)
      │  └─ LLM Call 1..N (llmCallId, attempt)
      └─ Turn 2 (turnId, turnIndex=2)
         └─ LLM Call 1..N
```

- `agentRunId`：一次 `agent_start -> agent_end`。当前普通聊天中，一次用户发送触发一次 Agent Run。
- `turnId`：Agent Loop 内一次推理与其后续工具执行的边界。工具结果需要继续交给模型时会进入下一个 Turn。
- `llmCallId`：一次真实 provider 请求。可重试错误会让同一个 Turn 出现多个 LLM Call。
- `attempt`：同一 Turn 内的请求尝试序号，从 1 开始。

完整字段与 Trace Schema 见 `agent-observability-trace-model.md`。

## 四层拓扑

```text
Renderer ──IPC──▶ Main Process ──调用──▶ Bridge ──驱动──▶ Agent Loop
   ◀──stream──      ◀──persist──       ◀──events──       ◀──LLM / Tools──
```

| 层 | 核心职责 | 输入 | 输出 |
| --- | --- | --- | --- |
| Renderer | 收集用户输入、生成 `agentRunId`、展示流式状态 | 用户交互 | `RunAgentInput` |
| Main Process | IPC、依赖装配、提前写用户消息、持久化结果与 Trace | `RunAgentInput` | `AgentRunResult` |
| Bridge | 翻译内部事件、建立归属、聚合 SessionEvent 与 RuntimeStreamEvent | Agent deps + Run 参数 | stream + `AgentRunResult` |
| Agent Loop | 维护真实 Turn/LLM Call 生命周期、上下文、重试和工具循环 | Context + LLM + Tools | `AgentEvent` |

## 1. Renderer

Renderer 通过 `window.actspace.runAgent()` 发起运行，通过唯一的 `agent:stream` 监听消费流事件。

`RunAgentInput` 的主要字段：

| 字段 | 语义 |
| --- | --- |
| `sessionId` | 会话身份 |
| `agentRunId` | 本次 Agent Run 身份 |
| `userInput` | 用户消息 |
| `attachments` | Composer 附件 |
| `model` / `modelKey` | 模型选择；新路径优先 `modelKey` |
| `thinkingEnabled` / `reasoningEffort` | 推理选项 |

Renderer 的运行状态按 `{ sessionId, agentRunId }` 路由。`agent_turn_*` 与 `llm_call_*` 是分析观测的细粒度事件，聊天 UI 可以忽略；assistant delta、工具状态事件仍携带真实 `turnId + llmCallId`，但不得用它们替代 Agent Run 的可见状态身份。

流式完成后，Renderer 重新读取 `SessionRecord`，在同一次交接中完成 streaming → persisted 切换。旧 Agent Run 的迟到事件不能覆盖当前会话或当前 Run。

Renderer 不读取 `.env`、API Key、`session.jsonl` 或 Trace 文件，也不直接导入 `@actspace/agent-core`。分析观测读取必须调用 preload 暴露的 `listAgentTraces/readAgentTrace`。

## 2. Main Process

Main Process 的主运行编排位于 `packages/desktop/src/main/agent-run.ts`：

1. 读取 Session V2 `meta.json` 与 Workspace。
2. 创建 `logs/agent-runs/` 的短期排障 Logger。
3. 创建 `<sessionDir>/traces/<agentRunId>.jsonl` 的长期分析 Trace Writer。
4. 装配主模型、ContextManager 与 ToolManager。
5. 在 Agent 执行前追加本次 `user_message`，保证审批等待或中止时用户输入已经成为事实。
6. 调用 `runAgentWithBridge(..., { includeUserEvent: false })`。
7. 追加剩余 SessionEvent、更新 `context-state.json` 和 `meta.agentRunCount`。

Main 不自行解析消息历史，只把 `sessionPath` 交给 `createAgentForSession()`；ConversationContext 负责 `parseJsonl -> SessionEvent V2 -> Message[]`。

IPC 已使用 Agent Run 语义：

- `agent:run`
- `agent:abort-run`
- `agent-trace:list`
- `agent-trace:read`

Main 必须校验 Trace 的 `sessionId/agentRunId` 与路径边界，拒绝路径穿越、符号链接和混合身份文件。

## 3. Bridge

Bridge 入口为 `runAgentWithBridge()`，职责包括：

- 把 `agent_start/end` 映射为 `agent_run_started/finished/failed/aborted`。
- 把真实 `turn_start/end` 映射为 `agent_turn_started/finished`。
- 把 `llm_call_start/end` 映射为 `llm_call_started/finished`。
- 给 assistant delta、工具调用、usage 和 SessionEvent 附上真实 `turnId/llmCallId`。
- 将每次 LLM Call 的 usage 作为独立 `llm_usage` 保存，不把多次调用压成一个 Turn 汇总。
- 把完整请求/响应写入独立 Trace；Trace 写失败应 fail-soft，不影响 Agent 主流程。

Bridge 不直接操作 Electron IPC，也不拥有 Session 文件路径。持久化动作由 Main Process 完成；Bridge 只构造事件并调用上层传入的 Writer。

## 4. Agent Loop

`runAgentLoop()` 维护两层循环：

- 内层：模型响应 → 工具执行 → 下一 Turn。
- 外层：可选 follow-up 消息 → 继续运行。

每次进入内层循环时生成新的 `turnId`；每次真正调用 `llm.stream()` 前生成新的 `llmCallId` 并递增 `attempt`。通常一个 Turn 只有一次 LLM Call，只有自动重试等场景才会出现多次。

Agent Loop 产出的关键事件：

```ts
agent_start
turn_start
llm_call_start
message_delta / message_end
llm_call_end
llm_retry
tool_start / tool_end
turn_end
agent_end
```

Agent Loop 不知道 Session、Electron、IPC 或 Trace 路径；`agentRunId` 由 Bridge 上层持有并在翻译时附加。

## Session 与 Trace 的分工

- `session.jsonl`：可恢复的稳定事实，Schema V2，必须有 `agentRunId`；细粒度事件按需带 `turnId/llmCallId`。
- `context-state.json`：可覆盖的当前 Context 视图。
- `traces/<agentRunId>.jsonl`：完整但脱敏的请求/响应证据，用于分析观测和请求差异。
- `logs/agent-runs/*.jsonl`：保留约一天的开发排障日志，不是产品分析事实源。

旧 Session 不做兼容读取。开发期升级后使用：

```sh
pnpm reset:session-data -- --data-root /absolute/path/to/actspace --confirm
```

## Stop / Abort

```text
Renderer: Stop
  → agent:abort-run { sessionId, agentRunId }
  → Main 命中 activeAgentRunAborts
  → Agent.abort() + PendingApprovalRegistry.abortAgentRun()
  → Agent Loop 返回 aborted
  → Bridge 推送 agent_run_aborted，并保存 agent_run_aborted SessionEvent
  → Main 持久化并更新 Session V2
```

`Stopped` 来自持久化的 `agent_run_aborted`，不是 Renderer 临时占位。Approval 与 Abort 竞态仍采用 pending entry 先到先得，并在执行工具前再次检查 AbortSignal。

## 特殊命令

`/compact` 与 `/eval` 在普通 Agent Run 前分流。它们使用自己的 `agentRunId` 做操作关联，但没有进入主 Agent Loop 时不伪造真实 `turnId/llmCallId`。

## 修改检查清单

- [ ] 粗粒度运行身份是否叫 `agentRunId`，而不是复用 `turnId`？
- [ ] 新的真实模型请求是否拥有 `llmCallId + attempt`？
- [ ] 新增 AgentEvent 是否在 Bridge 中有 RuntimeStreamEvent 映射？
- [ ] assistant/tool/usage 事件是否关联到正确的 `turnId/llmCallId`？
- [ ] SessionEvent 是否为 `schemaVersion: 2`？
- [ ] 完整上下文是否只进入脱敏 Trace，而不是重复塞进 `session.jsonl`？
- [ ] Renderer 文件读取是否仍只经 Main/Preload IPC？
- [ ] Abort 是否覆盖 Agent、等待审批与前台工具执行？
- [ ] 修改存储或事件契约时，是否同步更新观测模型与存储文档？
