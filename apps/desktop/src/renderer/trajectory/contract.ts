import type { RuntimeV2JsonValue, RuntimeV2TrajectoryNode } from "@actspace/shared/runtime-v2";

export type TrajectoryTimelineMode = "sequence" | "duration" | "time" | "actual";
export type TrajectoryRecordKind =
  | "turn" | "step" | "system" | "user" | "request" | "context" | "assistant"
  | "tool" | "approval" | "retry" | "compaction" | "error" | "raw";
export type TrajectoryRecordState = "started" | "running" | "updated" | "completed" | "failed" | "aborted" | "observed";

/** A prompt/tool snapshot used by an explicit SYSTEM prompt boundary. */
export type TrajectoryPromptDetail = {
  readonly systemPrompt?: string | null;
  readonly contextSections?: RuntimeV2JsonValue;
  readonly contextModelFacts?: RuntimeV2JsonValue;
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
  readonly contextPresentation?: { readonly category: string; readonly title: string; readonly action: string; readonly placement: string; readonly previousText?: string };
  /** Resolved owner from explicit message/call identity, never row proximity. */
  readonly assistantRecordId?: string | null;
  /** Compaction facts merged from `compaction/start` and `compaction/end`; fields are null in journals that predate them. */
  readonly compaction?: TrajectoryCompactionFacts;
};

export type TrajectoryCompactionFacts = {
  readonly compactionId: string | null;
  readonly trigger: "manual" | "auto" | null;
  /** Surface entries replaced by the summary (`end − start` on `compaction/start`). */
  readonly messageCount: number | null;
  readonly beforeTokens: number | null;
  readonly afterTokens: number | null;
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

/** DSH display kinds. Builder records map onto them in layout.ts. */
export type TrajectoryCellKind = "system" | "user" | "context" | "compacted" | "message" | "tool" | "subtool";
export type TrajectoryApproval = "pending" | "allowed" | "denied";
/** DSH status: 已完成 / 等待中 / 失败. */
export type TrajectoryStatus = "completed" | "running" | "failed";

/** One ledger record in layout order; `index` is 1-based and stable for a given snapshot. */
export type TrajectoryCell = {
  readonly index: number;
  readonly recordId: string;
  readonly record: TrajectoryRecord;
  readonly kind: TrajectoryCellKind;
  readonly turn: number | null;
  /** Group key inside the turn: the step, or a message group for inputs. */
  readonly group: string;
  /** Request view key (`turnId\u0000stepId` or `compaction:<recordId>`), when the record belongs to one. */
  readonly requestKey: string | null;
  /** A request that has started but has produced no visible record yet. */
  readonly requestOnly: boolean;
  readonly startedAt: number | null;
  readonly durationMs: number | null;
  readonly isError: boolean;
  readonly approval: TrajectoryApproval | null;
};

export type TrajectoryGroup = { readonly key: string; readonly title: string; readonly cells: readonly TrajectoryCell[] };
export type TrajectoryLayoutTurn = { readonly section: number; readonly turn: number | null; readonly groups: readonly TrajectoryGroup[] };

/** One model request, numbered in session order. Retries of the same step fold into it. */
export type TrajectoryRequestView = {
  readonly key: string;
  readonly number: number;
  readonly purpose: "assistant" | "compaction" | "image-inspection" | "session-title" | "auto-review";
  readonly status: TrajectoryStatus;
  readonly turn: number | null;
  readonly group: string;
  readonly provider: string | null;
  readonly model: string | null;
  readonly options: RuntimeV2JsonValue | null;
  readonly usage: TrajectoryUsage | null;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
  readonly error: string | null;
  readonly lastAttemptError: string | null;
  readonly retries: number;
  readonly retryDelayMs: number | null;
  /** Assistant message or compaction record produced by this request. */
  readonly resultRecordId: string | null;
  /** Auxiliary attempts link to their owning tool without inventing an assistant result. */
  readonly parentRecordId?: string | null;
  readonly attempt?: number;
  readonly terminalStatus?: "completed" | "failed" | "aborted";
  readonly toolCalls: number;
  readonly subtoolCalls: number;
};

export type TrajectoryLayout = {
  readonly turns: readonly TrajectoryLayoutTurn[];
  readonly cells: readonly TrajectoryCell[];
  readonly requests: ReadonlyMap<string, TrajectoryRequestView>;
};

/** One table row after flattening, searching and folding. */
export type TrajectoryTableRow = {
  readonly key: string;
  readonly cell: TrajectoryCell;
  readonly section: number;
  readonly groupStart: boolean;
  readonly turnStart: boolean;
  readonly turnEnd: boolean;
  readonly collapsed?: { readonly kind: "turn" | "assistant"; readonly summary: string };
};

export type TrajectoryTimelineSpan = TrajectoryTimeRange & {
  readonly index: number;
  readonly recordId: string;
  readonly kind: TrajectoryCellKind;
  readonly lane: 0 | 1 | 2;
  readonly isError: boolean;
  /** Real start (epoch ms) and duration, independent of the projected mode coordinates. */
  readonly startedAt: number | null;
  readonly durationMs: number | null;
  /** Assistant first-token latency and decoding time; both null unless timing was recorded. */
  readonly ttftMs: number | null;
  readonly decodingMs: number | null;
};

export type TrajectoryTimeline = TrajectoryTimeRange & {
  readonly spans: readonly TrajectoryTimelineSpan[];
  readonly turnBoundaries: readonly { readonly turn: number; readonly time: number }[];
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
  readonly partial: TrajectoryRecord | null;
};
