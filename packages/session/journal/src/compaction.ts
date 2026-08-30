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
}): SessionEventCandidateV1 {
  if (options.start < 0 || options.end <= options.start || options.end > options.surface.entries.length) {
    throw new SessionError("INVALID_EVENT", "Compaction replacement span is invalid.");
  }
  const sources = [...new Set(options.surface.entries.slice(options.start, options.end).flatMap((entry) => entry.sourceEventSeqs))].sort((left, right) => left - right);
  const candidate: SessionEventCandidateV1 = {
    type: "surface/replaced",
    eventVersion: 1,
    source: { ownerPluginId: "@actspace/core" },
    data: { compactionId: options.compactionId, sourceEventSeqs: sources },
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
    makeControl("compaction/end", { compactionId: options.compactionId, summaryDigest: options.summaryDigest }),
  ]);
}
