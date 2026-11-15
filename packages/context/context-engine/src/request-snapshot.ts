import { createHash } from "node:crypto";
import { sortSystemSections } from "@actspace/shared";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { Context, LlmInput } from "./types.js";

/** 一次请求要写进日志的三样东西（agent-spec-request-record.md §3–§5）。提示词、工具只在 digest 与日志里最近一条不同时才写。 */
export type RequestRecords = {
  readonly systemPrompt: { readonly digest: string; readonly sections: readonly RuntimeV2JsonValue[]; readonly modelFacts: readonly RuntimeV2JsonValue[]; readonly contributorProvenance: readonly RuntimeV2JsonValue[] };
  readonly tools: { readonly digest: string; readonly tools: readonly RuntimeV2JsonValue[] };
  readonly snapshot: RuntimeV2JsonValue;
};

function digestOf(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

/** 从引擎上下文和实际发出的请求（工具、路由、模型）生成请求记录。对话不进记录：它已经在对话事件里。 */
export function requestRecords(context: Context, input: Pick<LlmInput, "sessionId" | "routeId" | "model" | "tools">, prepared: RuntimeV2JsonValue, compositionDigest: string, hostCapabilityDigest: string): RequestRecords {
  const system = context.content.system;
  const prompt = {
    sections: sortSystemSections(system.sections).map(section => ({ owner: section.owner, id: section.id, order: section.order, content: section.content, ...(section.provenance === undefined ? {} : { provenance: section.provenance }) })),
    modelFacts: system.modelFacts.map((content, index) => ({ owner: system.modelFactSources?.[index]?.owner ?? "runtime", id: system.modelFactSources?.[index]?.id ?? `model-facts:${index}`, order: index, content })),
    contributorProvenance: context.status.plugins["actspace.context.sources"] ?? [],
  };
  const systemPrompt = freezeRequest({ digest: digestOf(prompt), ...prompt } as unknown as RuntimeV2JsonValue) as unknown as RequestRecords["systemPrompt"];
  const tools = freezeRequest({ digest: digestOf(input.tools), tools: input.tools } as unknown as RuntimeV2JsonValue) as unknown as RequestRecords["tools"];
  const snapshot = freezeRequest({
    schemaVersion: 3, sessionId: input.sessionId, logicalAgentScopeId: context.request.logicalAgentScopeId ?? "main",
    contextRevision: context.status.contextRevision ?? null, throughJournalSeq: context.status.throughJournalSeq, surfaceGeneration: context.content.conversation.replaceGeneration,
    turnId: context.request.turnId ?? null, stepId: context.request.stepId ?? null,
    systemPromptDigest: systemPrompt.digest, toolsDigest: tools.digest,
    prepared, requestOptions: { routeId: input.routeId, model: input.model }, contextModel: context.status.requestModel ?? null,
    compositionDigest, hostCapabilityDigest,
  } as unknown as RuntimeV2JsonValue);
  return { systemPrompt, tools, snapshot };
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
