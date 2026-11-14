import type { RuntimeJsonValue } from "./host-dto";
import type { PermissionMode, SessionGrant } from "./permission";

export const RUNTIME_PROJECTION_SCHEMA_VERSION = 1 as const;

/** Stable identifiers for values that can be projected from one Session Journal. */
export type RuntimeProjectionKey =
  | "surface"
  | "metadata"
  | "todos"
  | "sessionStats"
  | "delegations"
  | "pendingInbox"
  | "providerUsage"
  | "contextEstimate"
  | (string & {});

export type RuntimeProjectionRevision = {
  readonly schemaVersion: typeof RUNTIME_PROJECTION_SCHEMA_VERSION;
  readonly sessionId: string;
  readonly throughJournalSeq: number;
  readonly projectionKey?: RuntimeProjectionKey;
  readonly stateVersion?: number;
  readonly requestId?: string;
  readonly runtimeInstanceId?: string;
};

export type RuntimeReadModelWatermarks = {
  readonly acceptedThroughSeq: number;
  readonly durableThroughSeq: number | null;
  readonly projectionThroughSeq: number;
  readonly windowThroughSeq: number;
  readonly indexGeneration: number | null;
};

export type RuntimeGlobalSessionSummary = {
  readonly sessionId: string;
  readonly throughJournalSeq: number;
  readonly summaryVersion: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly workspaceRoot: string | null; readonly worktree?: import("../session").SessionWorktreeContext;
  readonly profileId: string;
  readonly agentForm: import("./runtime").MainAgentForm;
  readonly agentFormId?: import("./runtime").AgentFormId;
  readonly agentMode?: import("./runtime").RuntimeAgentMode;
  readonly agentModeRevision?: number;
  readonly title: string | null;
  readonly pinned: boolean;
  readonly archived: boolean;
  readonly completedTurnCount: number;
  readonly usage: RuntimeUsageSummary;
  readonly accessState: RuntimeSessionSnapshot["accessState"];
  readonly lineage: RuntimeJsonValue | null;
};

export type RuntimeProjectionValues = Readonly<Partial<Record<RuntimeProjectionKey, RuntimeJsonValue>>>;

export type RuntimeSessionProjectionSnapshot = {
  readonly kind: "session-projection";
  readonly schemaVersion: typeof RUNTIME_PROJECTION_SCHEMA_VERSION;
  readonly sessionId: string;
  readonly throughJournalSeq: number;
  readonly values: RuntimeProjectionValues;
};

export type RuntimeDesktopSessionProjection = {
  readonly kind: "session-projection";
  readonly schemaVersion: typeof RUNTIME_PROJECTION_SCHEMA_VERSION;
  readonly sessionId: string;
  readonly throughJournalSeq: number;
  readonly snapshot: RuntimeSessionSnapshot;
  readonly values: RuntimeProjectionValues;
  readonly window: RuntimeEventWindow;
  readonly activeMessageIds: readonly string[];
  readonly deferredToolCalls: readonly string[];
  readonly watermarks?: RuntimeReadModelWatermarks;
};

export type RuntimeEventWindow = {
  readonly events: readonly import("./session-events").SessionEventEnvelopeV1[];
  readonly fromSeq: number;
  readonly throughJournalSeq: number;
  readonly beforeSeq: number | null;
  readonly turnOffset: number;
  readonly requestOffset: number;
  readonly support?: readonly RuntimeWindowSupportFact[];
  readonly deferredDetails?: readonly RuntimeDeferredDetailRef[];
};

export type RuntimeDeferredDetailRef = {
  readonly sessionId: string;
  readonly callId?: string;
  readonly artifactId?: string;
  readonly kind: "tool" | "artifact";
};

export type RuntimeWindowSupportFact =
  | { readonly kind: "surface"; readonly replaceGeneration: number }
  | { readonly kind: "tool-call"; readonly callId: string; readonly eventSeqs: readonly number[] }
  | { readonly kind: "request"; readonly requestId: string; readonly eventSeqs: readonly number[] };

export type RuntimeSessionObservation = {
  readonly kind: "session-observation";
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly projection: RuntimeSessionProjectionSnapshot;
  readonly snapshot: RuntimeSessionSnapshot;
  readonly window?: RuntimeEventWindow;
  readonly activeMessageIds: readonly string[];
  readonly deferredToolCalls: readonly string[];
  readonly watermarks: RuntimeReadModelWatermarks;
};

export type RuntimeSessionUpdate = {
  readonly sessionId: string;
  readonly throughJournalSeq: number;
  readonly event: import("./session-events").SessionEventEnvelopeV1;
  readonly values: RuntimeProjectionValues;
  readonly tool?: RuntimeToolView;
};

export type RuntimeSessionProjectionInput = {
  readonly sessionId: string;
  readonly beforeSeq?: number;
  readonly afterSeq?: number;
  readonly includeToolDetails?: boolean;
  readonly maxWindowEvents?: number;
  readonly maxWindowBytes?: number;
};

/** Unprefixed alias used by the Session Projection package and execution plans. */
export type SessionProjectionSnapshot = RuntimeSessionProjectionSnapshot;

export type RuntimeProjectionChange = {
  readonly kind: "projection-change";
  readonly revision: RuntimeProjectionRevision;
  readonly changedKeys: readonly RuntimeProjectionKey[];
  readonly values: RuntimeProjectionValues;
};

export type ProjectionChange = RuntimeProjectionChange;

export type RuntimeProviderUsageProjection = {
  readonly kind: "provider-usage";
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly throughJournalSeq: number;
  readonly estimator: { readonly name: "durable-provider-usage"; readonly version: string };
  readonly usage: RuntimeUsageSummary;
};

/** 客户端从 `contextEstimate` 投影派生的上下文估算；三种形状给不同界面用，数字同源。 */
export type RuntimeRequestContextEstimateProjection = {
  readonly kind: "request-context-estimate";
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly throughJournalSeq: number;
  readonly estimate: import("../context-estimate").ContextEstimateView;
  readonly contextState: import("../session").ContextState;
  readonly usage: import("../session").ContextUsageSnapshot;
};

export type RuntimeComposerProjection = {
  readonly kind: "composer";
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly throughJournalSeq: number;
  readonly phase: "blank" | "engaging" | "active";
};

export type RuntimeTrajectoryNode = {
  readonly key: string;
  readonly sessionId: string;
  readonly eventSeq: number;
  readonly eventType: string;
  readonly time: string;
  readonly kind: "turn" | "step" | "request" | "user" | "assistant" | "tool" | "approval" | "retry" | "compaction" | "error" | "other";
  readonly state: "started" | "updated" | "completed" | "failed" | "aborted" | "observed";
  readonly callId: string | null;
  readonly data: RuntimeJsonValue;
  readonly surface?: RuntimeJsonValue;
  readonly source?: RuntimeJsonValue;
};

export type RuntimeTrajectorySnapshot = {
  readonly kind: "trajectory";
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly throughJournalSeq: number;
  readonly nodes: readonly RuntimeTrajectoryNode[];
  readonly history?: {
    readonly fromSeq: number;
    readonly previousFromSeq: number | null;
    readonly turnOffset: number;
    readonly requestOffset?: number;
  };
};

export function isRuntimeProjectionRevision(value: unknown): value is RuntimeProjectionRevision {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.schemaVersion === RUNTIME_PROJECTION_SCHEMA_VERSION
    && typeof candidate.sessionId === "string"
    && candidate.sessionId.length > 0
    && typeof candidate.throughJournalSeq === "number"
    && Number.isSafeInteger(candidate.throughJournalSeq)
    && candidate.throughJournalSeq >= -1
    && (candidate.requestId === undefined || (typeof candidate.requestId === "string" && candidate.requestId.length > 0))
    && (candidate.runtimeInstanceId === undefined || (typeof candidate.runtimeInstanceId === "string" && candidate.runtimeInstanceId.length > 0));
}

export function isRuntimeProjectionKey(value: unknown): value is RuntimeProjectionKey {
  return typeof value === "string" && value.length > 0;
}

export type RuntimeToolProjectionState = "running" | "completed" | "failed" | "denied" | "aborted";
export type RuntimeToolRunningPhase = "validating" | "policy" | "awaiting-approval" | "queued" | "executing" | "finalizing" | "committing";

export type RuntimeToolArgsField = {
  readonly name: string;
  readonly value: string;
  readonly redacted: boolean;
};

export type RuntimeToolArgsSummary = {
  readonly text: string;
  readonly fields: readonly RuntimeToolArgsField[];
};

export type RuntimeToolModelOutputBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "artifact-ref"; readonly artifactId: string; readonly mimeType: string; readonly alt: string };

export type RuntimeToolDetailBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "code"; readonly language: string | null; readonly text: string }
  | { readonly type: "key-value"; readonly items: readonly { readonly label: string; readonly value: string }[] }
  | { readonly type: "list"; readonly items: readonly string[] };

export type RuntimeArtifactRef = {
  readonly artifactId: string;
  readonly kind: "file" | "image" | "diff" | "json" | "archive" | "other";
  readonly label: string;
  readonly mimeType: string;
  readonly sizeBytes: number | null;
  readonly digest: string | null;
  readonly available?: boolean;
};

export type RuntimeToolFailure = {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly outcomeUnknown: boolean;
};

export type RuntimeToolRendererHint = {
  readonly id: string;
  readonly schemaVersion: number;
  readonly props: RuntimeJsonValue;
};

export type RuntimeToolView = {
  readonly approvalMode?: "auto" | "manual" | "session";
  readonly approvalReason?: string | null;
  readonly kind: "tool";
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly turnId: string;
  readonly stepId: string;
  readonly pluginId: string;
  readonly name: string;
  readonly callId: string;
  readonly state: RuntimeToolProjectionState;
  readonly phase: RuntimeToolRunningPhase | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
  readonly argsSummary: RuntimeToolArgsSummary;
  readonly modelOutput: readonly RuntimeToolModelOutputBlock[] | null;
  readonly summary: string;
  readonly detail: readonly RuntimeToolDetailBlock[];
  readonly artifacts: readonly RuntimeArtifactRef[];
  readonly failure: RuntimeToolFailure | null;
  readonly renderer: RuntimeToolRendererHint | null;
};

export type RuntimeSessionMessage = {
  readonly kind: "user" | "assistant" | "tool-result";
  readonly messageId: string;
  readonly content: RuntimeJsonValue;
  readonly callId?: string;
};

export type RuntimeSessionMetadata = {
  readonly title: string | null;
  readonly pinned: boolean;
  readonly archived: boolean;
};

export type RuntimeTodoItem = {
  readonly todoId: string;
  readonly revision: number;
  readonly text: string;
  readonly state: "pending" | "in_progress" | "completed" | "cancelled";
  readonly activeForm?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
};

/** Old Sessions only (`delegation/*`). New subagents are folded from `subagent/*` by `foldSubagentTree` (subagent-projection.ts). */
export type RuntimeDelegationView = {
  readonly invocationId: string;
  readonly childSessionId: string | null;
  readonly agentKind: "agent" | "explore" | "unknown";
  readonly state: "requested" | "completed";
  readonly summary: string | null;
};

export type RuntimeUsageSummary = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly totalTokens: number;
  readonly costUsd: number | null;
};

export type RuntimeSessionActivity = {
  readonly turnCount: number;
  readonly completedTurnCount: number;
  readonly stepCount: number;
  readonly activeTurnId: string | null;
  readonly activeStepId: string | null;
  readonly compactionCount: number;
  readonly activeCompactionId: string | null;
  readonly lastCompactionSummary: string | null;
  readonly timing: RuntimeSessionTiming;
};

/**
 * 全会话的模型侧计时，宿主扫全量 journal（含流式 chunk）累加；口径对应 DSH 的 `assistantMetrics()`。
 * 模型用时 = 请求开始 → assistant/message；TTFT = 首个非空 chunk − 请求开始；
 * 解码时间 = 首个 token → 完成，和同一批请求的输出 token 一起算 TPS。
 */
export type RuntimeSessionTiming = {
  readonly llmMs: number;
  readonly ttftMs: number;
  /** 带 TTFT 记录的请求数。 */
  readonly ttftSteps: number;
  readonly decodeMs: number;
  /** 与 decodeMs 同一批请求的输出 token 之和。 */
  readonly decodeTokens: number;
};

export type RuntimeSessionSnapshot = {
  readonly kind: "session-snapshot";
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly workspaceRoot: string | null; readonly worktree?: import("../session").SessionWorktreeContext;
  readonly agentForm: import("./runtime").MainAgentForm;
  readonly agentFormId?: import("./runtime").AgentFormId;
  readonly agentMode?: import("./runtime").RuntimeAgentMode;
  readonly agentModeRevision?: number;
  readonly permissionMode: PermissionMode;
  readonly sessionGrants: readonly SessionGrant[];
  readonly throughJournalSeq: number;
  readonly accessState: "read-write" | "degraded" | "browse-only" | "corrupt";
  readonly metadata: RuntimeSessionMetadata;
  readonly messages: readonly RuntimeSessionMessage[];
  readonly tools: readonly RuntimeToolView[];
  readonly pendingInbox: readonly { readonly messageId: string; readonly target: "next-step" | "next-turn"; readonly source?: import("./subagents").InboxSourceId }[];
  readonly todos: readonly RuntimeTodoItem[];
  readonly delegations: readonly RuntimeDelegationView[];
  readonly usage: RuntimeUsageSummary;
  readonly activity: RuntimeSessionActivity;
  readonly lineage: RuntimeJsonValue | null;
};

export type RuntimeLiveEvent = {
  readonly kind: "assistant-delta" | "reasoning-delta" | "tool-progress" | "run-state" | "runtime-live" | "resync-required" | "journal-update";
  readonly update?: RuntimeSessionUpdate;
  readonly schemaVersion: 1;
  readonly runtimeInstanceId: string;
  readonly liveSeq: number;
  readonly throughJournalSeq: number;
  readonly sessionId: string;
  readonly pluginId?: string;
  readonly name?: string;
  readonly callId?: string;
  readonly agentRunId?: string;
  readonly turnId?: string;
  readonly stepId?: string;
  readonly phase?: RuntimeToolRunningPhase;
  readonly message?: string | null;
  readonly current?: number | null;
  readonly total?: number | null;
  readonly reason?: "gap" | "overflow" | "runtime-changed";
};

export type RuntimeDiagnosticSeverity = "info" | "warning" | "error" | "fatal";
export type RuntimeDiagnosticSource = "boot" | "composition" | "cordis" | "session" | "llm" | "tool" | "host" | "projection";

export type RuntimeDiagnostic = {
  readonly kind: "runtime-diagnostic";
  readonly schemaVersion: 1;
  readonly runtimeInstanceId: string;
  readonly diagnosticId: string;
  readonly occurredAt: string;
  readonly severity: RuntimeDiagnosticSeverity;
  readonly code: string;
  readonly source: RuntimeDiagnosticSource;
  readonly message: string;
  readonly pluginId: string | null;
  readonly name: string | null;
  readonly callId: string | null;
  readonly details: Readonly<Record<string, RuntimeJsonValue>>;
};

export type RuntimeDiagnosticsSnapshot = {
  readonly kind: "runtime-diagnostics";
  readonly schemaVersion: 1;
  readonly runtimeInstanceId: string;
  readonly diagnostics: readonly RuntimeDiagnostic[];
};
