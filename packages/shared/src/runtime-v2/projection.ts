import type { RuntimeV2JsonValue } from "./host-dto";

export const RUNTIME_V2_PROJECTION_SCHEMA_VERSION = 1 as const;

/** Stable identifiers for values that can be projected from one Session Journal. */
export type RuntimeV2ProjectionKey =
  | "surface"
  | "run"
  | "composer"
  | "providerUsage"
  | "requestContextEstimate"
  | "trajectory"
  | (string & {});

export type RuntimeV2ProjectionRevision = {
  readonly schemaVersion: typeof RUNTIME_V2_PROJECTION_SCHEMA_VERSION;
  readonly sessionId: string;
  readonly throughJournalSeq: number;
  readonly projectionKey?: RuntimeV2ProjectionKey;
  readonly stateVersion?: number;
  readonly requestId?: string;
  readonly runtimeInstanceId?: string;
};

export type RuntimeV2ProjectionValues = Readonly<Partial<Record<RuntimeV2ProjectionKey, RuntimeV2JsonValue>>>;

export type RuntimeV2SessionProjectionSnapshot = {
  readonly kind: "session-projection";
  readonly schemaVersion: typeof RUNTIME_V2_PROJECTION_SCHEMA_VERSION;
  readonly sessionId: string;
  readonly throughJournalSeq: number;
  readonly values: RuntimeV2ProjectionValues;
};

export type RuntimeV2DesktopSessionProjection = {
  readonly kind: "session-projection";
  readonly schemaVersion: typeof RUNTIME_V2_PROJECTION_SCHEMA_VERSION;
  readonly sessionId: string;
  readonly throughJournalSeq: number;
  readonly snapshot: RuntimeV2SessionSnapshot;
  readonly values: RuntimeV2ProjectionValues;
};

export type RuntimeV2SessionProjectionInput = {
  readonly sessionId: string;
  /** Oldest requested Journal sequence; omitted on the first page. */
  readonly trajectoryFromSeq?: number;
};

/** Unprefixed alias used by the Session Projection package and execution plans. */
export type SessionProjectionSnapshot = RuntimeV2SessionProjectionSnapshot;

export type RuntimeV2ProjectionChange = {
  readonly kind: "projection-change";
  readonly revision: RuntimeV2ProjectionRevision;
  readonly changedKeys: readonly RuntimeV2ProjectionKey[];
  readonly values: RuntimeV2ProjectionValues;
};

export type ProjectionChange = RuntimeV2ProjectionChange;

export type RuntimeV2ProviderUsageProjection = {
  readonly kind: "provider-usage";
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly throughJournalSeq: number;
  readonly estimator: { readonly name: "durable-provider-usage"; readonly version: string };
  readonly usage: RuntimeV2UsageSummary;
};

export type RuntimeV2RequestContextEstimateProjection = {
  readonly kind: "request-context-estimate";
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly throughJournalSeq: number;
  readonly requestId: string | null;
  readonly estimator: { readonly name: "runtime-v2-request-snapshot"; readonly version: string };
  readonly totalEstimatedTokens: number;
  readonly maxTokens: number;
  readonly percentUsed: number;
};

export type RuntimeV2ComposerProjection = {
  readonly kind: "composer";
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly throughJournalSeq: number;
  readonly phase: "blank" | "engaging" | "active";
};

export type RuntimeV2TrajectoryNode = {
  readonly key: string;
  readonly sessionId: string;
  readonly eventSeq: number;
  readonly eventType: string;
  readonly time: string;
  readonly kind: "turn" | "step" | "request" | "user" | "assistant" | "tool" | "approval" | "retry" | "compaction" | "error" | "other";
  readonly state: "started" | "updated" | "completed" | "failed" | "aborted" | "observed";
  readonly callId: string | null;
  readonly data: RuntimeV2JsonValue;
  readonly surface?: RuntimeV2JsonValue;
  readonly source?: RuntimeV2JsonValue;
};

export type RuntimeV2TrajectorySnapshot = {
  readonly kind: "trajectory";
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly throughJournalSeq: number;
  readonly nodes: readonly RuntimeV2TrajectoryNode[];
  readonly history?: {
    readonly fromSeq: number;
    readonly previousFromSeq: number | null;
    readonly turnOffset: number;
    readonly requestOffset?: number;
  };
};

export function isRuntimeV2ProjectionRevision(value: unknown): value is RuntimeV2ProjectionRevision {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.schemaVersion === RUNTIME_V2_PROJECTION_SCHEMA_VERSION
    && typeof candidate.sessionId === "string"
    && candidate.sessionId.length > 0
    && typeof candidate.throughJournalSeq === "number"
    && Number.isSafeInteger(candidate.throughJournalSeq)
    && candidate.throughJournalSeq >= -1
    && (candidate.requestId === undefined || (typeof candidate.requestId === "string" && candidate.requestId.length > 0))
    && (candidate.runtimeInstanceId === undefined || (typeof candidate.runtimeInstanceId === "string" && candidate.runtimeInstanceId.length > 0));
}

export function isRuntimeV2ProjectionKey(value: unknown): value is RuntimeV2ProjectionKey {
  return typeof value === "string" && value.length > 0;
}

export type RuntimeV2ToolProjectionState = "running" | "completed" | "failed" | "denied" | "aborted";
export type RuntimeV2ToolRunningPhase = "validating" | "policy" | "awaiting-approval" | "queued" | "executing" | "finalizing" | "committing";

export type RuntimeV2ToolArgsField = {
  readonly name: string;
  readonly value: string;
  readonly redacted: boolean;
};

export type RuntimeV2ToolArgsSummary = {
  readonly text: string;
  readonly fields: readonly RuntimeV2ToolArgsField[];
};

export type RuntimeV2ToolModelOutputBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "artifact-ref"; readonly artifactId: string; readonly mimeType: string; readonly alt: string };

export type RuntimeV2ToolDetailBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "code"; readonly language: string | null; readonly text: string }
  | { readonly type: "key-value"; readonly items: readonly { readonly label: string; readonly value: string }[] }
  | { readonly type: "list"; readonly items: readonly string[] };

export type RuntimeV2ArtifactRef = {
  readonly artifactId: string;
  readonly kind: "file" | "image" | "diff" | "json" | "archive" | "other";
  readonly label: string;
  readonly mimeType: string;
  readonly sizeBytes: number | null;
  readonly digest: string | null;
  readonly available?: boolean;
};

export type RuntimeV2ToolFailure = {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly outcomeUnknown: boolean;
};

export type RuntimeV2ToolRendererHint = {
  readonly id: string;
  readonly schemaVersion: number;
  readonly props: RuntimeV2JsonValue;
};

export type RuntimeV2ToolView = {
  readonly kind: "tool";
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly turnId: string;
  readonly stepId: string;
  readonly pluginId: string;
  readonly name: string;
  readonly callId: string;
  readonly state: RuntimeV2ToolProjectionState;
  readonly phase: RuntimeV2ToolRunningPhase | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
  readonly argsSummary: RuntimeV2ToolArgsSummary;
  readonly modelOutput: readonly RuntimeV2ToolModelOutputBlock[] | null;
  readonly summary: string;
  readonly detail: readonly RuntimeV2ToolDetailBlock[];
  readonly artifacts: readonly RuntimeV2ArtifactRef[];
  readonly failure: RuntimeV2ToolFailure | null;
  readonly renderer: RuntimeV2ToolRendererHint | null;
};

export type RuntimeV2SessionMessage = {
  readonly kind: "user" | "assistant" | "tool-result";
  readonly messageId: string;
  readonly content: RuntimeV2JsonValue;
  readonly callId?: string;
};

export type RuntimeV2SessionMetadata = {
  readonly title: string | null;
  readonly pinned: boolean;
  readonly archived: boolean;
};

export type RuntimeV2TodoItem = {
  readonly todoId: string;
  readonly revision: number;
  readonly text: string;
  readonly state: "pending" | "in_progress" | "completed" | "cancelled";
  readonly activeForm?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
};

export type RuntimeV2DelegationView = {
  readonly invocationId: string;
  readonly childSessionId: string | null;
  readonly agentKind: "agent" | "explore" | "unknown";
  readonly state: "requested" | "completed";
  readonly summary: string | null;
};

export type RuntimeV2UsageSummary = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly totalTokens: number;
  readonly costUsd: number | null;
};

export type RuntimeV2SessionActivity = {
  readonly turnCount: number;
  readonly completedTurnCount: number;
  readonly stepCount: number;
  readonly activeTurnId: string | null;
  readonly activeStepId: string | null;
  readonly compactionCount: number;
  readonly activeCompactionId: string | null;
  readonly lastCompactionSummary: string | null;
};

export type RuntimeV2SessionSnapshot = {
  readonly kind: "session-snapshot";
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly workspaceRoot: string | null;
  readonly throughJournalSeq: number;
  readonly accessState: "read-write" | "degraded" | "browse-only" | "corrupt";
  readonly metadata: RuntimeV2SessionMetadata;
  readonly messages: readonly RuntimeV2SessionMessage[];
  readonly tools: readonly RuntimeV2ToolView[];
  readonly pendingInbox: readonly { readonly messageId: string; readonly target: "next-step" | "next-turn" }[];
  readonly todos: readonly RuntimeV2TodoItem[];
  readonly delegations: readonly RuntimeV2DelegationView[];
  readonly usage: RuntimeV2UsageSummary;
  readonly activity: RuntimeV2SessionActivity;
  readonly lineage: RuntimeV2JsonValue | null;
};

export type RuntimeV2LiveEvent = {
  readonly kind: "assistant-delta" | "reasoning-delta" | "tool-progress" | "run-state" | "runtime-live" | "resync-required";
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
  readonly phase?: RuntimeV2ToolRunningPhase;
  readonly message?: string | null;
  readonly current?: number | null;
  readonly total?: number | null;
  readonly reason?: "gap" | "overflow" | "runtime-changed";
};

export type RuntimeV2DiagnosticSeverity = "info" | "warning" | "error" | "fatal";
export type RuntimeV2DiagnosticSource = "boot" | "composition" | "cordis" | "session" | "llm" | "tool" | "host" | "projection";

export type RuntimeV2Diagnostic = {
  readonly kind: "runtime-diagnostic";
  readonly schemaVersion: 1;
  readonly runtimeInstanceId: string;
  readonly diagnosticId: string;
  readonly occurredAt: string;
  readonly severity: RuntimeV2DiagnosticSeverity;
  readonly code: string;
  readonly source: RuntimeV2DiagnosticSource;
  readonly message: string;
  readonly pluginId: string | null;
  readonly name: string | null;
  readonly callId: string | null;
  readonly details: Readonly<Record<string, RuntimeV2JsonValue>>;
};

export type RuntimeV2DiagnosticsSnapshot = {
  readonly kind: "runtime-diagnostics";
  readonly schemaVersion: 1;
  readonly runtimeInstanceId: string;
  readonly diagnostics: readonly RuntimeV2Diagnostic[];
};
