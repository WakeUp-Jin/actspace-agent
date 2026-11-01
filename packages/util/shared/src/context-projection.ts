import type { ContextState, ContextStateEntry } from "./session";
import type { RuntimeV2JsonValue, RuntimeV2SessionSnapshot } from "./runtime-v2";
export type ContextProjectionEvent = { readonly seq: number; readonly type: string; readonly time: string; readonly data: RuntimeV2JsonValue; readonly surface?: unknown };

/** JSON-safe read-only view published by the Context Engine to Host/IPC. */
export type ManagedContextProjection = {
  readonly schemaVersion: 1;
  readonly identity: { readonly sessionId: string; readonly logicalAgentScopeId: string };
  readonly basis: "current-context" | "request";
  readonly contextRevision: number;
  readonly throughJournalSeq: number;
  readonly surfaceGeneration: number;
  readonly instanceGeneration?: string;
  readonly model?: import("./context-panel").ContextPanelModel | null;
  readonly manifest?: import("./context-panel").ContextContentManifest;
  readonly request?: { readonly requestId: string; readonly turnId?: string; readonly stepId?: string; readonly routeId: string; readonly model: string };
  readonly content: {
    readonly system: { readonly sections: readonly { readonly id: string; readonly owner: string; readonly order: number; readonly content: RuntimeV2JsonValue }[]; readonly modelFacts: readonly RuntimeV2JsonValue[] };
    readonly conversation: { readonly replaceGeneration: number; readonly entries: readonly { readonly node: RuntimeV2JsonValue; readonly sourceEventSeqs: readonly number[] }[] };
    readonly supplements: readonly { readonly id: string; readonly owner: string; readonly sourceEventSeq: number; readonly afterEventSeq: number; readonly text: string }[];
    readonly tools: readonly RuntimeV2JsonValue[];
  };
  readonly status: { readonly throughJournalSeq: number; readonly cycle: number; readonly paths: readonly RuntimeV2JsonValue[]; readonly sleepingDirectory?: RuntimeV2JsonValue; readonly facts: readonly RuntimeV2JsonValue[]; readonly plugins: Readonly<Record<string, RuntimeV2JsonValue>> };
};

/** Estimate complete request content before any browse preview truncation. */
export function projectContextState(
  snapshot: Pick<RuntimeV2SessionSnapshot, "sessionId" | "throughJournalSeq" | "updatedAt" | "messages"> & { readonly activity: Pick<RuntimeV2SessionSnapshot["activity"], "activeTurnId"> },
  journal: readonly ContextProjectionEvent[],
): ContextState {
  const latest = [...journal].reverse().find((event) => event.type === "request/context");
  const request = latest === undefined ? {} : record(record(latest.data).snapshot);
  const cached = latest && record(latest.data).browseContextState;
  if (cached && typeof cached === "object" && !Array.isArray(cached) && record(cached).sessionId === snapshot.sessionId) {
    return cached as unknown as ContextState;
  }
  const compacted = [...journal].reverse().find(event => event.type === "compaction/end");
  const isNext = latest !== undefined && compacted !== undefined && compacted.seq > latest.seq;
  const basis: ContextState["basis"] = isNext ? "next-request" : snapshot.activity.activeTurnId ? "current-request" : "last-request";
  const replacements = journal.filter(event => event.type === "surface/replaced" && record(event.surface as RuntimeV2JsonValue).kind === "replace" && (isNext || event.seq < (latest?.seq ?? 0)));
  const summaryContents = new Set(replacements.map(event => contextPreview(record(record(event.surface as RuntimeV2JsonValue).node).content ?? null)));
  const messages = isNext ? snapshot.messages.map(message => ({ role: message.kind === "tool-result" ? "tool" : message.kind, content: message.content })) : array(request.messages);
  const entries: ContextStateEntry[] = [];
  const push = (kind: ContextStateEntry["kind"], id: string, title: string, value: RuntimeV2JsonValue, pinned = false) => {
    const preview = contextPreview(value);
    const tokenText = contextTokenText(value);
    if (!preview && !tokenText) return;
    entries.push({ id, kind, title, estimatedTokens: estimateTokens(tokenText), included: true, pinned, removable: false, preview: preview || "Internal runtime context" });
  };

  for (const [index, section] of array(request.systemSections).entries()) {
    if (Array.isArray(section)) {
      for (const [skillIndex, skill] of section.entries()) {
        const value = record(skill);
        push("skills", `request-${latest?.seq ?? 0}-skill-${index}-${skillIndex}`, string(value.id) ?? `Skill ${skillIndex + 1}`, value.content ?? skill);
      }
      continue;
    }
    const value = record(section);
    if (typeof value.content === "string" && typeof value.title === "string") {
      push("rules", `request-${latest?.seq ?? 0}-rule-${index}`, value.title, value.content);
      continue;
    }
    push("systemPrompt", `request-${latest?.seq ?? 0}-system-${index}`, index === 0 ? "Core identity" : index === 1 ? "Runtime safety" : `System section ${index + 1}`, section, true);
  }

  for (const [index, tool] of array(request.tools).entries()) {
    const value = record(tool);
    push("toolDefinitions", `request-${latest?.seq ?? 0}-tool-${index}`, string(value.name) ?? `Tool ${index + 1}`, tool);
  }

  const facts = request.schemaVersion === 2 ? array(request.modelFacts) : array(request.facts);
  if (facts.length > 0) push("systemPrompt", `request-${latest?.seq ?? 0}-facts`, "Runtime facts", facts, true);
  for (const [index, message] of messages.entries()) {
    const value = record(message);
    push(summaryContents.has(contextPreview(value.content ?? message)) ? "summarizedConversation" : "conversation", `request-${latest?.seq ?? 0}-message-${index}`, `${string(value.role) ?? "message"} ${index + 1}`, value.content ?? message);
  }

  const bucketOrder: Array<{ key: NonNullable<ContextState["buckets"][number]["name"]>; label: string; kind: ContextStateEntry["kind"] }> = [
    { key: "systemPrompt", label: "System prompt", kind: "systemPrompt" },
    { key: "tools", label: "Tools", kind: "toolDefinitions" },
    { key: "rules", label: "Rules", kind: "rules" },
    { key: "skills", label: "Skills", kind: "skills" },
    { key: "summarizedConversation", label: "Summarized conversation", kind: "summarizedConversation" },
    { key: "conversation", label: "Conversation", kind: "conversation" },
  ];
  const buckets = bucketOrder.map(({ key, label, kind }) => ({ name: key, key, label, tokens: entries.filter((entry) => entry.kind === kind).reduce((sum, entry) => sum + entry.estimatedTokens, 0) }));
  const totalEstimatedTokens = entries.reduce((sum, entry) => sum + entry.estimatedTokens, 0);
  const maxTokens = requestContextWindow(journal);
  return {
    throughJournalSeq: snapshot.throughJournalSeq,
    sessionId: snapshot.sessionId,
    updatedAt: isNext ? compacted!.time : latest?.time ?? snapshot.updatedAt,
    basis,
    requestId: isNext ? undefined : string(latest && record(latest.data).requestId),
    estimator: { name: "runtime-v2-request-snapshot", version: "2" },
    totalEstimatedTokens,
    maxTokens,
    percentUsed: maxTokens > 0 ? Math.min(100, totalEstimatedTokens / maxTokens * 100) : 0,
    buckets,
    entries,
  };
}

/** Adapts the engine-owned projection to the existing ContextState UI contract. */
export function projectManagedContextState(
  snapshot: Pick<RuntimeV2SessionSnapshot, "sessionId" | "throughJournalSeq" | "updatedAt">,
  projection: ManagedContextProjection,
  options: { readonly maxTokens?: number; readonly updatedAt?: string } = {},
): ContextState {
  const entries: ContextStateEntry[] = [];
  const push = (kind: ContextStateEntry["kind"], id: string, title: string, value: RuntimeV2JsonValue, pinned = false) => {
    const preview = contextPreview(value);
    const tokenText = contextTokenText(value);
    if (!preview && !tokenText) return;
    entries.push({ id, kind, title, estimatedTokens: estimateTokens(tokenText), included: true, pinned, removable: false, preview: preview || "Internal runtime context" });
  };
  for (const [index, section] of projection.content.system.sections.entries()) {
    const owner = section.owner.toLowerCase();
    const kind = owner.endsWith("skills") || section.id.toLowerCase().includes("skill") ? "skills" : owner.endsWith("rules") || section.id.toLowerCase().includes("rule") ? "rules" : "systemPrompt";
    push(kind, `managed-${projection.contextRevision}-section-${index}`, section.id, section.content, kind === "systemPrompt");
  }
  for (const [index, fact] of projection.content.system.modelFacts.entries()) push("systemPrompt", `managed-${projection.contextRevision}-fact-${index}`, "Runtime fact", fact, true);
  for (const supplement of projection.content.supplements) push("systemPrompt", `managed-${projection.contextRevision}-supplement-${supplement.id}`, supplement.id, supplement.text);
  for (const [index, tool] of projection.content.tools.entries()) {
    const value = record(tool);
    push("toolDefinitions", `managed-${projection.contextRevision}-tool-${index}`, string(value.name) ?? `Tool ${index + 1}`, tool);
  }
  for (const [index, entry] of projection.content.conversation.entries.entries()) {
    const node = record(entry.node);
    const kind = node.kind === "tool-result" ? "conversation" : "conversation";
    push(kind, `managed-${projection.contextRevision}-message-${index}`, `${string(node.kind) ?? "message"} ${index + 1}`, node.content ?? entry.node);
  }
  const paths = projection.status.paths.map(value => record(value).path).filter((value): value is string => typeof value === "string");
  if (paths.length) push("systemPrompt", `managed-${projection.contextRevision}-paths`, "Context references", paths, true);
  const bucketOrder: Array<{ key: NonNullable<ContextState["buckets"][number]["name"]>; label: string; kind: ContextStateEntry["kind"] }> = [
    { key: "systemPrompt", label: "System prompt", kind: "systemPrompt" }, { key: "tools", label: "Tools", kind: "toolDefinitions" },
    { key: "rules", label: "Rules", kind: "rules" }, { key: "skills", label: "Skills", kind: "skills" },
    { key: "summarizedConversation", label: "Summarized conversation", kind: "summarizedConversation" }, { key: "conversation", label: "Conversation", kind: "conversation" },
  ];
  const buckets = bucketOrder.map(({ key, label, kind }) => ({ name: key, key, label, tokens: entries.filter(entry => entry.kind === kind).reduce((sum, entry) => sum + entry.estimatedTokens, 0) }));
  const totalEstimatedTokens = entries.reduce((sum, entry) => sum + entry.estimatedTokens, 0);
  const maxTokens = options.maxTokens ?? 0;
  return { throughJournalSeq: Math.max(snapshot.throughJournalSeq, projection.throughJournalSeq), sessionId: projection.identity.sessionId, updatedAt: options.updatedAt ?? snapshot.updatedAt, basis: projection.basis === "request" || projection.request ? "current-request" : "last-request", requestId: projection.request?.requestId, estimator: { name: "context-engine-projection", version: "1" }, totalEstimatedTokens, maxTokens, percentUsed: maxTokens > 0 ? Math.min(100, totalEstimatedTokens / maxTokens * 100) : 0, buckets, entries };
}

function requestContextWindow(journal: readonly ContextProjectionEvent[]): number {
  const latestContext = [...journal].reverse().find((event) => event.type === "request/context");
  const contextData = latestContext && record(latestContext.data);
  const snapshot = contextData ? record(contextData.snapshot) : {};
  const prepared = record(snapshot.prepared);
  if (typeof prepared.contextWindow === "number" && Number.isSafeInteger(prepared.contextWindow) && prepared.contextWindow > 0) return prepared.contextWindow;
  const requestId = string(contextData?.requestId);
  const latestHeader = [...journal].reverse().find((event) => event.type === "request/header" && (requestId === undefined || string(record(event.data).requestId) === requestId));
  const header = latestHeader ? record(latestHeader.data) : {};
  return typeof header.contextWindow === "number" && Number.isSafeInteger(header.contextWindow) && header.contextWindow > 0 ? header.contextWindow : 0;
}


function record(value: RuntimeV2JsonValue | undefined): Readonly<Record<string, RuntimeV2JsonValue>> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, RuntimeV2JsonValue>> : {}; }
function string(value: RuntimeV2JsonValue | undefined): string | undefined { return typeof value === "string" ? value : undefined; }
function array(value: RuntimeV2JsonValue | undefined): readonly RuntimeV2JsonValue[] { return Array.isArray(value) ? value : []; }
function contextPreview(value: RuntimeV2JsonValue): string {
  const sanitized = sanitizeRuntimeContext(value);
  return (typeof sanitized === "string" ? sanitized : JSON.stringify(sanitized, null, 2) ?? "").trim();
}
function contextTokenText(value: RuntimeV2JsonValue): string { return (typeof value === "string" ? value : JSON.stringify(value) ?? "").trim(); }
function sanitizeRuntimeContext(value: RuntimeV2JsonValue): RuntimeV2JsonValue {
  if (typeof value === "string") return value.startsWith("<runtime_context>") ? "" : value;
  if (Array.isArray(value)) return value.flatMap((item) => isRuntimeContext(item) ? [] : [sanitizeRuntimeContext(item)]);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitizeRuntimeContext(child)]));
}
function isRuntimeContext(value: RuntimeV2JsonValue): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Readonly<Record<string, RuntimeV2JsonValue>>;
  if (record.type === "runtime-context") return true;
  return record.type === "text" && typeof record.text === "string" && record.text.startsWith("<runtime_context>");
}
function estimateTokens(value: string): number { if (!value) return 0; const ascii = [...value].filter(c => c.codePointAt(0)! <= 127).length; return Math.max(1, Math.ceil(ascii / 4 + value.length - ascii)); }
