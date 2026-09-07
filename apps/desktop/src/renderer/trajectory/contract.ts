import type { RuntimeV2JsonValue, RuntimeV2TrajectoryNode } from "@actspace/shared/runtime-v2";

export type TrajectoryTimelineMode = "sequence" | "duration" | "time" | "actual";
export type TrajectoryRecordKind =
  | "turn" | "step" | "system" | "user" | "request" | "context" | "assistant"
  | "tool" | "approval" | "retry" | "compaction" | "error" | "raw";
export type TrajectoryRecordState = "started" | "running" | "updated" | "completed" | "failed" | "aborted" | "observed";

/** A prompt/tool snapshot used by an explicit SYSTEM prompt boundary. */
export type TrajectoryPromptDetail = {
  readonly systemPrompt?: string | null;
  readonly systemPromptParts?: RuntimeV2JsonValue;
  readonly tools?: RuntimeV2JsonValue;
  readonly config?: RuntimeV2JsonValue;
  readonly raw?: RuntimeV2JsonValue;
};

export type TrajectorySystemChangeKind = "initial" | "updated" | "tools-updated" | "prompt-updated" | "unknown";

/** A source block kept in the same order as the provider/model payload. */
export type TrajectorySourceBlock = {
  readonly type: string;
  readonly content: string;
  readonly callId?: string;
  readonly toolName?: string;
  readonly raw?: RuntimeV2JsonValue;
};

/** Timing facts needed to render DSH's assistant timing summary. */
export type TrajectoryAssistantMetrics = {
  readonly timingRecorded: boolean;
  readonly stepStartAt: string | null;
  readonly firstTokenAt: string | null;
  readonly completedAt: string | null;
  readonly stepStartTime: number | null;
  readonly firstTokenTime: number | null;
  readonly completedTime: number | null;
  readonly ttftMs: number | null;
  readonly generationMs: number | null;
  readonly throughputTokensPerSecond: number | null;
  readonly usageProvided: boolean;
  readonly outputTokens: number | null;
};

/** Request facts attached to a visible record while the request events stay raw-only. */
export type TrajectoryRequestDetail = {
  readonly requestId: string | null;
  /** Request purpose from the runtime, when supplied by the projector. */
  readonly purpose?: "assistant" | "compaction" | "unknown";
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly header: RuntimeV2JsonValue | null;
  readonly context: RuntimeV2JsonValue | null;
  readonly options: RuntimeV2JsonValue | null;
  readonly prompt?: TrajectoryPromptDetail | null;
  readonly sourceSequences: readonly number[];
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly status?: TrajectoryRecordState;
  readonly usage?: TrajectoryUsage | null;
};

export type TrajectoryUsage = {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
};

export type TrajectoryTimeRange = { readonly start: number; readonly end: number };

export type TrajectoryRecord = {
  readonly id: string;
  readonly kind: TrajectoryRecordKind;
  readonly state: TrajectoryRecordState;
  readonly eventType: string;
  readonly turnId: string | null;
  readonly turnNumber: number | null;
  readonly stepId: string | null;
  readonly stepNumber: number | null;
  readonly callId: string | null;
  readonly requestId: string | null;
  readonly messageId: string | null;
  readonly summary: string;
  readonly preview: string;
  readonly raw: RuntimeV2JsonValue;
  readonly sourceSequences: readonly number[];
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
  readonly usage: TrajectoryUsage | null;
  readonly result: string | null;
  readonly isError: boolean;
  readonly partial: boolean;
  /** True when this record is eligible for the main semantic ledger. */
  readonly visible?: boolean;
  /** DSH request-only separator; retained for raw/detail navigation, never a normal content row. */
  readonly requestOnly?: boolean;
  readonly systemChange?: TrajectorySystemChangeKind;
  readonly promptDetail?: TrajectoryPromptDetail | null;
  readonly previousPromptDetail?: TrajectoryPromptDetail | null;
  readonly inputDetail?: RuntimeV2JsonValue | null;
  readonly outputDetail?: RuntimeV2JsonValue | null;
  readonly thinkingDetail?: string | null;
  readonly sourceBlocks?: readonly TrajectorySourceBlock[];
  readonly outputBlocks?: readonly TrajectorySourceBlock[];
  readonly schemaDetail?: RuntimeV2JsonValue | null;
  readonly hierarchy?: string | null;
  readonly timingSource?: string | null;
  readonly assistantMetrics?: TrajectoryAssistantMetrics | null;
  readonly requestDetail?: TrajectoryRequestDetail | null;
  readonly requestOptions?: RuntimeV2JsonValue | null;
  readonly requestContext?: RuntimeV2JsonValue | null;
  readonly resultRaw?: RuntimeV2JsonValue | null;
  readonly toolName?: string | null;
  readonly toolArguments?: RuntimeV2JsonValue | null;
  /** Provider/model identity copied from request facts when available. */
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly finishReason?: string | null;
  readonly error?: string | null;
  /** Original message source/provenance, when the event carries one. */
  readonly messageSource?: RuntimeV2JsonValue | null;
  /** Parent call identity for nested tool dispatch records. */
  readonly parentCallId?: string | null;
  /** Resolved owner from explicit message/call identity, never row proximity. */
  readonly assistantRecordId?: string | null;
};

export type TrajectoryStep = {
  readonly id: string;
  readonly number: number;
  readonly records: readonly TrajectoryRecord[];
  readonly state: TrajectoryRecordState;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
  readonly durationMs?: number | null;
};

export type TrajectoryTurn = {
  readonly id: string;
  readonly number: number;
  readonly records: readonly TrajectoryRecord[];
  readonly steps: readonly TrajectoryStep[];
  readonly state: TrajectoryRecordState;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
  readonly rawRecords?: readonly TrajectoryRecord[];
  readonly stepCount?: number;
  readonly toolCallCount?: number;
};

export type TrajectoryTimelineSpan = TrajectoryTimeRange & {
  readonly recordId: string;
  readonly recordIndex: number;
  readonly lane: 0 | 1 | 2;
  readonly kind: TrajectoryRecordKind;
  readonly state: TrajectoryRecordState;
};

export type TrajectoryTimeline = TrajectoryTimeRange & {
  readonly mode: TrajectoryTimelineMode;
  readonly spans: readonly TrajectoryTimelineSpan[];
  readonly turnBoundaries: readonly { readonly turnNumber: number; readonly time: number }[];
};

export type TrajectoryVirtualRow = {
  readonly key: string;
  readonly entries: readonly { readonly logicalIndex: number; readonly record: TrajectoryRecord }[];
  readonly height: number;
  readonly rowType?: "record" | "turn-summary" | "call-summary";
  readonly summary?: string;
  /** All calls represented by a synthetic call-summary row. */
  readonly relatedCallIds?: readonly string[];
  /** All turns represented by a synthetic turn-summary row. */
  readonly relatedTurnIds?: readonly string[];
};

export type TrajectoryDetail = {
  readonly record: TrajectoryRecord;
  readonly sourceNodes: readonly RuntimeV2TrajectoryNode[];
  readonly sections: readonly { readonly key: string; readonly value: RuntimeV2JsonValue }[];
};

export type TrajectoryRuntimeSnapshot = {
  readonly requestOffset?: number;
  readonly sessionId: string;
  readonly throughJournalSeq: number;
  readonly nodes: readonly RuntimeV2TrajectoryNode[];
  readonly records: readonly TrajectoryRecord[];
  /** All event-level records, including metadata hidden from the semantic ledger. */
  readonly rawRecords?: readonly TrajectoryRecord[];
  readonly turns: readonly TrajectoryTurn[];
  readonly timeline: TrajectoryTimeline | null;
  readonly searchIndex: ReadonlyMap<string, string>;
  readonly virtualRows: readonly TrajectoryVirtualRow[];
  readonly partial: TrajectoryRecord | null;
};
