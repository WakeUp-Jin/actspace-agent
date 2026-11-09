// 持久化会话事件（`SessionEvent`）及各类事件的 payload、会话元数据、模型回复。
// 流式事件在 `./stream-events`，工具 / 子 Agent 的 UI 预览在 `./tool-preview`。

import type { FileReference, ResponseAnnotationReference } from "../composer-content";
import type { ModelApi } from "../model-config";
import type { MainAgentForm, RuntimeV2AgentMode } from "../runtime-v2/runtime";
import type { ComposerAttachment } from "./attachments";
import type { ContextState, ContextUsageSnapshot } from "./context";
import type { AgentRunId, EventId, LlmCallId, LlmUsageCost, SessionError, SessionId, ToolCallId, TurnId } from "./primitives";
import type { SubAgentTranscriptRef } from "./tool-preview";

export type SessionEventType =
  | "user_message"
  | "assistant_message"
  | "assistant_reply"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "llm_usage"
  | "diff_preview"
  | "context_snapshot"
  | "context_compaction"
  | "workspace_preparation"
  | "error"
  | "agent_run_aborted"
  /** 回合正常停下但需要提醒用户（例如步数上限）；中性提示，不是错误。 */
  | "agent_run_notice";

export type SessionEvent<TPayload = unknown> = {
  id: EventId;
  sessionId: SessionId;
  agentRunId: AgentRunId;
  turnId?: TurnId;
  llmCallId?: LlmCallId;
  type: SessionEventType;
  timestamp: string;
  schemaVersion: 2;
  payload: TPayload;
  /** 投影来源的 Journal envelope seq；由多条 envelope 合成、或不来自 Journal 的事件没有。 */
  sourceSeq?: number;
};

export type UserMessagePayload = {
  content: string;
  attachments?: ComposerAttachment[];
  fileReferences?: FileReference[];
  responseAnnotations?: ResponseAnnotationReference[];
  /** 非用户手动输入的注入消息来源（如 "task_notification"），前端据此换展示样式。 */
  source?: string;
  /** 后台任务通知开启了一轮空闲唤醒时才有；聊天里渲染成一行分隔行。 */
  backgroundNotice?: BackgroundNotice;
};

/**
 * 后台任务完成通知的元数据，来自收件箱 `notice`。
 *
 * `taskKind`：`bash` 来自 `task_notification`；`subagent` 来自 `subagent_notification`（子智能体一次激活结束）；
 * `agent_message` 来自另一个智能体的 `send_message`（`taskId` 为发送方 agent id）；`agent` 只出现在老会话。
 */
export type BackgroundNotice = {
  taskId: string;
  taskKind: "bash" | "agent" | "subagent" | "agent_message";
  title: string;
  status: string;
  /**
   * true：这条通知唤醒了空闲会话、开启了这一轮，作为这一轮开头的分隔行；
   * false：在进行中的一轮里被读到（运行中完成的任务、重启后补报的通知），分隔行留在这一轮里它被读到的位置。
   * 老数据没有这个字段，按开启一轮处理。
   */
  opensTurn?: boolean;
};

export type AssistantMessagePayload = AssistantReply;

export type ThinkingPayload = {
  title?: string;
  content: string;
  durationMs?: number;
  collapsedByDefault?: boolean;
  /** Provider opaque signature/state. Replay only to the same provider, model, and API. */
  signature?: string;
  api?: ModelApi;
  model?: string;
  provider?: string;
};

export type ToolCallPayload = {
  id: ToolCallId;
  name: string;
  arguments: Record<string, unknown>;
  api?: ModelApi;
  model?: string;
  provider?: string;
};

export type LlmUsagePayload = {
  llmCallId: LlmCallId;
  attempt: number;
  durationMs: number;
  provider: string;
  model: string;
  modelId?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
  /** True when the model-returned cache hit ratio is below the audit threshold. */
  cacheStatus?: boolean;
  /** Sidecar audit id under <userData>/cache-audit/<sessionId>/ when cacheStatus is true. */
  cacheAuditId?: string;
  /** cacheHitTokens / (cacheHitTokens + cacheMissTokens), when provider cache usage is available. */
  cacheHitRatio?: number;
  serverToolUse?: {
    webSearchRequests?: number;
    webFetchRequests?: number;
  };
  cost: LlmUsageCost;
  /** 花费口径：priced = 官方计价，estimated = 按参考价预估，unavailable = 算不出（cost.total 记 0）。旧事件没有这个字段，按已知处理。 */
  costBasis?: "priced" | "estimated" | "unavailable";
  relatedEventIds?: EventId[];
};

/** 一轮里所有 LLM 请求（含失败重试）的用量合计。 */
export type TurnUsageSummary = {
  /** 未缓存输入 + 缓存读取 + 缓存写入 + 输出。 */
  totalTokens: number;
  /** 未缓存输入。 */
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  /** 输出里的推理部分。 */
  reasoningTokens: number;
  /** 本轮用到的「提供方/模型」，按第一次出现排序。 */
  routes: string[];
  /** 能算出价格的请求的花费合计（USD）。 */
  costUsd: number;
  /** 算不出价格的请求数；大于 0 时 costUsd 只是一部分。 */
  unpricedRequestCount: number;
  /** 有请求的花费是按参考价预估的。 */
  costEstimated: boolean;
};

export type ContextSnapshotPayload = ContextUsageSnapshot;

/**
 * 历史压缩事件 payload。每次 HistoryCompactor 把较旧历史替换为合成摘要消息时落一条，
 * 便于在 session.jsonl 回溯「何时、按什么水位、压了多少」。
 */
export type ContextCompactionPayload = {
  /** 触发压缩时的估算总 token */
  triggerTokens: number;
  /** 触发阈值（contextWindow × compressionThreshold） */
  thresholdTokens: number;
  /** 压缩前的消息条数 */
  beforeCount: number;
  /** 压缩后的消息条数 */
  afterCount: number;
  /** 合成摘要正文字符数 */
  summaryChars: number;
  /** 完整历史文件路径（session.jsonl 绝对路径） */
  historyRefPath: string;
  trigger?: "manual" | "auto";
  status?: "compacted" | "skipped" | "failed";
  reductionRatio?: number;
  removedCount?: number;
  reason?: string;
  /** 压缩耗时；优先读取 compaction/end.durationMs，旧 journal 回退 start/end 时间差 */
  durationMs?: number;
  /** 模型之后看到的摘要正文 */
  summary?: string;
  /** journal 里的压缩事务 id，用于在轨迹里定位压缩行 */
  compactionId?: string;
  /** 压缩前上下文 token：最近一次实测用量 + 之后新增内容的估算；没有实测基准时缺省 */
  beforeTokens?: number;
  /** 压缩后上下文 token（压缩前 − 估算被替换条目 + 估算摘要） */
  afterTokens?: number;
  /** 压缩前 token 含估算（实测之后又追加了内容，或基准是上一次压缩的估算结果），显示时带「约」 */
  beforeEstimated?: true;
};

export type SessionWorktreeContext = {
  kind: "worktree";
  sourceWorkspaceRoot: string;
  workspaceRoot: string;
  baseBranch: string;
  branch: string;
  baseCommit: string;
  createdAt: string;
};

export type WorkspacePreparationPayload = {
  kind: "worktree";
  status: "completed";
  sourceWorkspaceRoot: string;
  workspaceRoot: string;
  baseBranch: string;
  branch: string;
  baseCommit: string;
  durationMs: number;
  environmentSetup: "none";
};

export type ErrorPayload = SessionError;

export type AgentRunAbortedPayload = {
  reason: "user";
};

export type SessionMeta = {
  schemaVersion: 2;
  id: SessionId;
  title: string;
  updatedAt: string;
  createdAt: string;
  agentRunCount: number;
  agentForm?: MainAgentForm;
  agentMode?: RuntimeV2AgentMode;
  agentModeRevision?: number;
  /** 工作区注册表里的稳定 id；缺省时按 workspaceRoot 或默认 workspace 解析。 */
  workspaceId?: string;
  /** 创建会话时的工作区根目录，用于侧边栏按 Workspace 分组；缺省时视为 default。 */
  workspaceRoot?: string;
  /** Worktree 会话的隔离执行上下文；workspaceId 仍指向原始长期 Workspace。 */
  worktree?: SessionWorktreeContext;
  /** 用户是否把该会话钉到 Pinned 分区；缺省视为 false。 */
  pinned?: boolean;
  /** 用户是否把该会话归档；缺省视为 false。 */
  archived?: boolean;
};

export type AssistantReply = {
  content: string;
  stopReason: "stop" | "toolUse" | "length" | "error" | "aborted";
  api?: ModelApi;
  model: string;
  provider: string;
  modelId?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    reasoningTokens?: number;
    cacheHitTokens?: number;
    cacheMissTokens?: number;
    serverToolUse?: {
      webSearchRequests?: number;
      webFetchRequests?: number;
    };
    cost?: LlmUsageCost;
  };
};

export type AgentRunResult = {
  sessionId: SessionId;
  agentRunId: AgentRunId;
  events: SessionEvent[];
  subagentTranscripts?: Array<{
    transcriptRef: SubAgentTranscriptRef;
    events: SessionEvent[];
  }>;
  finalReply?: AssistantReply;
  contextSnapshot: ContextUsageSnapshot;
  contextState?: ContextState;
  status: "completed" | "failed" | "aborted";
  error?: {
    code: string;
    message: string;
  };
};
