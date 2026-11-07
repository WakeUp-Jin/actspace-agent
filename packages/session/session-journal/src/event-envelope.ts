
import { SessionError } from "./errors.js";

export type { SessionEventCriticality, SessionEventSourceV1, SessionEventProvenanceV1, SessionSurfaceNodeV1, SessionSurfaceOperationV1, SessionEventEnvelopeV1, SessionEventCandidateV1 } from "@actspace/shared/runtime-v2";
import type { SessionEventEnvelopeV1, SessionEventProvenanceV1, SessionSurfaceOperationV1 } from "@actspace/shared/runtime-v2";

const FORBIDDEN_SECRET_KEYS = new Set([
  "authorization",
  "apikey",
  "api_key",
  "secret",
  "password",
  "cookie",
  "proxy-authorization",
  "proxyauthorization",
  "accesstoken",
  "refreshtoken",
]);

const MAX_JSON_DEPTH = 32;
const MAX_JSON_BYTES = 1024 * 1024;

export function snapshotSessionJson<T>(value: T): Readonly<T> {
  validateJsonValue(value, 0);
  const serialized = JSON.stringify(value);
  if (serialized === undefined || Buffer.byteLength(serialized, "utf8") > MAX_JSON_BYTES) {
    throw new SessionError("INVALID_EVENT", "Session record exceeds the 1 MiB JSON limit.");
  }
  return deepFreeze(JSON.parse(serialized) as T);
}

/**
 * Validate-only twin of `snapshotSessionJson`: rejects exactly the same inputs with the same errors, but
 * produces no copy. Use it where the snapshot would be discarded (e.g. replaying a Journal).
 * The 1 MiB limit is decided from a cheap upper bound on the serialized size; only values whose bound
 * exceeds the limit are actually serialized to get the exact size.
 */
export function validateSessionJson(value: unknown): void {
  const bound = validateJsonValue(value, 0);
  if (bound <= MAX_JSON_BYTES) return;
  const serialized = JSON.stringify(value);
  if (serialized === undefined || Buffer.byteLength(serialized, "utf8") > MAX_JSON_BYTES) {
    throw new SessionError("INVALID_EVENT", "Session record exceeds the 1 MiB JSON limit.");
  }
}

export function validateEventEnvelopeShape(value: unknown): asserts value is SessionEventEnvelopeV1 {
  if (!isPlainRecord(value) || value.recordKind !== "event") invalid("Event envelope must be an event object.");
  if (!Number.isSafeInteger(value.seq) || (value.seq as number) < 0) invalid("Event seq must be a non-negative integer.");
  requireNonEmptyString(value.type, "type");
  if (!Number.isSafeInteger(value.eventVersion) || (value.eventVersion as number) < 1) invalid("eventVersion must be >= 1.");
  if (value.criticality !== "required" && value.criticality !== "ignorable") invalid("Invalid event criticality.");
  requireNonEmptyString(value.time, "time");
  if (!Number.isFinite(Date.parse(value.time as string))) invalid("Event time must be RFC3339.");
  if (!isPlainRecord(value.source)) invalid("Event source must be an object.");
  requireNonEmptyString(value.source.ownerPluginId, "source.ownerPluginId");
  if (!isPlainRecord(value.provenance)) invalid("Event provenance must be an object.");
  validateIntegerArray(value.provenance.sourceEventSeqs, "provenance.sourceEventSeqs");
  validateStringArray(value.provenance.contributorIds, "provenance.contributorIds");
  if (value.provenance.runtimeSelectionSeq !== null && (!Number.isSafeInteger(value.provenance.runtimeSelectionSeq) || (value.provenance.runtimeSelectionSeq as number) < 0)) {
    invalid("runtimeSelectionSeq must be null or a non-negative integer.");
  }
  if (value.surface !== null) validateSurfaceOperation(value.surface);
  validateSessionJson(value);
}

export function defaultSessionProvenance(): SessionEventProvenanceV1 {
  return Object.freeze({ sourceEventSeqs: Object.freeze([]), contributorIds: Object.freeze([]), runtimeSelectionSeq: null });
}

/** surface 只是标记，节点内容在 data 里（agent-spec-surface-derived.md §4.1）；带 `node` 的旧格式直接拒绝。 */
function validateSurfaceOperation(value: unknown): asserts value is SessionSurfaceOperationV1 {
  if (!isPlainRecord(value)) invalid("Surface operation must be an object.");
  if ("node" in value) invalid("Surface operation must not carry a node (old Session format); the node is derived from event data.");
  if (value.kind === "append") {
    if (Object.keys(value).length !== 1) invalid("Surface append operation only has kind.");
    return;
  }
  if (value.kind !== "replace") invalid("Surface operation kind is invalid.");
  if (Object.keys(value).some(key => !["kind", "start", "end", "sourceEventSeqs"].includes(key))) invalid("Surface replace operation has unknown fields.");
  if (!Number.isSafeInteger(value.start) || !Number.isSafeInteger(value.end) || (value.start as number) < 0 || (value.end as number) <= (value.start as number)) {
    invalid("Surface replace span must be a non-empty integer range.");
  }
  validateIntegerArray(value.sourceEventSeqs, "surface.sourceEventSeqs");
}

/** Validates a plain JSON value and returns an upper bound of its serialized UTF-8 size in bytes. */
function validateJsonValue(value: unknown, depth: number): number {
  if (depth > MAX_JSON_DEPTH) invalid("Session JSON exceeds maximum nesting depth.");
  if (value === null) return 4;
  if (typeof value === "string") return jsonStringBound(value);
  if (typeof value === "boolean") return 5;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid("Session JSON numbers must be finite.");
    return 25;
  }
  if (Array.isArray(value)) {
    let bound = 2;
    for (const child of value) bound += validateJsonValue(child, depth + 1) + 1;
    return bound;
  }
  if (!isPlainRecord(value)) invalid("Session records may contain only plain JSON values.");
  let bound = 2;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_SECRET_KEYS.has(key.toLowerCase())) invalid(`Session record contains forbidden secret field ${key}.`);
    bound += jsonStringBound(key) + 1 + validateJsonValue(child, depth + 1) + 1;
  }
  return bound;
}

/** Each UTF-16 unit serializes to at most 6 bytes (\\uXXXX escape); plus the quotes. */
function jsonStringBound(value: string): number { return value.length * 6 + 2; }

function validateIntegerArray(value: unknown, field: string): asserts value is number[] {
  if (!Array.isArray(value) || value.some((item) => !Number.isSafeInteger(item) || item < 0)) invalid(`${field} must contain non-negative integers.`);
}

function validateStringArray(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) invalid(`${field} must contain non-empty strings.`);
}

function requireNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) invalid(`${field} must be a non-empty string.`);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object") {
    for (const child of Array.isArray(value) ? value : Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function invalid(message: string): never {
  throw new SessionError("INVALID_EVENT", message);
}
