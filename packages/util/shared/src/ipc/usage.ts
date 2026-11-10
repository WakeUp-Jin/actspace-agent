// 用量统计 IPC（`usage.*`）：Usage 页的查询输入、进度、读模型信息、活动行 / 汇总 / 聚合 / 趋势，
// 以及供应商余额快照。

import type { UsageCostProvenance } from "../model-catalog";
import type { ModelKey } from "../model-config";
import type { ProviderId } from "../provider-config";

export type UsageStatisticsRange = "day" | "week" | "month" | "total";

/**
 * Usage 统计的取数范围。
 *
 * - `"session"`：单个 session 的 events 聚合（兼容旧用法，必须传 `sessionId`）；
 * - `"global"`（默认）：跨所有普通对话 session 的全部历史 LLM/工具事件汇总，
 *   `sessionId` 字段被忽略。
 *
 * 出于向后兼容考虑，旧调用 `{ sessionId: "..." }` 在不指定 `scope` 时仍按 `"session"` 模式执行。
 */
export type UsageStatisticsScope = "session" | "global";

export type UsageStatisticsGetInput = {
  requestId?: string;
  search?: string;
  /** Exact activity filters, combined with kind/status/search. */
  model?: string;
  providerId?: string;
  kind?: UsageActivityKind;
  /** 仅当 scope==="session" 时必填；scope==="global" 时忽略。 */
  sessionId?: string;
  range?: UsageStatisticsRange;
  /** Optional event-level activity status filter; omitted / "all" keeps every status. */
  status?: "all" | "success" | "error" | "aborted" | "unknown";
  /** 默认 "global"（无 sessionId）或 "session"（有 sessionId）。 */
  scope?: UsageStatisticsScope;
  /** 底部会话明细表分页；默认第一页，每页 10 条。 */
  requestRowsPage?: UsageStatisticsRequestRowsPageInput;
  /** 只看这个工作区（worktree 归到来源工作区）；不进 rollup，走会话集合 + 明细。 */
  workspaceRoot?: string;
  /** 本机时区相对 UTC 的分钟数（东八区 = 480），用于用量趋势与活跃度分桶。 */
  utcOffsetMinutes?: number;
};

export type UsageStatisticsRequestRowsPageInput = {
  page?: number;
  /** Optional bounded page size for large ledgers; renderer values are clamped by Main. */
  limit?: number;
  /** Opaque cursor returned by the previous page. */
  cursor?: string;
};

export type UsageQueryProgress = {
  requestId: string;
  phase: "queued" | "checking" | "syncing" | "rebuilding" | "querying" | "fallback" | "cancelled";
  completedSessions: number;
  totalSessions: number;
  eventsRead: number;
};

export type UsageReadModelInfo = {
  readonly source: "sqlite" | "session";
  readonly status: "ready" | "fallback";
  readonly failedSources?: number;
  readonly reason?: string;
};

/** Journal-derived activity granularity used by the Maka-style Usage page. */
export type UsageActivityKind = "llm_request";

export type UsageActivityStatus = "running" | "success" | "error" | "aborted" | "unknown";

export type UsageActivityCostBasis = "priced" | "estimated" | "unavailable";

export type UsageActivityTokens = {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
};

export type UsageActivityRow = {
  sessionTitle?: string;
  /** Stable across cold Journal rebuilds. */
  activityId: string;
  kind: UsageActivityKind;
  sessionId: string;
  agentRunId: string;
  turnId?: string;
  stepId?: string;
  requestId?: string;
  callId?: string;
  /** Auxiliary attempts remain separate from main Agent requests. */
  purpose?: UsageAuxiliaryPurpose;
  logicalRequestId?: string;
  routeId?: string;
  retryId?: string;
  retryOfRequestId?: string;
  providerId?: string;
  /** Provider connection is optional because older Journal snapshots do not carry it. */
  connectionId?: string;
  modelKey?: ModelKey;
  model?: string;
  workspaceRoot?: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  /** 发出请求到第一个 token；老日志没有首字时间时缺省。 */
  ttftMs?: number;
  /** 第一个 token 到请求结束（思考与回复合在一起）。 */
  decodeMs?: number;
  attempt?: number;
  tokens: UsageActivityTokens;
  costUsd: number | null;
  costBasis: UsageActivityCostBasis;
  costAmount?: number | null;
  costCurrency?: "USD" | null;
  costProvenance?: UsageCostProvenance;
  historicalUnverified?: boolean;
  status: UsageActivityStatus;
  /** Header/call event sequence, useful for evidence links and diagnostics. */
  sourceEventSeq: number;
  relatedEventSeqs: number[];
};

export type UsageAuxiliaryPurpose = "image-inspection" | "auto-review" | "session-title" | "compaction" | "evaluation";

export type UsageActivitySummary = {
  activityCount: number;
  requestCount: number;
  /** 状态为失败的请求。 */
  failedRequestCount: number;
  /** 作为前一次失败请求的重试而发出的请求。 */
  retryCount: number;
  successCount: number;
  errorCount: number;
  abortedCount: number;
  runningCount: number;
  unknownCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  /** LLM requests whose corresponding token fact was not reported; explicit zero remains known. */
  unknownTokenRequestCounts: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    reasoning: number;
    total: number;
  };
  costUsd: number | null;
  costUnavailableCount: number;
};

export type UsageActivitySourceWatermark = {
  sessionId: string;
  throughJournalSeq: number;
};

export type UsageActivityRowsPage = {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  nextCursor?: string | null;
};

export type UsageCostSummary = {
  costUsd: number;
  knownCostRequestCount: number;
  unknownCostRequestCount: number;
  unverifiedHistoricalRequestCount: number;
};
export type UsageActivityAggregate = {
  key: string;
  label: string;
  providerId?: string;
  connectionId?: string;
  count: number;
  errorCount: number;
  totalTokens: number;
  /** LLM requests in this provider/model group with unknown total token usage. */
  unknownTokenRequestCount: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  /** Σ 首字等待与有首字记录的请求数；平均首字 = ttftMs / ttftSamples。 */
  ttftMs: number;
  ttftSamples: number;
  /** Σ 输出时间与对应输出 token；速度 = decodeTokens / decodeMs。 */
  decodeMs: number;
  decodeTokens: number;
  costSummary: UsageCostSummary;
};

/** 耗时环形图「按阶段」：各段耗时合计与次数。 */
export type UsageTiming = {
  ttftMs: number;
  ttftSamples: number;
  decodeMs: number;
  decodeTokens: number;
  /** 已结束、但没有首字记录的主请求数（老会话），不进前两段。 */
  untimedRequests: number;
  toolMs: number;
  toolSamples: number;
  approvalWaitMs: number;
  approvalSamples: number;
  auxiliaryMs: number;
  auxiliaryCount: number;
};

export type UsageSeries = {
  unit: "hour" | "day" | "week";
  /** `start` 是本机时区的桶起点（`YYYY-MM-DD` 或 `YYYY-MM-DD HH:00`）。 */
  buckets: { start: string; tokens: number; costUsd: number; requests: number }[];
  /** 范围内（含筛选）最早一条请求的时间，「全部」的日均按它到现在的天数算；没有请求为 null。 */
  firstAt: string | null;
};

/** 最近 98 天（本机时区），只列有数据的日期。 */
export type UsageHeatmap = { days: { date: string; sessions: number; tokens: number }[] };

export type UsageToolRow = {
  name: string;
  pluginId?: string;
  calls: number;
  failed: number;
  failureCodes: Record<string, number>;
  durationMs: number;
  durationSamples: number;
  p95Ms: number | null;
  outputTokens: number;
  outputSamples: number;
};

export type UsageCommandRow = {
  program: string;
  calls: number;
  failed: number;
  durationMs: number;
  durationSamples: number;
  /** 只有 git / pnpm / npm / yarn / cargo / go / gh / docker 记子命令，按次数倒序。 */
  subcommands: { name: string; calls: number }[];
};

export type UsageSkillRow = {
  skillId: string;
  skillReads: number;
  assetReads: number;
  lastReadAt: string | null;
  /** 读过的文件（相对 Skill 目录），最多 6 个，按次数倒序。 */
  files: string[];
};

export type UsageSubagentRow = {
  preset: string;
  calls: number;
  failed: number;
  durationMs: number;
  durationSamples: number;
  totalTokens: number;
  costUsd: number;
};

export type UsageAuxiliaryRow = {
  purpose: UsageAuxiliaryPurpose;
  calls: number;
  durationMs: number;
  totalTokens: number;
  costUsd: number;
};
export type UsageActivitySnapshot = {
  readModel?: UsageReadModelInfo;
  costSummary?: UsageCostSummary;
  aggregates?: { providers: UsageActivityAggregate[]; models: UsageActivityAggregate[] };
  timing?: UsageTiming;
  series?: UsageSeries;
  heatmap?: UsageHeatmap;
  /** 以下四组来自 Harness 统计表，不受模型 / 提供商筛选影响；回退时缺省并置 `harnessUnavailable`。 */
  tools?: UsageToolRow[];
  commands?: UsageCommandRow[];
  skills?: UsageSkillRow[];
  subagents?: UsageSubagentRow[];
  auxiliary?: UsageAuxiliaryRow[];
  filterOptions?: { models: string[]; providers: string[]; workspaces: string[] };
  harnessUnavailable?: true;

  schemaVersion: 1;
  scope: UsageStatisticsScope;
  sessionId: string | null;
  title: string;
  range: UsageStatisticsRange;
  generatedAt: string;
  sourceCount: number;
  /** Bounded diagnostic sample, not a recovery or freshness authority. */
  sourceWatermarks: UsageActivitySourceWatermark[];
  sourceWatermarksTruncated?: boolean;
  summary: UsageActivitySummary;
  /** Current page, sorted newest activity first. */
  rows: UsageActivityRow[];
  rowsPage: UsageActivityRowsPage;
};

// ─── 供应商余额 ───

export type ProviderBalanceDisplay = {
  amount: string;
  currency: string;
};

/** 余额 / 额度可读取的供应商。 */
export type BalanceProviderId = Extract<ProviderId, "deepseek" | "kimi" | "openrouter">;

/** 通用供应商余额快照；按 provider 区分来源，UI 每个 provider 渲染一张卡。 */
export type ProviderBalanceSnapshot = {
  provider: BalanceProviderId;
  isConfigured: boolean;
  isAvailable: boolean | null;
  generatedAt: string;
  displayBalance: ProviderBalanceDisplay | null;
};
