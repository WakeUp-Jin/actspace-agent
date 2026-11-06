import type { SessionEventCandidateV1, SessionSurfaceNodeV1 } from "./event-envelope.js";
import type { SessionSurfaceView } from "./surface.js";
import { SessionError } from "./errors.js";

export function createCompactionReplacement(options: {
  readonly surface: SessionSurfaceView;
  readonly start: number;
  readonly end: number;
  readonly summary: SessionSurfaceNodeV1;
  readonly compactionId: string;
  readonly contributorIds: readonly string[];
  /** 被替换范围的估算，按节点是否是之前的压缩摘要分开记；上下文估算投影据此扣减（agent-spec-request-record.md §6.3.1）。 */
  readonly replacedTokens: { readonly conversation: number; readonly summarizedConversation: number };
  readonly estimatorVersion: string;
}): SessionEventCandidateV1 {
  if (options.start < 0 || options.end <= options.start || options.end > options.surface.entries.length) {
    throw new SessionError("INVALID_EVENT", "Compaction replacement span is invalid.");
  }
  const sources = [...new Set(options.surface.entries.slice(options.start, options.end).flatMap((entry) => entry.sourceEventSeqs))].sort((left, right) => left - right);
  const candidate: SessionEventCandidateV1 = {
    type: "surface/replaced",
    eventVersion: 1,
    source: { ownerPluginId: "@actspace/core" },
    data: { compactionId: options.compactionId, sourceEventSeqs: sources, replacedTokens: { conversation: options.replacedTokens.conversation, summarizedConversation: options.replacedTokens.summarizedConversation }, estimatorVersion: options.estimatorVersion },
    surface: { kind: "replace", start: options.start, end: options.end, node: options.summary, sourceEventSeqs: sources },
    provenance: { sourceEventSeqs: sources, contributorIds: options.contributorIds, runtimeSelectionSeq: null },
  };
  return Object.freeze(candidate);
}

export function createCompactionTransaction(options: {
  readonly surface: SessionSurfaceView;
  readonly start: number;
  readonly end: number;
  readonly summary: SessionSurfaceNodeV1;
  readonly compactionId: string;
  readonly contributorIds: readonly string[];
  readonly summaryDigest: string;
  readonly replacedTokens: { readonly conversation: number; readonly summarizedConversation: number };
  readonly estimatorVersion: string;
  /** Elapsed compaction work, including summarization before the transaction commits. */
  readonly durationMs?: number;
  /** Display facts recorded on `compaction/end`: tokens before (flagged when it includes estimates), estimated tokens after. */
  readonly stats?: { readonly trigger: "manual" | "auto"; readonly beforeTokens?: number; readonly afterTokens?: number; readonly beforeEstimated?: true };
}): readonly SessionEventCandidateV1[] {
  const makeControl = (type: "compaction/start" | "compaction/summary" | "compaction/end", data: SessionEventCandidateV1["data"]): SessionEventCandidateV1 => ({
    type,
    eventVersion: 1,
    source: { ownerPluginId: "@actspace/core" },
    data,
    surface: null,
    provenance: { sourceEventSeqs: [], contributorIds: options.contributorIds, runtimeSelectionSeq: null },
  });
  return Object.freeze([
    makeControl("compaction/start", { compactionId: options.compactionId, start: options.start, end: options.end }),
    makeControl("compaction/summary", { compactionId: options.compactionId, summaryDigest: options.summaryDigest }),
    createCompactionReplacement(options),
    makeControl("compaction/end", { compactionId: options.compactionId, summaryDigest: options.summaryDigest, ...(options.durationMs === undefined ? {} : { durationMs: options.durationMs }), ...options.stats }),
  ]);
}
