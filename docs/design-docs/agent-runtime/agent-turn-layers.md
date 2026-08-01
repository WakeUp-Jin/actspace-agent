# Agent Run 五层职责规范

> 约束一次用户输入从宿主界面进入 Agent，到执行、持久化、观测和结果展示的完整链路。文件名沿用历史命名；正文中的 Turn 只表示 Agent Loop 内真实的 `turn_start -> turn_end`。

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

- `agentRunId`：一次 `agent_start -> agent_end`。普通聊天中，一次用户发送触发一次 Agent Run，也是 UI、Abort、审批和持久化提交的顶层运行身份。
- `turnId`：Agent Loop 内一次推理及其后续工具执行的边界。工具结果需要再次交给模型时进入下一个 Turn。
- `llmCallId`：一次真实 provider 请求。自动重试会让同一个 Turn 出现多个 LLM Call。
- `attempt`：同一 Turn 内的请求尝试序号，从 1 开始。

完整字段与 Trace Schema 见 `agent-observability-trace-model.md`。

## 五层拓扑

```text
Desktop / CLI Client -> Host Adapter -> Agent Runtime -> Bridge -> Agent Loop
        <- presentation <- Event Sink  <- stream/result <- Agent events
```

| 层 | 核心职责 | 输入 | 输出 |
| --- | --- | --- | --- |
| Renderer / CLI Client | 收集输入、生成 `agentRunId`、展示流式状态 | 用户交互 | `RunAgentInput` |
| Host Adapter | 把 Electron、process、TTY 等能力映射为 Runtime Ports | Host 输入 | `RuntimeAgentRunRequest` + Ports |
| Agent Runtime | Session、Workspace、Context、模型、审批、Abort、提交与 Trace 生命周期 | Runtime request | `AgentRunResult` + stream |
| Bridge | 翻译内部事件、建立三层归属、聚合产品事件 | Agent deps + Run 参数 | SessionEvent + RuntimeStreamEvent |
| Agent Loop | 维护真实 Turn / LLM Call、重试、上下文和工具循环 | Context + LLM + Tools | `AgentEvent` |

## 1. Renderer / CLI Client

Desktop 通过 `window.actspace.runAgent()` 发起运行，通过唯一的 `agent:stream` 监听消费事件。CLI 使用同一 Runtime contract，经终端 renderer 输出。

`RunAgentInput` 的主要字段：

| 字段 | 语义 |
| --- | --- |
| `sessionId` | 会话身份 |
| `agentRunId` | 本次 Agent Run 身份 |
| `userInput` | 用户消息 |
| `attachments` | Composer 附件 |
| `model` / `modelKey` | 模型选择；新路径优先 `modelKey` |
| `thinkingEnabled` / `reasoningEffort` | 推理选项 |
| `executionContext` | 首次运行的 Workspace / Branch / Run on 快照 |

Renderer 的运行状态按 `{ sessionId, agentRunId }` 路由。`agent_turn_*` 与 `llm_call_*` 是分析观测的细粒度事件；assistant delta、工具和 usage 可携带真实 `turnId + llmCallId`，但不能用它们替代 Agent Run 的可见状态身份。

流式结束后，Renderer 必须在同一次交接中恢复 `SessionRecord`、切换 streaming → persisted 数据源并收尾运行状态。旧 Agent Run 的迟到事件不能覆盖当前会话或当前 Run。

客户端不读取 `.env`、API Key、`session.jsonl` 或 Trace 文件。Desktop 分析观测只调用 typed preload 暴露的 Trace IPC。

## 2. Host Adapter

Host Adapter 负责宿主差异：

- Desktop 注册 IPC，注入 Electron roots、settings、BrowserWindow Event Sink、审批和 Workspace Execution Provider。
- CLI 解析 argv、stdin、TTY、stdout/stderr、退出码、Session lock 和 runtime assets。
- Desktop 使用 `persistent + desktop`；`run` 使用 `ephemeral + cli-headless`；`chat` 使用 `persistent + cli-interactive`。
- Host 只构造 `RuntimeAgentRunRequest` 和 Ports，不复制 Session、Context、Harness 或提交编排。

关键文件：

- `packages/desktop/src/main/agent-run.ts`：Desktop 兼容 wrapper，委托统一 Runtime。
- `packages/desktop/src/main/desktop-agent-runtime.ts`：Electron Host Adapter。
- `packages/agent-cli/src/runtime-adapter.ts`：CLI Host Adapter。
- `packages/agent-core/src/runtime/`：唯一运行编排实现。

## 3. Agent Runtime

Runtime 是唯一 Agent Run 应用编排层：恢复 Session、准备 Workspace、组装 Context、解析模型、创建 Harness 依赖、预写用户输入、创建 Trace Writer、执行 Harness、提交结果、发送终态并清理工具。

关键不变量：

- persistent 输入在 Harness 前提交；ephemeral 不创建产品 Session。
- `agent_run_finished` 只在结果成功提交后发送；写盘失败必须是 `agent_run_failed`。
- Runtime 负责唯一的 `agent_run_started` 与 terminal event；Bridge 在 Runtime 路径不重复发顶层生命周期事件。
- 活动状态以 `{ sessionId, agentRunId }` 标识，并属于 Runtime 实例，不能使用跨 Host 的模块全局 Map。
- Abort 覆盖初始化窗口、Harness、等待审批和 ToolManager dispose。
- Event Sink、短期日志或 Trace sidecar 失败不能重新执行 Harness；Trace 不可用时必须 fail-soft 并输出诊断事件。
- 首次运行的 Workspace / Branch 准备失败时，不能写入 `user_message`。

## 4. Bridge

Bridge 入口为 `runAgentWithBridge()`，职责包括：

- 把 `agent_start/end` 映射为 Agent Run 生命周期（兼容直连 Harness；Runtime 路径关闭重复顶层事件）。
- 把真实 `turn_start/end` 映射为 `agent_turn_started/finished`。
- 把 `llm_call_start/end` 映射为 `llm_call_started/finished`。
- 给 assistant、tool、usage 和 SessionEvent 附上正确的 `agentRunId/turnId/llmCallId`。
- 将每次 LLM Call 的 usage 独立保存，不把重试或多 Turn 压成一个汇总。
- 把完整但脱敏的请求/响应写入独立 Trace；Trace 写失败不影响 Agent 主流程。

Bridge 不操作 Electron IPC，不拥有 Session 路径，也不决定持久化提交顺序。

## 5. Agent Loop

`runAgentLoop()` 维护模型响应、工具执行与 follow-up 循环。每次进入内层推理生成新的 `turnId`；每次真正调用 `llm.stream()` 前生成新的 `llmCallId` 并递增 `attempt`。

关键事件顺序：

```text
agent_start
turn_start
llm_call_start
message_delta / message_end
llm_call_end / llm_retry
tool_start / tool_end
turn_end
agent_end
```

Agent Loop 不知道 Session、Electron、IPC 或 Trace 路径；`agentRunId` 由上层持有并在 Bridge 翻译时附加。

## Session 与 Trace 分工

- `session.jsonl`：可恢复的稳定事实，Schema V2；事件必须有 `agentRunId`，细粒度事件按需带 `turnId/llmCallId`。
- `context-state.json`：可覆盖的当前 Context 视图。
- `traces/<agentRunId>.jsonl`：完整但脱敏的请求/响应证据，用于分析观测与请求差异。
- `logs/agent-runs/*.jsonl`：短期开发排障日志，不是产品分析事实源。

旧 Session 不做兼容读取。开发期升级后可显式清理：

```sh
pnpm reset:session-data -- --data-root /absolute/path/to/actspace --confirm
```

## Stop / Abort

```text
Client: Stop
  -> abortAgentRun { sessionId, agentRunId }
  -> Runtime 命中 active Agent Run
  -> Agent.abort() + ApprovalBroker.abortAgentRun()
  -> Agent Loop 返回 aborted
  -> Runtime 提交 agent_run_aborted 并发送唯一终态
```

`Stopped` 来自持久化的 `agent_run_aborted`，不是 Renderer 临时占位。Approval 与 Abort 竞态使用 pending entry 先到先得，并在执行工具前再次检查 AbortSignal。

## 特殊命令

`/compact` 与 `/eval` 在普通 Agent Run 前分流。它们可以用 `agentRunId` 做操作关联，但没有进入主 Agent Loop 时不能伪造 `turnId/llmCallId`。

## 修改检查清单

- [ ] 顶层运行身份是否使用 `agentRunId`，没有复用真实 `turnId`？
- [ ] 新的 provider 请求是否拥有 `llmCallId + attempt`？
- [ ] 新 Host 是否只实现 Adapter / Port，没有复制 Runtime 编排？
- [ ] terminal event 是否仍由 Runtime 在持久化提交后唯一发送？
- [ ] 新 AgentEvent 是否在 Bridge 中有 RuntimeStreamEvent 映射？
- [ ] assistant、tool 和 usage 是否关联到正确的三层身份？
- [ ] SessionEvent 是否为 `schemaVersion: 2`？
- [ ] 完整上下文是否只进入脱敏 Trace，而不是重复塞进 `session.jsonl`？
- [ ] Abort 是否覆盖 Agent、等待审批与前台工具执行？
- [ ] 修改存储或事件契约时，是否同步更新观测模型与存储文档？
