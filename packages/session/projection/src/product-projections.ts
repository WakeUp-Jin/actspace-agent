import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type {
  RuntimeV2ComposerProjection,
  RuntimeV2JsonValue,
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
  const latest = [...events].reverse().find((event) => event.type === "request/context");
  const requestId = latest !== undefined && isRecord(latest.data) && typeof latest.data.requestId === "string" ? latest.data.requestId : null;
  const contextValue = latest !== undefined && isRecord(latest.data) ? latest.data.snapshot ?? latest.data : null;
  const totalEstimatedTokens = estimateTokens(contextValue);
  const maxTokens = requestContextWindow(events, latest);
  return Object.freeze({
    kind: "request-context-estimate",
    schemaVersion: 1,
    sessionId: snapshot.sessionId,
    throughJournalSeq: snapshot.throughJournalSeq,
    requestId,
    estimator: { name: "runtime-v2-request-snapshot" as const, version: "1" },
    totalEstimatedTokens,
    maxTokens,
    percentUsed: maxTokens > 0 ? Math.min(100, totalEstimatedTokens / maxTokens * 100) : 0,
  });
}

function requestContextWindow(events: readonly SessionEventEnvelopeV1[], contextEvent: SessionEventEnvelopeV1 | undefined): number {
  const contextData = contextEvent && isRecord(contextEvent.data) ? contextEvent.data : null;
  const snapshot = contextData && isRecord(contextData.snapshot) ? contextData.snapshot : contextData;
  const prepared = snapshot && isRecord(snapshot.prepared) ? snapshot.prepared : null;
  if (prepared && typeof prepared.contextWindow === "number" && Number.isSafeInteger(prepared.contextWindow) && prepared.contextWindow > 0) return prepared.contextWindow;
  const requestId = contextData && typeof contextData.requestId === "string" ? contextData.requestId : null;
  const header = [...events].reverse().find((event) => event.type === "request/header" && isRecord(event.data) && (requestId === null || event.data.requestId === requestId));
  const headerData = header && isRecord(header.data) ? header.data : null;
  return headerData && typeof headerData.contextWindow === "number" && Number.isSafeInteger(headerData.contextWindow) && headerData.contextWindow > 0 ? headerData.contextWindow : 0;
}

function isRecord(value: RuntimeV2JsonValue | undefined): value is Readonly<Record<string, RuntimeV2JsonValue>> {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function estimateTokens(value: RuntimeV2JsonValue): number {
  if (value === null) return 0;
  const serialized = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  if (serialized.length === 0) return 0;
  const ascii = [...serialized].filter((character) => character.codePointAt(0)! <= 0x7f).length;
  return Math.max(1, Math.ceil(ascii / 4 + (serialized.length - ascii)));
}
