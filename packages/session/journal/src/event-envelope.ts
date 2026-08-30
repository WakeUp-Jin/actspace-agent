import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { SessionError } from "./errors.js";

export type SessionEventCriticality = "required" | "ignorable";

export type SessionEventSourceV1 = {
  readonly ownerPluginId: string;
  readonly agentId?: string;
  readonly turnId?: string;
  readonly stepId?: string;
};

export type SessionEventProvenanceV1 = {
  readonly sourceEventSeqs: readonly number[];
  readonly contributorIds: readonly string[];
  readonly runtimeSelectionSeq: number | null;
};

export type SessionSurfaceNodeV1 =
  | {
      readonly kind: "user";
      readonly messageId: string;
      readonly content: RuntimeV2JsonValue;
      readonly attachmentRefs?: readonly RuntimeV2JsonValue[];
    }
  | {
      readonly kind: "assistant";
      readonly messageId: string;
      readonly content: RuntimeV2JsonValue;
    }
  | {
      readonly kind: "tool-result";
      readonly messageId: string;
      readonly callId: string;
      readonly content: RuntimeV2JsonValue;
      readonly isError: boolean;
    };

export type SessionSurfaceOperationV1 =
  | { readonly kind: "append"; readonly node: SessionSurfaceNodeV1 }
  | {
      readonly kind: "replace";
      readonly start: number;
      readonly end: number;
      readonly node: SessionSurfaceNodeV1;
      readonly sourceEventSeqs: readonly number[];
    };

export type SessionEventEnvelopeV1 = {
  readonly recordKind: "event";
  readonly seq: number;
  readonly type: string;
  readonly eventVersion: number;
  readonly criticality: SessionEventCriticality;
  readonly time: string;
  readonly source: SessionEventSourceV1;
  readonly data: RuntimeV2JsonValue;
  readonly surface: SessionSurfaceOperationV1 | null;
  readonly provenance: SessionEventProvenanceV1;
};

export type SessionEventCandidateV1 = Omit<
  SessionEventEnvelopeV1,
  "recordKind" | "seq" | "time" | "criticality" | "provenance"
> & { readonly provenance?: SessionEventProvenanceV1 };

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
  snapshotSessionJson(value);
}

export function defaultSessionProvenance(): SessionEventProvenanceV1 {
  return Object.freeze({ sourceEventSeqs: Object.freeze([]), contributorIds: Object.freeze([]), runtimeSelectionSeq: null });
}

function validateSurfaceOperation(value: unknown): asserts value is SessionSurfaceOperationV1 {
  if (!isPlainRecord(value)) invalid("Surface operation must be an object.");
  if (value.kind === "append") {
    validateSurfaceNode(value.node);
    return;
  }
  if (value.kind !== "replace") invalid("Surface operation kind is invalid.");
  if (!Number.isSafeInteger(value.start) || !Number.isSafeInteger(value.end) || (value.start as number) < 0 || (value.end as number) <= (value.start as number)) {
    invalid("Surface replace span must be a non-empty integer range.");
  }
  validateIntegerArray(value.sourceEventSeqs, "surface.sourceEventSeqs");
  validateSurfaceNode(value.node);
}

function validateSurfaceNode(value: unknown): asserts value is SessionSurfaceNodeV1 {
  if (!isPlainRecord(value) || !["user", "assistant", "tool-result"].includes(String(value.kind))) invalid("Invalid Surface node.");
  requireNonEmptyString(value.messageId, "surface.node.messageId");
  if (value.kind === "tool-result") {
    requireNonEmptyString(value.callId, "surface.node.callId");
    if (typeof value.isError !== "boolean") invalid("tool-result isError must be boolean.");
  }
}

function validateJsonValue(value: unknown, depth: number): void {
  if (depth > MAX_JSON_DEPTH) invalid("Session JSON exceeds maximum nesting depth.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid("Session JSON numbers must be finite.");
    return;
  }
  if (Array.isArray(value)) {
    for (const child of value) validateJsonValue(child, depth + 1);
    return;
  }
  if (!isPlainRecord(value)) invalid("Session records may contain only plain JSON values.");
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_SECRET_KEYS.has(key.toLowerCase())) invalid(`Session record contains forbidden secret field ${key}.`);
    validateJsonValue(child, depth + 1);
  }
}

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
