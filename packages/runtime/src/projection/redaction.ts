import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";

const SECRET_KEY = /^(?:authorization|api[-_]?key|secret|password|cookie|proxy[-_]?authorization|access[-_]?token|refresh[-_]?token)$/i;
const SECRET_VALUE = /\b(?:sk|key|token)-[A-Za-z0-9_-]{8,}\b/g;
const ABSOLUTE_PATH = /(?:file:\/\/|\/Users\/|\/home\/|[A-Za-z]:\\)[^\s"']+/g;

export const PROJECTION_LIMITS: { readonly maxDepth: number; readonly maxStringLength: number; readonly maxFields: number; readonly maxArrayItems: number } = Object.freeze({
  maxDepth: 8,
  maxStringLength: 2000,
  maxFields: 32,
  maxArrayItems: 32,
});

export function redactProjectionText(value: string, maxLength = PROJECTION_LIMITS.maxStringLength): string {
  const redacted = value.replace(SECRET_VALUE, "[REDACTED]").replace(ABSOLUTE_PATH, "[PATH]");
  return truncate(redacted, maxLength);
}

export function redactProjectionValue(value: RuntimeV2JsonValue, depth = 0): RuntimeV2JsonValue {
  if (depth > PROJECTION_LIMITS.maxDepth) return "[TRUNCATED]";
  if (typeof value === "string") return redactProjectionText(value);
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, PROJECTION_LIMITS.maxArrayItems).map((child) => redactProjectionValue(child, depth + 1));
  const output: Record<string, RuntimeV2JsonValue> = {};
  for (const [key, child] of Object.entries(value).slice(0, PROJECTION_LIMITS.maxFields)) {
    output[key] = SECRET_KEY.test(key) ? "[REDACTED]" : redactProjectionValue(child, depth + 1);
  }
  return output;
}

export function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function toSafeJson(value: unknown): RuntimeV2JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return typeof value === "string" ? redactProjectionText(value) : value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => toSafeJson(item));
  if (typeof value === "object") {
    const output: Record<string, RuntimeV2JsonValue> = {};
    for (const [key, item] of Object.entries(value)) output[key] = SECRET_KEY.test(key) ? "[REDACTED]" : toSafeJson(item);
    return output;
  }
  return "[UNSERIALIZABLE]";
}
