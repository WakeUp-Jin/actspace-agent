import type { ContextUsageBucketName } from "./context-buckets";

export type SessionId = string;
export type TurnId = string;
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
  | { type: "turn_started"; sessionId: SessionId; turnId: TurnId }
  | {
      type: "context_compaction_started";
      sessionId: SessionId;
      turnId: TurnId;
      trigger: "manual" | "auto";
      stage: "queued" | "preparing" | "summarizing" | "writing" | "completed";
      progress?: number;
    }
  | {
      type: "context_compaction_progress";
      sessionId: SessionId;
      turnId: TurnId;
      trigger: "manual" | "auto";
      stage: "queued" | "preparing" | "summarizing" | "writing" | "completed";
      progress?: number;
      summary?: string;
    }
  | {
      type: "context_compaction_finished";
      sessionId: SessionId;
      turnId: TurnId;
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
      turnId: TurnId;
      trigger: "manual" | "auto";
      stage: "failed";
      error: SessionError;
    }
  | { type: "assistant_text_delta"; messageId: EventId; delta: string }
  | { type: "assistant_thinking_delta"; messageId: EventId; delta: string }
  | {
      type: "tool_call_streaming";
      toolCallId: ToolCallId;
      toolName: string;
      /** 首帧（dispatched 阶段）为 true，后续帧 false/undefined */
      isInitial?: boolean;
      /** 后端按 previewKind 解析 partial args 得到的 typed preview，前端直接渲染 */
      preview: ToolUiPreview;
    }
  | { type: "tool_started"; toolCallId: ToolCallId; toolName: string; argsPreview: string; preview?: ToolUiPreview }
  | { type: "tool_finished"; toolCallId: ToolCallId; toolName: string; resultEventId: EventId; isError: boolean; preview?: ToolUiPreview }
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
      toolCallId: ToolCallId;
      transcriptRef: SubAgentTranscriptRef;
      event: SessionEvent;
      preview: AgentToolPreview;
    }
  | { type: "tool_approval_required"; toolCallId: ToolCallId; toolName: string; requestId: string; summary: string; reason: string; command?: string; riskLevel?: string }
  | { type: "tool_approval_resolved"; toolCallId: ToolCallId; requestId: string; decision: string }
  | {
      /** LLM 调用命中可重试错误、agent loop 正在退避重试；renderer 据此清掉半截 streaming 内容并显示重试提示 */
      type: "llm_retry";
      sessionId: SessionId;
      turnId: TurnId;
      /** 第几次重试（从 1 开始） */
      attempt: number;
      /** 最大重试次数 */
      maxAttempts: number;
      reason: string;
    }
  | { type: "turn_finished"; sessionId: SessionId; turnId: TurnId; resultEventIds: EventId[] }
  | { type: "turn_failed"; sessionId: SessionId; turnId: TurnId; error: SessionError };

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
  | "error"
  // ↓ Kairos 自治模式专属生命周期事件（追加在末尾，不允许调换顺序，详见
  // docs/exec-plans/active/kairos_shared_contracts.md §1）↓
  | "kairos_tick_injected"
  | "kairos_sleep_start"
  | "kairos_sleep_end"
  | "kairos_sleep_interrupted";

export type SessionEvent<TPayload = unknown> = {
  id: EventId;
  sessionId: SessionId;
  turnId: TurnId;
  type: SessionEventType;
  timestamp: string;
  schemaVersion?: 1;
  payload: TPayload;
};

export type UserMessagePayload = {
  content: string;
  attachments?: ComposerAttachment[];
  attachmentAnalyses?: AttachmentAnalysis[];
  /** 非用户手动输入的注入消息来源（如 "task_notification"），前端据此换展示样式。 */
  source?: string;
};

export type AssistantMessagePayload = AssistantReply;

export type ThinkingPayload = {
  title?: string;
  content: string;
  durationMs?: number;
  collapsedByDefault?: boolean;
  /**
   * Provider 签名（Anthropic extended thinking）。重放时必须原样带回——
   * anthropic-convert 只在 signature 存在时才把 thinking 块回发给 API。
   */
  signature?: string;
};

export type ToolCallPayload = {
  id: ToolCallId;
  name: string;
  arguments: Record<string, unknown>;
};

export type LlmUsagePayload = {
  callId: string;
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

export type ErrorPayload = SessionError;

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
  id: SessionId;
  title: string;
  updatedAt: string;
  createdAt: string;
  turnCount: number;
  /** 工作区注册表里的稳定 id；旧 session 缺这个字段时按 workspaceRoot 或默认 workspace 兼容。 */
  workspaceId?: string;
  /** 创建会话时的工作区根目录，用于侧边栏按 Workspace 分组；旧 session 缺这个字段时视为 default。 */
  workspaceRoot?: string;
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

export type ToolExecutionError = SessionError;

export type ToolOutputRef = {
  kind: "inline" | "file";
  value: string;
};

export type SubAgentRunStatus = "running" | "completed" | "failed" | "aborted";

export type SubAgentTranscriptRef = {
  kind: "subagent_transcript";
  sessionId: SessionId;
  turnId: TurnId;
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
   * 见 docs/design-docs/agent-explore-subagent.md。
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
  | "directory_list"
  | "edit_diff"
  | "write"
  | "delete"
  | "bash"
  | "agent"
  | "generic";

export type ToolUiPreview =
  | { kind: "read"; filePath: string; range?: string; displayText: string }
  | { kind: "search"; query: string; scope?: string; resultCount?: number; displayText: string }
  | { kind: "grep"; pattern: string; scope?: string; resultCount?: number; displayText: string }
  | { kind: "glob"; pattern: string; scope?: string; resultCount?: number; displayText: string }
  | { kind: "web_search"; mode: "query" | "url"; query?: string; url?: string; displayText: string }
  | { kind: "media_analysis"; mediaName: string; mediaKind: "image" | "video" | "media"; displayText: string }
  | { kind: "directory_list"; path: string; entryCount?: number; displayText: string }
  | {
      kind: "edit_diff";
      filePath: string;
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
      displayText: string;
      status?: "pending" | "running" | "completed" | "failed" | "denied";
      approvalRequestId?: string;
    }
  | BashPreview
  | AgentToolPreview
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
  activeTurnId?: TurnId;
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

export type AgentTurnResult = {
  sessionId: SessionId;
  turnId: TurnId;
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

export type AttachmentAnalysis = {
  attachmentId: string;
  toolName: "analyze_media";
  status: "completed" | "failed";
  summary?: string;
  errorMessage?: string;
  analyzedAt?: string;
};

export type MessageBlock =
  | {
      kind: "user";
      id: EventId;
      content: string;
      createdAt: string;
      attachments?: ComposerAttachment[];
      attachmentAnalyses?: AttachmentAnalysis[];
    }
  | {
      kind: "assistant";
      id: EventId;
      content: string;
      createdAt: string;
      model?: string;
      provider?: string;
    }
  | {
      kind: "thinking";
      id: EventId;
      title: string;
      content: string;
      createdAt: string;
      collapsedByDefault: boolean;
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
  | {
      kind: "tool";
      id: EventId;
      title: string;
      content: string;
      createdAt: string;
      isError?: boolean;
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
    };

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
