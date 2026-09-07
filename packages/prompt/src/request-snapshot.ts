import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";

export type LogicalRequestCandidate = {
  readonly sessionId: string;
  readonly turnId: string;
  readonly stepId: string;
  readonly messages: readonly RuntimeV2JsonValue[];
  readonly systemSections: readonly RuntimeV2JsonValue[];
  readonly facts: readonly RuntimeV2JsonValue[];
  readonly renderedSystemPrompt: string;
  readonly tools: readonly RuntimeV2JsonValue[];
  readonly contributorProvenance: readonly RuntimeV2JsonValue[];
  readonly requestOptions: RuntimeV2JsonValue;
};

export type PreparedRequestMetadata = {
  readonly route: string;
  readonly model: string;
  readonly registrationId: string;
  readonly adapterVersion: string;
  readonly defaults: RuntimeV2JsonValue;
  readonly retryPolicy: RuntimeV2JsonValue;
  /** Model context capacity resolved at request preparation time; null means unknown. */
  readonly contextWindow?: number | null;
};

export type LogicalRequestSnapshot = LogicalRequestCandidate & {
  readonly schemaVersion: 1;
  readonly compositionDigest: string;
  readonly hostCapabilityDigest: string;
  readonly prepared: PreparedRequestMetadata;
};

export function freezeRequest<T extends RuntimeV2JsonValue>(value: T): Readonly<T> {
  validateRequestValue(value, 0);
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError("Request snapshot must be JSON-safe.");
  return deepFreeze(JSON.parse(encoded) as T);
}

const SECRET_KEY = /^(?:authorization|api[-_]?key|secret|password|cookie|proxy[-_]?authorization|access[-_]?token|refresh[-_]?token)$/i;

function validateRequestValue(value: unknown, depth: number): asserts value is RuntimeV2JsonValue {
  if (depth > 32) throw new TypeError("Request snapshot exceeds maximum depth.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new TypeError("Request snapshot contains a non-finite number."); return; }
  if (Array.isArray(value)) { for (const child of value) validateRequestValue(child, depth + 1); return; }
  if (typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new TypeError("Request snapshot contains a non-JSON value.");
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) throw new TypeError(`Request snapshot contains forbidden field ${key}.`);
    validateRequestValue(child, depth + 1);
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object") {
    for (const child of Array.isArray(value) ? value : Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
