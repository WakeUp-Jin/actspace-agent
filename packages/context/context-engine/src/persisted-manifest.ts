import type { ContextContentManifest, ContextPanelEntry } from "@actspace/shared";
import { CONTEXT_BUCKET_REGISTRY } from "@actspace/shared";
import { CONTEXT_ESTIMATOR_VERSION, estimateContextTokens } from "./content-manifest.js";

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const validCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
/** Decode durable metadata at the engine boundary. Legacy records retain only
 * aggregate estimates: positional identities would fabricate comparisons. */
export function readPersistedContextManifest(snapshot: Record<string, unknown>): ContextContentManifest {
  const value = object(snapshot.contextManifest);
  const buckets = object(value.buckets);
  const names = new Set(CONTEXT_BUCKET_REGISTRY.map(bucket => bucket.key));
  const entries = value.entries;
  const keys = new Set<string>();
  if (value.schemaVersion === 1 && value.estimatorVersion === CONTEXT_ESTIMATOR_VERSION && typeof value.comparable === "boolean" && validCount(value.totalEstimatedTokens)
    && Object.entries(buckets).every(([key, count]) => names.has(key as never) && validCount(count))
    && Array.isArray(entries) && entries.length <= 5000 && JSON.stringify(value).length <= 256 * 1024 && entries.every(raw => {
      const entry = object(raw);
      if (typeof entry.key !== "string" || entry.key.length > 2048 || keys.has(entry.key) || !names.has(entry.bucket as never) || !validCount(entry.estimatedTokens)) return false;
      keys.add(entry.key); return true;
    })) {
    return { schemaVersion: 1, estimatorVersion: CONTEXT_ESTIMATOR_VERSION, comparable: value.comparable, totalEstimatedTokens: value.totalEstimatedTokens, buckets,
      ...(typeof value.comparisonUnavailableReason === "string" ? { comparisonUnavailableReason: value.comparisonUnavailableReason.slice(0, 100) } : {}),
      entries: entries.map(raw => {
        const ref = object(raw.trajectoryRef);
        const trajectoryRef = Object.fromEntries(["messageId", "callId"].flatMap(key => typeof ref[key] === "string" && (ref[key] as string).length <= 2048 ? [[key, ref[key]]] : []));
        return { key: raw.key, bucket: raw.bucket, estimatedTokens: raw.estimatedTokens, title: typeof raw.title === "string" ? raw.title.slice(0, 80) : "上下文条目",
          ...(["user", "assistant", "thinking", "tool-call", "tool-result"].includes(raw.kind) ? { kind: raw.kind } : {}),
          ...(Object.keys(trajectoryRef).length ? { trajectoryRef } : {}) } as ContextPanelEntry;
      }) };
  }
  const fallback = { systemPrompt: estimateContextTokens(snapshot.renderedSystemPrompt ?? ""), tools: (Array.isArray(snapshot.tools) ? snapshot.tools : []).reduce<number>((sum, tool) => sum + estimateContextTokens(tool), 0), conversation: (Array.isArray(snapshot.messages) ? snapshot.messages : []).reduce<number>((sum, message) => sum + estimateContextTokens(object(message).content), 0) };
  return { schemaVersion: 1, estimatorVersion: CONTEXT_ESTIMATOR_VERSION, comparable: false, comparisonUnavailableReason: "legacy-source-identities-unavailable", totalEstimatedTokens: Object.values(fallback).reduce((a, b) => a + b, 0), buckets: fallback, entries: [] };
}
