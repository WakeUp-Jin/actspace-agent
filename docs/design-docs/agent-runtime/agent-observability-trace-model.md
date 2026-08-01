# Agent 分析观测数据模型

本文档定义 ActSpace 主 Agent 从用户输入到真实模型请求的观测层级、标识语义与本地存储边界。它是分析观测页面、运行时事件和 trace 持久化的事实来源。

## 目标

分析观测需要稳定回答以下问题：

- 哪一次用户输入触发了哪一次 Agent Run？
- 一次 Agent Run 内发生了多少个 Turn？
- 每个 Turn 发起了多少次真实 LLM 请求，是否发生重试？
- 每次请求发送了什么 system prompt、工具定义与消息？
- 模型返回了什么，产生了哪些工具调用，消耗了多少 token 和时间？
- 相邻请求的上下文发生了什么变化？

旧契约把一次前端发送生成的粗粒度 `turnId` 同时用于 Agent Run、流式路由、审批、终止和持久化。后端 `runAgentLoop` 后来引入了真实的 `turn_start/turn_end + turnIndex`，但 Bridge 没有把这一层暴露或持久化。V2 契约直接修正这处语义错位，不兼容旧 Session 数据。

## 层级与标识

```text
Session
└─ User Message
   └─ Agent Run
      ├─ agentRunId
      ├─ Agent Turn 1
      │  ├─ turnId
      │  ├─ turnIndex: 1
      │  ├─ LLM Call 1
      │  ├─ LLM Call 2（可重试错误后的再次请求）
      │  └─ Tool Calls
      └─ Agent Turn 2
         ├─ turnId
         ├─ turnIndex: 2
         └─ LLM Call 3
```

| 标识 | 作用域 | 语义 |
| --- | --- | --- |
| `sessionId` | 应用会话 | 一段可恢复的用户会话 |
| `agentRunId` | Session 内唯一 | 一次 `agent_start -> agent_end`；当前由一次普通用户发送触发 |
| `turnId` | Agent Run 内唯一 | 一次 `turn_start -> turn_end` |
| `turnIndex` | Agent Run 内递增 | Turn 的显示顺序，从 1 开始 |
| `llmCallId` | Agent Run 内唯一 | 一次真实 provider API 请求 |
| `attempt` | Turn 内递增 | 同一 Turn 的 LLM 请求尝试序号，从 1 开始 |
| `toolCallId` | provider/tool scheduler 唯一 | 一次模型声明并由 ActSpace 执行的工具调用 |

当前执行循环通常是“一次 Turn 对应一次 LLM Call”；可重试错误会让同一个 Turn 出现多个 LLM Call。V2 不能把两者编码成永久一对一。

## 运行时事件

### Agent 内部事件

```ts
type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: Message[] }
  | { type: "turn_start"; turnId: string; turnIndex: number }
  | { type: "turn_end"; turnId: string; turnIndex: number; message: AssistantMessage; toolResults: ToolResultMessage[] }
  | { type: "llm_call_start"; turnId: string; turnIndex: number; llmCallId: string; attempt: number; request: LlmRequestSnapshot }
  | { type: "llm_call_end"; turnId: string; turnIndex: number; llmCallId: string; attempt: number; response: LlmResponseSnapshot }
  | { type: "llm_retry"; turnId: string; turnIndex: number; failedLlmCallId: string; attempt: number; maxAttempts: number; reason: string }
  | MessageAndToolEvents;
```

`agentRunId` 由调用 Agent 的上层持有，Bridge 在翻译、记录和持久化时附加。Agent Loop 只生成 Run 内的 `turnId` 与 `llmCallId`，不依赖 Electron、Session 或 IPC。

### Renderer 流式事件

现有 `turn_started/finished/failed/aborted` 改名为：

- `agent_run_started`
- `agent_run_finished`
- `agent_run_failed`
- `agent_run_aborted`

所有主 Agent 流式事件必须包含 `{ sessionId, agentRunId }`。分析观测需要的细粒度事件另外包含：

- `agent_turn_started/finished`: `turnId + turnIndex`
- `llm_call_started/finished`: `turnId + turnIndex + llmCallId + attempt`
- `llm_retry`: `turnId + turnIndex + failedLlmCallId + attempt`；`attempt` 是即将开始的序号，下一次请求开始时才生成新的 `llmCallId`。

聊天 Renderer 仍可只消费 Agent Run、消息和工具事件；分析观测页面消费完整事件集。

## SessionEvent V2

V2 直接替换旧格式，不提供旧 `turnId -> agentRunId` 兼容读取：

```ts
type SessionEvent<TPayload = unknown> = {
  id: EventId;
  sessionId: SessionId;
  agentRunId: AgentRunId;
  turnId?: TurnId;
  llmCallId?: LlmCallId;
  type: SessionEventType;
  timestamp: string;
  schemaVersion: 2;
  payload: TPayload;
};
```

归属规则：

- `user_message`、最终运行状态、运行级 `context_snapshot` 至少有 `agentRunId`。
- assistant/thinking/tool/usage 事件应携带其真实 `turnId`。
- `llm_usage` 必须携带对应的 `llmCallId`，payload 继续保存 provider、model、token、cache 和 cost。
- `tool_call/tool_result` 携带产生该调用的 `turnId` 与 `llmCallId`。
- `/compact`、`/eval` 和 Kairos 等非普通主 Agent 路径仍使用 `agentRunId` 作为一次操作的关联键；只有进入 Agent Loop 的路径才要求真实 `turnId/llmCallId`。

## Trace 存储

`session.jsonl` 继续保存会话恢复所需的稳定事实，不重复保存每次请求的完整上下文。分析观测的完整证据写入：

```text
<userData>/sessions/<sessionId>/traces/<agentRunId>.jsonl
<userData>/sessions/<sessionId>/traces/<agentRunId>.summary.json
```

每个 trace 文件采用追加写 JSONL：

```ts
type AgentTraceEvent = {
  schemaVersion: 1;
  timestamp: string;
  sessionId: string;
  agentRunId: string;
  turnId?: string;
  turnIndex?: number;
  llmCallId?: string;
  attempt?: number;
  type: "agent_run_start" | "agent_run_end" | "turn_start" | "turn_end" | "llm_request" | "llm_response" | "llm_retry";
  payload: unknown;
};
```

`llm_request.payload` 保存：

- provider、model 与非敏感调用选项；
- system prompt；
- 当次 tools schema；
- 当次 messages；
- 请求开始时间。

`llm_response.payload` 保存：

- stop reason；
- 完整 assistant message；
- usage、cache 与耗时；
- provider 错误的裁剪诊断信息。

### Summary sidecar 与受限读取

`<agentRunId>.summary.json` 是导航索引，不是新的事实源。它只保存：

- `recording / completed / failed` 运行状态与独立 `truncated` 标记；
- Turn、LLM Call、retry 数量；
- 模型名、工具名、token、cache、duration 和文件字节数；
- 每个 Turn 的轻量统计。

Writer 在事件写入后原子替换 sidecar。分析页面先通过 `agent-analysis:index` 合并 Session V2 的用户输入与各 Run sidecar，只在用户选中某个 Run 时调用 `agent-trace:read` 读取完整 JSONL。sidecar 缺失或损坏时，Main 只对对应 Run 做 64 MiB / 100,000 事件上限内的回退重建；单个不可读 Run 会被隔离，不阻断其他 Run 或聊天恢复。

Trace 的可靠性边界：

- 单 Run JSONL 最多 64 MiB；达到上限后停止追加完整事件，sidecar 继续更新并标记 `truncated`，Agent Run 不受影响。
- 自动保留默认 30 天、全局最多 512 MiB；只删除最旧的终态 Trace，`recording` Trace 不参与自动清理。
- 清理只作用于 `traces/`，不会删除 `session.jsonl`、设置、密钥、Workspace、插件或 Skills。
- Reader 只接受普通文件，拒绝符号链接、路径穿越、混合身份和中间坏行；仅允许忽略文件末尾唯一未完成 JSON 行。

## 安全边界

Trace 是本地开发与分析数据，但仍必须遵守：

- 不写 API Key、Authorization、Cookie、代理鉴权或供应商管理密钥。
- 不写 renderer 无权读取的原始请求 header。
- cURL 由读取层按需生成，鉴权值只使用 `${API_KEY}` 等占位符。
- 当前 cURL 基于 ActSpace provider-neutral 请求快照生成，用于复现模型上下文；它不是供应商原始 HTTP wire payload，未安全捕获的 URL、Header 或 provider 私有字段不得补造。
- 错误对象只保存裁剪后的 code/message/status，不保存可能回显鉴权信息的完整 upstream body。
- 图片 data URL、Base64、远程签名 URL 和附件原始二进制不进入 trace；只保留安全引用和轻量元数据。
- Trace 读取只能通过 Main Process IPC，并校验目标仍位于当前 Session 的 `traces/` 子树。

## 数据清理

本次为开发期破坏性升级，不迁移旧 `session.jsonl`。仓库提供显式清理脚本：

```sh
pnpm reset:session-data -- --data-root /absolute/path/to/actspace --confirm
```

脚本默认只预览目标；缺少绝对 `--data-root` 或 `--confirm` 时不得删除。允许清理的范围仅限该 data root 下的 `sessions/`、`cache-audit/` 和与 Session 恢复强绑定的上下文数据，不删除设置、密钥、Workspace、插件或 Skills。

## 分析观测 UI 映射

首版页面保持两栏：

- 左栏：搜索、当前 Session 实际调用过的 Tools 筛选、按用户输入折叠的 Turn 列表。
- 右栏：选中 Turn，并在 Turn 内切换 LLM Call；展示工具定义、系统提示词、消息、响应、完整 JSON。
- 顶部操作：对比上次、请求 JSON、cURL。
- 不增加独立“工具执行”折叠区；工具调用从响应读取，工具结果在下一次请求消息与请求差异中展示。

正式页面规范见 `../frontend/front-agent-analysis-observability.md`；交互与视觉 Mock 见 `../frontend/front-agent-analysis-observability-prototype.html`。HTML 文件只验证信息架构，数据均为显式 Mock，不代表生产页面已经接入。

`agentRunId` 当前与普通用户输入一对一，因此不占用额外可见导航层；它作为页面数据关联键保留，为未来一个用户动作触发多次 Run 或子 Agent Run 留出扩展点。
