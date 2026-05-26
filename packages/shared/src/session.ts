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
  | { type: "tool_finished"; toolCallId: ToolCallId; toolName: string; resultEventId: EventId; isError: boolean }
  | { type: "tool_approval_required"; toolCallId: ToolCallId; toolName: string; requestId: string; summary: string; reason: string; command?: string; riskLevel?: string }
  | { type: "tool_approval_resolved"; toolCallId: ToolCallId; requestId: string; decision: string }
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
  | "error";

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
};

export type AssistantMessagePayload = AssistantReply;

export type ThinkingPayload = {
  title?: string;
  content: string;
  durationMs?: number;
  collapsedByDefault?: boolean;
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
  cost: LlmUsageCost;
  relatedEventIds?: EventId[];
};

export type ContextSnapshotPayload = ContextUsageSnapshot;

export type ErrorPayload = SessionError;

export type SessionMeta = {
  id: SessionId;
  title: string;
  updatedAt: string;
  createdAt: string;
  turnCount: number;
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

export type ToolPreviewKind =
  | "read"
  | "search"
  | "grep"
  | "glob"
  | "web_search"
  | "directory_list"
  | "edit_diff"
  | "write"
  | "bash"
  | "generic";

export type ToolUiPreview =
  | { kind: "read"; filePath: string; range?: string; displayText: string }
  | { kind: "search"; query: string; scope?: string; resultCount?: number; displayText: string }
  | { kind: "grep"; pattern: string; scope?: string; resultCount?: number; displayText: string }
  | { kind: "glob"; pattern: string; scope?: string; resultCount?: number; displayText: string }
  | { kind: "web_search"; mode: "query" | "url"; query?: string; url?: string; displayText: string }
  | { kind: "directory_list"; path: string; entryCount?: number; displayText: string }
  | {
      kind: "edit_diff";
      filePath: string;
      additions: number;
      deletions: number;
      diff: string;
      collapsedLines: number;
    }
  | {
      kind: "write";
      filePath: string;
      additions: number;
      deletions: number;
      diff: string;
      collapsedLines: number;
      /** running 阶段从 LLM 流式 args.content 提取的部分内容；completed 阶段不使用 */
      streamingContent?: string;
    }
  | BashPreview
  | { kind: "generic"; title: string; content: string };

export type BashStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "denied"
  | "expired"
  | "cancelled";

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

export type ContextUsageBucketName =
  | "systemPrompt"
  | "tools"
  | "rules"
  | "skills"
  | "mcp"
  | "subagents"
  | "conversation";

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
    | "mcp"
    | "subagentDefinitions"
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
    cost?: LlmUsageCost;
  };
};

export type AgentTurnResult = {
  sessionId: SessionId;
  turnId: TurnId;
  events: SessionEvent[];
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

export type MessageBlock =
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
      status?: "running" | "completed";
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
      status?: "running" | "completed";
      /** running 阶段从 LLM 流式 args.content 提取的部分内容；completed 不使用 */
      streamingContent?: string;
    }
  | ({
      kind: "bash";
      id: EventId;
      createdAt: string;
    } & BashPreview)
  | {
      kind: "tool";
      id: EventId;
      title: string;
      content: string;
      createdAt: string;
      isError?: boolean;
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
