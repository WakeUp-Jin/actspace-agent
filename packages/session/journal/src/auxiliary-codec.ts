import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { SessionError } from "./errors.js";

export const AUXILIARY_IDENTITY_FIELDS = ["sessionId", "agentRunId", "turnId", "stepId", "callId", "logicalRequestId", "attemptId", "attempt", "purpose", "routeId", "model", "startedAt"] as const;

/** Auxiliary requests are billing facts, never conversation or Context nodes. */
export function validateAuxiliaryRequest(type: string, data: Readonly<Record<string, RuntimeV2JsonValue>>): void {
  const invalid = (message: string): never => { throw new SessionError("INVALID_EVENT", `${type}: ${message}.`); };
  const toolOwned = data.purpose === "image-inspection" || data.purpose === "auto-review";
  if (!toolOwned && data.purpose !== "session-title" && data.purpose !== "compaction") invalid("unsupported purpose");
  for (const field of AUXILIARY_IDENTITY_FIELDS) {
    if (["agentRunId", "turnId", "stepId", "callId"].includes(field) && !toolOwned) {
      if (field === "turnId" && data.purpose === "compaction" && data.turnId !== undefined) {
        if (typeof data.turnId !== "string" || !data.turnId.trim()) invalid("turnId must be a non-empty string");
      } else if (data[field] !== undefined) invalid(`${field} is not owned by this request`);
      continue;
    }
    if (field === "attempt") {
      if (!Number.isSafeInteger(data.attempt) || (data.attempt as number) < 1) invalid("attempt must be a positive integer");
    } else if (typeof data[field] !== "string" || (data[field] as string).trim().length === 0) invalid(`${field} must be a non-empty string`);
  }
  if (!Number.isFinite(Date.parse(data.startedAt as string))) invalid("invalid startedAt");
  if (type === "llm/auxiliary-start") return;
  if (!["completed", "failed", "aborted"].includes(data.status as string)) invalid("invalid terminal status");
  if (typeof data.finishedAt !== "string" || !Number.isFinite(Date.parse(data.finishedAt)) || Date.parse(data.finishedAt) < Date.parse(data.startedAt as string)) invalid("invalid finishedAt");
  const usage = data.usage;
  if (usage === null || typeof usage !== "object" || Array.isArray(usage)) invalid("usage must be an object");
  const fields = usage as Readonly<Record<string, RuntimeV2JsonValue>>;
  for (const field of ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens", "cost"]) {
    const value = fields[field];
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) invalid(`usage.${field} must be a non-negative finite number or null`);
  }
  if (fields.costCurrency !== null && (typeof fields.costCurrency !== "string" || fields.costCurrency.length === 0)) invalid("invalid usage.costCurrency");
  if (!["provider-reported", "estimated", "unknown"].includes(fields.source as string)) invalid("invalid usage.source");
  if (fields.costProvenance !== undefined) {
    const provenance = fields.costProvenance;
    if (provenance === null || typeof provenance !== "object" || Array.isArray(provenance)) invalid("invalid usage.costProvenance");
    const record = provenance as Readonly<Record<string, RuntimeV2JsonValue>>;
    if (record.version !== 1 || !["provider-reported", "estimated", "unknown"].includes(record.basis as string)
      || (record.reason !== null && typeof record.reason !== "string")
      || (record.pricingSnapshot !== null && (typeof record.pricingSnapshot !== "object" || Array.isArray(record.pricingSnapshot)))) invalid("invalid usage.costProvenance");
  }
}
