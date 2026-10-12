import type { ContextUsageBucketName } from "./context-buckets";

/**
 * 右侧栏 Context 面板的读取形状（`sessions.describeContextPanel`）。
 *
 * 字段含义、key 规则和估算口径以 `docs/design-docs/frontend/front-Context面板后端数据需求.md` 为准；
 * 当前与历史拥有独立版本；相同令牌的条件读取不重复发送条目。
 */
export type DescribeContextPanelInput = {
  sessionId: string;
  versionToken?: string;
  consumerId?: string;
  release?: boolean;
  retry?: boolean;
};

/** 分类 key 与 `CONTEXT_BUCKET_REGISTRY` 一致。 */
export type ContextPanelBucketKey = ContextUsageBucketName;
/** 未知或新增分类由前端按 registry 兜底，不会崩。 */
export type ContextPanelBucketTokens = Partial<Record<ContextPanelBucketKey, number>>;

export type ContextPanelConversationKind = "user" | "assistant" | "thinking" | "tool-call" | "tool-result";

export type ContextPanelView = {
  schemaVersion: 2;
  sessionId: string;
  logicalAgentScopeId: string;
  contextRevision: number;
  /** 前端按它丢弃乱序的旧结果、决定是否重新拉取。 */
  throughJournalSeq: number;
  model: ContextPanelModel | null;
  current: ContextPanelCurrent;
  versionToken?: string;
  currentVersion?: string;
  history?: ContextPanelHistory;
  entriesPage?: { revision?: string; total: number; nextCursor?: string; truncated: boolean };
  limits?: { trend: ContextPanelTruncation; events: ContextPanelTruncation };
  /** 对比基准：最近已持久化的请求输入；还没发过请求时为 null。 */
  previous: ContextPanelManifest | null;
  stats: ContextPanelStats | null;
  /** 按时间升序。 */
  trend: ContextPanelTrendPoint[];
  /** 按时间降序。 */
  events: ContextPanelEvent[];
};

export type ContextPanelModel = {
  modelKey: string;
  label: string;
  /** 未知时为 null，不回退到常数。 */
  contextWindow: number | null;
  /** 未启用自动压缩时为 null。 */
  autoCompactAtTokens: number | null;
};

export type ContextPanelCurrent = {
  basis?: "current-context" | "last-request" | "unavailable";
  totalEstimatedTokens: number;
  buckets: ContextPanelBucketTokens;
  entries: ContextPanelEntry[];
  status: "ready" | "stale" | "recovering" | "unavailable";
};

export type ContextPanelEntry = {
  /** 稳定身份：只由内容来源决定，用于和 previous 对比。 */
  key: string;
  bucket: ContextPanelBucketKey;
  title: string;
  estimatedTokens: number;
  /** 仅 conversation 分类。 */
  kind?: ContextPanelConversationKind;
  source?: string;
  /** 截断预览；conversation 分类不返回。 */
  preview?: string;
  fullTextAvailable?: boolean;
  /** 仅 conversation 分类：定位轨迹记录。 */
  trajectoryRef?: { messageId?: string; callId?: string };
};

export type ContextPanelManifest = {
  comparable?: boolean;
  comparisonUnavailableReason?: string;
  estimatorVersion?: string;
  requestId: string;
  turnIndex: number;
  stepIndex: number;
  sentAt: string;
  totalEstimatedTokens: number;
  buckets: ContextPanelBucketTokens;
  entries: (Pick<ContextPanelEntry, "key" | "bucket" | "estimatedTokens"> & Partial<Pick<ContextPanelEntry, "title" | "kind" | "trajectoryRef">>)[];
};

export type ContextPanelUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type ContextPanelStats = {
  turnCount: number;
  stepCount: number;
  compactionCount: number;
  cumulativeUsage: ContextPanelUsage | null;
  /** 为 null 时前端隐藏费用格，不自行估算。 */
  costUsd: number | null;
};

export type ContextPanelTrendPoint = {
  requestId: string;
  turnIndex: number;
  stepIndex: number;
  sentAt: string;
  estimatedTokens: number;
  buckets: ContextPanelBucketTokens;
  actual?: ContextPanelUsage;
  /** 这次请求之前刚发生过压缩。 */
  compactedBefore?: { compactionId: string; reclaimedTokens: number | null };
};

export type ContextPanelEvent = {
  inferred?: boolean;
  id: string;
  kind: "inject" | "compact" | "tools-changed" | "model-switch" | "mode-switch";
  label: string;
  source?: string;
  /** 净增减；没有意义时为 null。 */
  tokenDelta: number | null;
  turnIndex: number | null;
  stepIndex: number | null;
  at: string;
};

export type ContextPanelHistory = { status: "ready" | "syncing" | "rebuilding" | "fallback" | "unavailable"; indexedThroughSeq: number; targetThroughSeq: number; indexGeneration: string; error?: string };
export type ContextPanelTruncation = { truncated: boolean; returnedCount: number; total: number; fromSeq: number | null; throughSeq: number | null };
export type ContextPanelResponse = ContextPanelView | { notModified: true; versionToken: string; history: ContextPanelHistory };
export type ContextEntriesInput = { sessionId: string; revision: string; cursor?: string; bucket?: ContextPanelBucketKey; limit?: number };
export type ContextEntriesPage = { revision: string; entries: ContextPanelEntry[]; previous: ContextPanelManifest["entries"]; total: number; nextCursor?: string };
export type ContextEntryInput = { sessionId: string; revision: string; key: string; offset?: number };
export type ContextEntryText = { revision: string; key: string; text: string; nextOffset?: number };
/** Persisted request metadata. Contains identities/estimates, never body text. */
export type ContextContentManifest = { schemaVersion: 1; estimatorVersion: string; comparable: boolean; comparisonUnavailableReason?: string; totalEstimatedTokens: number; buckets: ContextPanelBucketTokens; entries: ContextPanelEntry[] };
