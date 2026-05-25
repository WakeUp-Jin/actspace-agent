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

export type RuntimeStreamEvent =
  | { type: "turn_started"; sessionId: SessionId; turnId: TurnId }
  | { type: "assistant_text_delta"; messageId: EventId; delta: string }
  | { type: "assistant_thinking_delta"; messageId: EventId; delta: string }
  | { type: "tool_started"; toolCallId: ToolCallId; toolName: string; argsPreview: string }
  | { type: "tool_finished"; toolCallId: ToolCallId; toolName: string; resultEventId: EventId; isError: boolean }
  | { type: "turn_finished"; sessionId: SessionId; turnId: TurnId; resultEventIds: EventId[] }
  | { type: "turn_failed"; sessionId: SessionId; turnId: TurnId; error: SessionError };

export type SessionEventType =
  | "user_message"
  | "assistant_message"
  | "assistant_reply"
  | "thinking"
  | "tool_call"
  | "tool_result"
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
  | "directory_list"
  | "edit_diff"
  | "bash"
  | "generic";

export type ToolUiPreview =
  | { kind: "read"; filePath: string; range?: string; displayText: string }
  | { kind: "search"; query: string; scope?: string; resultCount?: number; displayText: string }
  | { kind: "directory_list"; path: string; entryCount?: number; displayText: string }
  | {
      kind: "edit_diff";
      filePath: string;
      additions: number;
      deletions: number;
      diff: string;
      collapsedLines: number;
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
  buckets: ContextUsageBucket[];
};

export type AssistantReply = {
  content: string;
  stopReason: "stop" | "toolUse" | "length" | "error" | "aborted";
  model: string;
  provider: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

export type AgentTurnResult = {
  sessionId: SessionId;
  turnId: TurnId;
  events: SessionEvent[];
  finalReply?: AssistantReply;
  contextSnapshot: ContextUsageSnapshot;
  status: "completed" | "failed";
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
    }
  | {
      kind: "search";
      id: EventId;
      query: string;
      scope?: string;
      resultCount?: number;
      displayText: string;
      createdAt: string;
    }
  | {
      kind: "directory_list";
      id: EventId;
      path: string;
      entryCount?: number;
      displayText: string;
      createdAt: string;
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
