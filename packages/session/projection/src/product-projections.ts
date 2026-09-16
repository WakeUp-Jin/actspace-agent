import { projectContextState } from "@actspace/shared";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type {
  RuntimeV2ComposerProjection,
  RuntimeV2ProviderUsageProjection,
  RuntimeV2RequestContextEstimateProjection,
  RuntimeV2SessionSnapshot,
} from "@actspace/shared/runtime-v2";

export const PROVIDER_USAGE_PROJECTION_KEY = "providerUsage" as const;
export const REQUEST_CONTEXT_ESTIMATE_PROJECTION_KEY = "requestContextEstimate" as const;
export const COMPOSER_PROJECTION_KEY = "composer" as const;

export function projectProviderUsage(snapshot: RuntimeV2SessionSnapshot): RuntimeV2ProviderUsageProjection {
  return Object.freeze({
    kind: "provider-usage",
    schemaVersion: 1,
    sessionId: snapshot.sessionId,
    throughJournalSeq: snapshot.throughJournalSeq,
    estimator: { name: "durable-provider-usage" as const, version: "1" },
    usage: snapshot.usage,
  });
}
export function projectComposer(snapshot: RuntimeV2SessionSnapshot): RuntimeV2ComposerProjection {
  const phase = snapshot.activity.activeTurnId !== null || snapshot.pendingInbox.length > 0 || snapshot.messages.length > 0
    ? "active"
    : "blank";
  return Object.freeze({ kind: "composer", schemaVersion: 1, sessionId: snapshot.sessionId, throughJournalSeq: snapshot.throughJournalSeq, phase });
}

export function projectRequestContextEstimate(
  snapshot: RuntimeV2SessionSnapshot,
  events: readonly SessionEventEnvelopeV1[],
): RuntimeV2RequestContextEstimateProjection {
  const state = projectContextState(snapshot, events);
  const { totalEstimatedTokens, maxTokens } = state;
  return Object.freeze({
    kind: "request-context-estimate",
    schemaVersion: 1,
    sessionId: snapshot.sessionId,
    throughJournalSeq: snapshot.throughJournalSeq,
    requestId: state.requestId ?? null,
    contextState: { ...state, entries: state.entries.map(entry => ({ ...entry, preview: entry.preview?.slice(0, 1000) })) },
    cumulativeTokens: snapshot.usage.totalTokens,
    cumulativeUsage: snapshot.usage,
    estimator: { name: "runtime-v2-request-snapshot" as const, version: state.estimator.version },
    totalEstimatedTokens,
    maxTokens,
    percentUsed: maxTokens > 0 ? Math.min(100, totalEstimatedTokens / maxTokens * 100) : 0,
  });
}
