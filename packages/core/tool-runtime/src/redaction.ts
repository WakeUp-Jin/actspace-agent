import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";

const SECRET_KEYS = /^(authorization|api[-_]?key|secret|password|cookie|access[-_]?token|refresh[-_]?token)$/i;
const SECRET_VALUE = /\b(?:sk|key|token)-[A-Za-z0-9_-]{8,}\b/g;

export function redactToolValue(value: RuntimeJsonValue, pointers: readonly string[] = []): RuntimeJsonValue {
  const pointerSet = new Set(pointers);
  return redactAt(value, "", pointerSet);
}

export function redactToolText(value: string): string {
  return value.replace(SECRET_VALUE, "[REDACTED]");
}

function redactAt(value: RuntimeJsonValue, path: string, pointers: ReadonlySet<string>): RuntimeJsonValue {
  if (pointers.has(path)) return "[REDACTED]";
  if (typeof value === "string") return redactToolText(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((child, index) => redactAt(child, `${path}/${index}`, pointers));
  const output: Record<string, RuntimeJsonValue> = {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}/${escapePointer(key)}`;
    output[key] = SECRET_KEYS.test(key) ? "[REDACTED]" : redactAt(child, childPath, pointers);
  }
  return output;
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
