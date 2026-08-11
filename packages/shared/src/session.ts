import type { ContextUsageBucketName } from "./context-buckets";
import type { ModelApi } from "./model-config";

export type SessionId = string;
export type AgentRunId = string;
export type TurnId = string;
export type LlmCallId = string;
export type EventId = string;
export type ToolCallId = string;

export type SessionError = {
  code: string;
  message: string;
  recoverable: boolean;
  details?: string;
};

export type LlmUsageCost = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  currency: "USD" | "CNY";
};

export type RuntimeStreamEvent =
  | { type: "agent_run_started"; sessionId: SessionId; agentRunId: AgentRunId }
  | { type: "agent_turn_started"; sessionId: SessionId; agentRunId: AgentRunId; turnId: TurnId; turnIndex: number }
  | { type: "agent_turn_finished"; sessionId: SessionId; agentRunId: AgentRunId; turnId: TurnId; turnIndex: number }
  | {
      type: "llm_call_started";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      turnId: TurnId;
      turnIndex: number;
      llmCallId: LlmCallId;
      attempt: number;
    }
  | {
      type: "llm_call_finished";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      turnId: TurnId;
      turnIndex: number;
      llmCallId: LlmCallId;
      attempt: number;
      durationMs: number;
      stopReason: AssistantReply["stopReason"];
    }
  | {
      type: "workspace_preparation_started";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      kind: "worktree";
      sourceWorkspaceRoot: string;
      baseBranch: string;
    }
  | {
      type: "workspace_preparation_finished";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      payload: WorkspacePreparationPayload;
    }
  | {
      type: "context_compaction_started";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      trigger: "manual" | "auto";
      stage: "queued" | "preparing" | "summarizing" | "writing" | "completed";
      progress?: number;
    }
  | {
      type: "context_compaction_progress";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      trigger: "manual" | "auto";
      stage: "queued" | "preparing" | "summarizing" | "writing" | "completed";
      progress?: number;
      summary?: string;
    }
  | {
      type: "context_compaction_finished";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      trigger: "manual" | "auto";
      stage: "completed";
      status: "compacted" | "skipped";
      progress?: number;
      summary?: string;
      payload: ContextCompactionPayload;
    }
  | {
      type: "context_compaction_failed";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      trigger: "manual" | "auto";
      stage: "failed";
      error: SessionError;
    }
  | { type: "assistant_text_delta"; sessionId: SessionId; agentRunId: AgentRunId; turnId: TurnId; llmCallId: LlmCallId; messageId: EventId; delta: string }
  | { type: "assistant_thinking_delta"; sessionId: SessionId; agentRunId: AgentRunId; turnId: TurnId; llmCallId: LlmCallId; messageId: EventId; delta: string }
  | {
      type: "tool_call_streaming";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      turnId: TurnId;
      llmCallId: LlmCallId;
      toolCallId: ToolCallId;
      toolName: string;
      /** 首帧（dispatched 阶段）为 true，后续帧 false/undefined */
      isInitial?: boolean;
      /** 后端按 previewKind 解析 partial args 得到的 typed preview，前端直接渲染 */
      preview: ToolUiPreview;
    }
  | { type: "tool_started"; sessionId: SessionId; agentRunId: AgentRunId; turnId: TurnId; llmCallId: LlmCallId; toolCallId: ToolCallId; toolName: string; argsPreview: string; preview?: ToolUiPreview }
  | { type: "tool_finished"; sessionId: SessionId; agentRunId: AgentRunId; turnId: TurnId; llmCallId: LlmCallId; toolCallId: ToolCallId; toolName: string; resultEventId: EventId; isError: boolean; preview?: ToolUiPreview }
  | {
      /** 后台 bash 任务状态更新：turn 内外统一走 agent:stream 推送，前端按 taskId 更新对应块 */
      type: "bash_task_update";
      sessionId: SessionId;
      taskId: string;
      status: BashBackgroundStatus;
      exitCode?: number | null;
    }
  | {
      type: "subagent_event";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      turnId?: TurnId;
      llmCallId?: LlmCallId;
      toolCallId: ToolCallId;
      transcriptRef: SubAgentTranscriptRef;
      event: SessionEvent;
      preview: AgentToolPreview;
    }
  | { type: "tool_approval_required"; sessionId: SessionId; agentRunId: AgentRunId; turnId?: TurnId; llmCallId?: LlmCallId; toolCallId: ToolCallId; toolName: string; requestId: string; summary: string; reason: string; command?: string; riskLevel?: string; approvalScope?: "browser_session"; executionEnvironment?: "sandbox" | "real" }
  | { type: "tool_approval_resolved"; sessionId: SessionId; agentRunId: AgentRunId; turnId?: TurnId; llmCallId?: LlmCallId; toolCallId: ToolCallId; requestId: string; decision: string; approvalScope?: "browser_session" }
  | {
      /** LLM 调用命中可重试错误、agent loop 正在退避重试；renderer 据此清掉半截 streaming 内容并显示重试提示 */
      type: "llm_retry";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      turnId: TurnId;
      turnIndex: number;
      /** 触发重试的失败请求；下一次请求尚未创建自己的 llmCallId。 */
      failedLlmCallId: LlmCallId;
      /** 即将开始的请求尝试序号（首次为 1，因此重试事件从 2 开始）。 */
      attempt: number;
      /** 最大重试次数 */
      maxAttempts: number;
      reason: string;
    }
  | { type: "agent_run_aborted"; sessionId: SessionId; agentRunId: AgentRunId }
  | { type: "agent_run_finished"; sessionId: SessionId; agentRunId: AgentRunId; resultEventIds: EventId[] }
  | { type: "agent_run_failed"; sessionId: SessionId; agentRunId: AgentRunId; error: SessionError };

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
  | "eval_candidate"
  | "error"
  | "agent_run_aborted"
  // ↓ Kairos 自治模式专属生命周期事件（追加在末尾，不允许调换顺序，详见
  // docs/exec-plans/active/kairos_shared_contracts.md §1）↓
  | "kairos_tick_injected"
  | "kairos_sleep_start"
  | "kairos_sleep_end"
  | "kairos_sleep_interrupted";

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
};

export type AgentTraceEventType =
  | "agent_run_start"
  | "agent_run_end"
  | "turn_start"
  | "turn_end"
  | "llm_request"
  | "llm_response"
  | "llm_retry";

export type AgentTraceEvent = {
  schemaVersion: 1;
  timestamp: string;
  sessionId: SessionId;
  agentRunId: AgentRunId;
  turnId?: TurnId;
  turnIndex?: number;
  llmCallId?: LlmCallId;
  attempt?: number;
  type: AgentTraceEventType;
  payload: unknown;
};

export type UserMessagePayload = {
  content: string;
  attachments?: ComposerAttachment[];
  /** 非用户手动输入的注入消息来源（如 "task_notification"），前端据此换展示样式。 */
  source?: string;
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
  relatedEventIds?: EventId[];
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
};

export type EvalCandidatePayload = {
  candidateId?: string;
  relativePath?: string;
  status: "generated" | "failed";
  summary: string;
  error?: string;
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

/**
 * Kairos tick 注入事件 payload。
 * 每次 Kairos 控制器把一个 tick（自动或 brief 触发）作为 user message 投递给 LLM 时落一条。
 * content 是真正进入 LLM 历史的字符串（与 user_message.content 等价）。
 */
export type KairosTickInjectedPayload = {
  trigger: "auto" | "wake_now" | "brief";
  briefId?: string;
  content: string;
};

/** Kairos 进入 sleep 时的 payload。plannedSeconds 是控制器夹紧后的值。 */
export type KairosSleepStartPayload = {
  plannedSeconds: number;
  reason: "after_tick" | "after_error" | "manual";
};

/** Kairos sleep 自然结束的 payload；actualSeconds 反映实际等待时长。 */
export type KairosSleepEndPayload = {
  actualSeconds: number;
};

/** Kairos sleep 被打断的 payload；reason 标明打断来源，remainingSeconds 是被打断时还剩多久。 */
export type KairosSleepInterruptedPayload = {
  reason: "user_message" | "wake_now";
  remainingSeconds: number;
};

export type SessionMeta = {
  schemaVersion: 2;
  id: SessionId;
  title: string;
  updatedAt: string;
  createdAt: string;
  agentRunCount: number;
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

export type ToolArtifact = {
  type: "file" | "diff" | "image" | "text";
  name: string;
  path?: string;
  mimeType?: string;
};

export type TodoStatus = "pending" | "in_progress" | "completed";

export type TodoItem = {
  id: string;
  content: string;
  status: TodoStatus;
  activeForm?: string;
  createdAt: string;
  updatedAt: string;
};

export type TodoSnapshot = {
  todos: TodoItem[];
  totalCount: number;
  revision: number;
};

export type TodoUiPreview = TodoSnapshot & {
  kind: "todo";
  completedCount: number;
  displayText: string;
};

export type ToolExecutionError = SessionError;

export type ToolOutputRef = {
  kind: "inline" | "file";
  value: string;
};

export type SubAgentRunStatus = "running" | "completed" | "failed" | "aborted";

export type SubAgentTranscriptRef = {
  kind: "subagent_transcript";
  sessionId: SessionId;
  agentRunId: AgentRunId;
  runId: string;
  path?: string;
};

export type AgentToolStats = {
  durationMs: number;
  toolCallCount: number;
  exploredFileCount?: number;
  totalTokens?: number;
};

export type AgentToolRecentEvent = {
  id: EventId;
  type: SessionEventType;
  title: string;
  summary: string;
  timestamp: string;
  isError?: boolean;
};

export type AgentToolPreview = {
  kind: "agent";
  description: string;
  status: SubAgentRunStatus;
  subagentType: "explore";
  displayText: string;
  summary?: string;
  recentEvents?: AgentToolRecentEvent[];
  transcriptRef?: SubAgentTranscriptRef;
  stats?: AgentToolStats;
  error?: string;
  /**
   * 前端展示形态。
   *
   * - `panel`（默认/缺省）：通用 `agent` 子代理，点击打开 Composer 上方 transcript Panel。
   * - `inline`：内置 Explore 聚焦子代理，主消息流内联 `Worked for Xs` 折叠，展开是嵌套真实工具行。
   *
   * 见 docs/design-docs/collaboration/agent-explore-subagent.md。
   */
  display?: "panel" | "inline";
};

export type ToolPreviewKind =
  | "read"
  | "search"
  | "grep"
  | "glob"
  | "web_search"
  | "media_analysis"
  | "image_generation"
  | "directory_list"
  | "edit_diff"
  | "write"
  | "delete"
  | "bash"
  | "agent"
  | "todo"
  | "browser_cua"
  | "browser_dom"
  | "browser_locator"
  | "browser_navigation"
  | "browser_tabs"
  | "browser_user"
  | "browser_wait"
  | "browser_io"
  | "browser_debug"
  | "browser_help"
  | "browser_run"
  | "browser_screenshot"
  | "browser_dom_snapshot"
  | "browser_navigate"
  | "browser_open_tab"
  | "browser_list_tabs"
  | "browser_click"
  | "browser_fill"
  | "browser_press_key"
  | "browser_select"
  | "browser_scroll"
  | "browser_back"
  | "browser_close_tab"
  | "browser_user_tabs"
  | "browser_claim_tab"
  | "browser_finalize"
  | "generic";

export type ToolUiPreview =
  | { kind: "read"; filePath: string; range?: string; displayText: string }
  | { kind: "search"; query: string; scope?: string; resultCount?: number; displayText: string }
  | { kind: "grep"; pattern: string; scope?: string; resultCount?: number; displayText: string }
  | { kind: "glob"; pattern: string; scope?: string; resultCount?: number; displayText: string }
  | { kind: "web_search"; mode: "query" | "url"; query?: string; url?: string; displayText: string; resultUrls?: string[]; contentPreview?: string }
  | { kind: "media_analysis"; mediaName: string; mediaKind: "image" | "video" | "media"; displayText: string }
  | {
      kind: "image_generation";
      status: "running" | "completed" | "partial" | "failed";
      promptPreview: string;
      requestedCount: number;
      generatedCount?: number;
      model?: string;
      size: string;
      displayText: string;
      images?: ToolArtifact[];
      warning?: string;
      errorMessage?: string;
    }
  | { kind: "directory_list"; path: string; entryCount?: number; displayText: string }
  | {
      kind: "edit_diff";
      filePath: string;
      outputPath?: string;
      outputRelativePath?: string;
      additions: number;
      deletions: number;
      diff: string;
      collapsedLines: number;
      status?: "pending" | "running" | "completed" | "failed" | "denied";
      approvalRequestId?: string;
      /** 失败/拒绝时的错误说明；不复用 diff 字段承载错误文本 */
      errorMessage?: string;
    }
  | {
      kind: "write";
      filePath: string;
      outputPath?: string;
      outputRelativePath?: string;
      additions: number;
      deletions: number;
      diff: string;
      collapsedLines: number;
      status?: "pending" | "running" | "completed" | "failed" | "denied";
      approvalRequestId?: string;
      /** 失败/拒绝时的错误说明；不复用 diff 字段承载错误文本 */
      errorMessage?: string;
      /** running 阶段从 LLM 流式 args.content 提取的部分内容；completed 阶段不使用 */
      streamingContent?: string;
    }
  | {
      kind: "delete";
      filePath: string;
      outputPath?: string;
      outputRelativePath?: string;
      displayText: string;
      status?: "pending" | "running" | "completed" | "failed" | "denied";
      approvalRequestId?: string;
    }
  | BashPreview
  | AgentToolPreview
  | TodoUiPreview
  | { kind: "generic"; title: string; content: string };

export type BashStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "denied"
  | "expired"
  | "cancelled";

/**
 * 后台 bash 任务的 UI 状态（shared 为契约权威）。
 * 前四态与 agent-core BashTaskStatus 对齐；"stalled" 是 UI 附加态：
 * 进程仍在运行但疑似阻塞在交互式提问（看门狗事件），输出恢复后回到 running。
 */
export type BashBackgroundStatus = "running" | "completed" | "failed" | "killed" | "stalled";

export type BashPreview = {
  kind: "bash";
  status: BashStatus;
  title: string;
  command: string;
  commandPreview?: string;
  cwd?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  durationMs?: number;
  reason?: string;
  policyLabel?: string;
  approvalRequestId?: string;
  intent?: string;
  /** 命令已转后台运行时的任务 id（bash_task_update 事件按它定位块）。 */
  backgroundTaskId?: string;
  /** 后台任务当前状态；存在即表示该命令走了后台路径。 */
  backgroundStatus?: BashBackgroundStatus;
  /** 后台任务落盘输出路径。 */
  outputFilePath?: string;
  /** 本次命令是否在沙盒内执行（true 沙盒 / false 真实环境 / 缺省未知——历史数据）。 */
  sandboxed?: boolean;
  /** 命令在进程启动前被拒绝或取消，没有进入任何执行环境。 */
  notExecuted?: boolean;
};

export type ToolExecutionResult = {
  toolCallId?: ToolCallId;
  toolName: string;
  ok: boolean;
  summary: string;
  rawOutput?: string;
  truncatedOutput?: string;
  rawOutputRef?: ToolOutputRef;
  modelOutput?: string;
  uiPreview?: ToolUiPreview;
  artifacts?: ToolArtifact[];
  error?: ToolExecutionError;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  tokenEstimate?: number;
};

export type ContextUsageBucket = {
  name?: ContextUsageBucketName;
  key?: ContextUsageBucketName;
  label?: string;
  tokens: number;
  colorToken?: string;
};

export type ContextUsageSnapshot = {
  totalTokens: number;
  maxTokens: number;
  percentUsed: number;
  compressionCount?: number;
  cumulativeTokens?: number;
  estimator?: {
    name: string;
    version: string;
  };
  buckets: ContextUsageBucket[];
};

export type ContextStateEntry = {
  id: string;
  kind:
    | "systemPrompt"
    | "toolDefinitions"
    | "rules"
    | "skills"
    | "summarizedConversation"
    | "conversation";
  title: string;
  estimatedTokens: number;
  included: boolean;
  pinned?: boolean;
  removable?: boolean;
  sourceEventIds?: EventId[];
  contentHash?: string;
  preview?: string;
};

export type ContextState = {
  sessionId: SessionId;
  activeAgentRunId?: AgentRunId;
  updatedAt: string;
  estimator: {
    name: string;
    version: string;
  };
  totalEstimatedTokens: number;
  maxTokens: number;
  percentUsed: number;
  buckets: ContextUsageBucket[];
  entries: ContextStateEntry[];
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

export type ComposerAttachment = {
  id: string;
  kind: "file" | "image" | "link";
  name: string;
  path?: string;
  mimeType?: string;
  previewUrl?: string;
};

export type MessageBlock = {
  /**
   * React 展示身份。持久化 event id 保留给数据引用和消息操作，流式状态与持久化状态
   * 则通过同一个 renderKey 复用 DOM，避免 turn 完成时重新播放入场动画。
   */
  renderKey?: string;
} & (
  | {
      kind: "user";
      id: EventId;
      content: string;
      createdAt: string;
      attachments?: ComposerAttachment[];
    }
  | {
      kind: "assistant";
      id: EventId;
      content: string;
      createdAt: string;
      model?: string;
      provider?: string;
      /** 本轮所有 LLM call 的真实 token 与统一 USD 预估费用，只挂在最终可见回复上。 */
      usage?: {
        totalTokens: number;
        costUsd: number;
      };
    }
  | {
      kind: "thinking";
      id: EventId;
      title: string;
      content: string;
      createdAt: string;
      collapsedByDefault: boolean;
      /** 仅用于当前 renderer 流式投影；持久化 Thinking 默认是 completed。 */
      status?: "running" | "completed";
    }
  | {
      kind: "read";
      id: EventId;
      filePath: string;
      range?: string;
      displayText: string;
      createdAt: string;
      status?: "running" | "completed";
    }
  | {
      kind: "search";
      id: EventId;
      query: string;
      scope?: string;
      resultCount?: number;
      displayText: string;
      createdAt: string;
      status?: "running" | "completed";
    }
  | {
      kind: "grep";
      id: EventId;
      pattern: string;
      scope?: string;
      resultCount?: number;
      displayText: string;
      createdAt: string;
      status?: "running" | "completed";
    }
  | {
      kind: "glob";
      id: EventId;
      pattern: string;
      scope?: string;
      resultCount?: number;
      displayText: string;
      createdAt: string;
      status?: "running" | "completed";
    }
  | {
      kind: "web_search";
      id: EventId;
      mode: "query" | "url";
      query?: string;
      url?: string;
      displayText: string;
      createdAt: string;
      status?: "running" | "completed";
      resultUrls?: string[];
      contentPreview?: string;
    }
  | {
      kind: "media_analysis";
      id: EventId;
      mediaName: string;
      mediaKind: "image" | "video" | "media";
      displayText: string;
      createdAt: string;
      status?: "running" | "completed";
      isError?: boolean;
    }
  | {
      kind: "image_generation";
      id: EventId;
      status: "running" | "completed" | "partial" | "failed";
      promptPreview: string;
      requestedCount: number;
      generatedCount?: number;
      model?: string;
      size: string;
      displayText: string;
      images?: ToolArtifact[];
      warning?: string;
      errorMessage?: string;
      createdAt: string;
    }
  | {
      kind: "directory_list";
      id: EventId;
      path: string;
      entryCount?: number;
      displayText: string;
      createdAt: string;
      status?: "running" | "completed";
    }
  | {
      kind: "edit_diff";
      id: EventId;
      filePath: string;
      outputPath?: string;
      outputRelativePath?: string;
      additions: number;
      deletions: number;
      diff: string;
      collapsedLines: number;
      createdAt: string;
      status?: "pending" | "running" | "completed" | "failed" | "denied";
      approvalRequestId?: string;
      /** pending 审批时的原因说明 */
      reason?: string;
      /** 失败/拒绝时的错误说明 */
      errorMessage?: string;
    }
  | {
      kind: "write_diff";
      id: EventId;
      filePath: string;
      outputPath?: string;
      outputRelativePath?: string;
      additions: number;
      deletions: number;
      diff: string;
      collapsedLines: number;
      createdAt: string;
      status?: "pending" | "running" | "completed" | "failed" | "denied";
      approvalRequestId?: string;
      /** pending 审批时的原因说明 */
      reason?: string;
      /** 失败/拒绝时的错误说明 */
      errorMessage?: string;
      /** running 阶段从 LLM 流式 args.content 提取的部分内容；completed 不使用 */
      streamingContent?: string;
    }
  | {
      kind: "delete";
      id: EventId;
      filePath: string;
      outputPath?: string;
      outputRelativePath?: string;
      displayText: string;
      createdAt: string;
      status?: "pending" | "running" | "completed" | "failed" | "denied";
      isError?: boolean;
      approvalRequestId?: string;
      reason?: string;
    }
  | ({
      kind: "bash";
      id: EventId;
      createdAt: string;
    } & BashPreview)
  | ({
      kind: "agent";
      id: EventId;
      createdAt: string;
      transcriptEvents?: SessionEvent[];
    } & Omit<AgentToolPreview, "kind">)
  | ({
      kind: "todo";
      id: EventId;
      createdAt: string;
      status: "running" | "completed" | "failed";
      isError?: boolean;
    } & Omit<TodoUiPreview, "kind">)
  | {
      kind: "tool";
      id: EventId;
      toolName?: string;
      title: string;
      content: string;
      createdAt: string;
      isError?: boolean;
      status?: "pending" | "running" | "completed" | "failed" | "denied";
      approvalRequestId?: string;
      approvalReason?: string;
      approvalScope?: "browser_session";
    }
  | {
      kind: "context_compaction";
      id: EventId;
      status: "pending" | "running" | "completed" | "skipped" | "failed";
      trigger: "manual" | "auto";
      stage?: string;
      summaryText: string;
      reductionLabel?: string;
      progress?: number;
      createdAt: string;
    }
  | {
      kind: "workspace_preparation";
      id: EventId;
      status: "running" | "completed";
      sourceWorkspaceRoot: string;
      workspaceRoot?: string;
      baseBranch: string;
      branch?: string;
      baseCommit?: string;
      durationMs?: number;
      environmentSetup?: "none";
      createdAt: string;
    }
  | {
      kind: "error";
      id: EventId;
      title: string;
      content: string;
      createdAt: string;
      recoverable: boolean;
    }
  | {
      kind: "status";
      id: EventId;
      content: string;
      createdAt: string;
      tone?: "muted" | "error";
    }
);

export type SessionDiffSummary = {
  sessionId: SessionId;
  files: Array<{
    filePath: string;
    additions: number;
    deletions: number;
    diff: string;
    sourceEventIds: EventId[];
  }>;
  totalAdditions: number;
  totalDeletions: number;
};
