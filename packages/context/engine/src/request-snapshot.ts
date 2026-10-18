import { requestContentManifest } from "./content-manifest.js";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { Context, LlmInput } from "./types.js";

/** Existing request/context schema, projected from the actual prepared input. */
export function snapshotContext(context: Context, input: LlmInput, prepared: RuntimeV2JsonValue, compositionDigest: string, hostCapabilityDigest: string, original?: LlmInput): RuntimeV2JsonValue {
  const contextManifest = requestContentManifest(context, input, original);
  const snapshot = { schemaVersion: 2, sessionId: input.sessionId, logicalAgentScopeId: context.request.logicalAgentScopeId ?? "main", contextRevision: context.status.contextRevision ?? null, throughJournalSeq: context.status.throughJournalSeq, surfaceGeneration: context.content.conversation.replaceGeneration, turnId: context.request.turnId ?? null, stepId: context.request.stepId ?? null,
    contextSections: contextManifest.comparable ? [...context.content.system.sections].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)) : null,
    contextModelFacts: contextManifest.comparable ? context.content.system.modelFacts.map((content, index) => ({ id: context.content.system.modelFactSources?.[index]?.id ?? `model-facts:${index}`, owner: context.content.system.modelFactSources?.[index]?.owner ?? "runtime", order: index, content })) : null,
    systemSections: [...context.content.system.sections].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map(section => section.content),
    modelFacts: context.content.system.modelFacts, facts: context.status.facts,
    renderedSystemPrompt: input.messages.filter(message => message.role === "system").map(message => message.content).join("\n\n"),
    messages: input.messages.filter(message => message.role !== "system"), tools: input.tools,
    contributorProvenance: context.status.plugins["actspace.context.sources"] ?? [], requestOptions: { routeId: input.routeId, model: input.model },
    contextManifest, contextModel: context.status.requestModel ?? null,
    prepared, compositionDigest, hostCapabilityDigest,
  };
  if (Buffer.byteLength(JSON.stringify(snapshot)) > 960 * 1024) { snapshot.contextSections = null; snapshot.contextModelFacts = null; }
  // Metadata must not push an otherwise legal Journal record over the Provider
  // budget. Totals survive; a missing identity list is explicitly uncomparable.
  if (contextManifest.entries.length > 5000 || Buffer.byteLength(JSON.stringify(contextManifest)) > 256 * 1024 || Buffer.byteLength(JSON.stringify(snapshot)) > 960 * 1024) {
    contextManifest.entries = []; contextManifest.comparable = false; contextManifest.comparisonUnavailableReason = "manifest-budget";
  }
  return freezeRequest(snapshot as unknown as RuntimeV2JsonValue);
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
