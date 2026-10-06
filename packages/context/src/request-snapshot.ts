import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { Context, LlmInput } from "./types.js";

/** Existing request/context schema, projected from the actual prepared input. */
export function snapshotContext(context: Context, input: LlmInput, prepared: RuntimeV2JsonValue, compositionDigest: string, hostCapabilityDigest: string): RuntimeV2JsonValue {
  return freezeRequest({ schemaVersion: 2, sessionId: input.sessionId, turnId: context.request.turnId ?? null, stepId: context.request.stepId ?? null,
    systemSections: [...context.content.system.sections].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map(section => section.content),
    modelFacts: context.content.system.modelFacts, facts: context.status.facts,
    renderedSystemPrompt: input.messages.filter(message => message.role === "system").map(message => message.content).join("\n\n"),
    messages: input.messages.filter(message => message.role !== "system"), tools: input.tools,
    contributorProvenance: context.status.plugins["actspace.context.sources"] ?? [], requestOptions: { routeId: input.routeId, model: input.model },
    prepared, compositionDigest, hostCapabilityDigest,
  } as unknown as RuntimeV2JsonValue);
}

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
