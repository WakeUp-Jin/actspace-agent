import { createHash } from "node:crypto";
import type { ContextContentManifest, ContextPanelEntry, ContextPanelBucketKey } from "@actspace/shared";
import type { Context, LlmInput } from "./types.js";
import { renderSystemPrompt } from "./system.js";

export const CONTEXT_ESTIMATOR_VERSION = "context-content-1";
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function contextText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}
/** A deliberately deterministic character estimate, not provider billing. */
export function estimateContextTokens(value: unknown): number { return Math.ceil(contextText(value).length / 4); }
export const contextEntryKey = (...parts: string[]) => JSON.stringify(parts);
export function contentFingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export function describeContextContent(context: Context): { manifest: ContextContentManifest; text: ReadonlyMap<string, string> } {
  const entries: ContextPanelEntry[] = []; const texts = new Map<string, string>();
  const add = (entry: Omit<ContextPanelEntry, "estimatedTokens">, value: unknown) => {
    const text = contextText(value);
    if (!text) return;
    const browseable = entry.bucket !== "conversation" && entry.bucket !== "summarizedConversation";
    entries.push({ ...entry, title: entry.title.slice(0, 80), estimatedTokens: estimateContextTokens(text), ...(browseable ? { preview: text.slice(0, 600), fullTextAvailable: true } : {}) });
    if (browseable) texts.set(entry.key, text);
  };
  for (const section of [...context.content.system.sections].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) {
    const bucket: ContextPanelBucketKey = ["actspace.context-rules", "rules"].includes(section.owner) ? "rules" : section.owner === "actspace.context-skills" ? "skills" : "systemPrompt";
    if (bucket === "skills" && Array.isArray(section.content) && section.content.every(value => typeof record(value).id === "string")) {
      for (const value of section.content) add({ key: contextEntryKey("skill", section.owner, section.id, String(record(value).id)), bucket, title: String(record(value).id), source: section.owner }, value);
      continue;
    }
    // A source section already has a stable plugin/id identity. Skill invocation
    // and catalog use different section ids supplied by that plugin.
    add({ key: contextEntryKey("section", section.owner, section.id), bucket, title: section.id, source: section.owner }, typeof section.content === "string" ? section.content.trim() : section.content);
  }
  if (context.content.system.modelFacts.length) {
    const unknown: typeof context.content.system.modelFacts[number][] = [];
    context.content.system.modelFacts.forEach((fact, index) => {
      const source = context.content.system.modelFactSources?.[index];
      if (source?.owner === "actspace.context-skills" && source.id === "core/skills-catalog" && Array.isArray(fact) && fact.every(value => typeof record(value).id === "string")) {
        for (const value of fact) add({ key: contextEntryKey("skill", source.owner, source.id, String(record(value).id)), bucket: "skills", title: String(record(value).name ?? record(value).id), source: source.owner }, value);
      } else unknown.push(fact);
    });
    add({ key: contextEntryKey("model-facts"), bucket: "systemPrompt", title: "模型运行信息" }, renderSystemPrompt([], unknown.length ? unknown : [[]]));
  }
  for (const tool of context.content.tools) add({ key: contextEntryKey("tool", String(record(tool).pluginId ?? "tools"), tool.name), bucket: "tools", title: tool.name }, tool);
  for (const supplement of context.content.supplements) add({ key: contextEntryKey("supplement", supplement.owner, supplement.id), bucket: "systemPrompt", title: supplement.id, source: supplement.owner }, `<runtime_context owner=${JSON.stringify(supplement.owner)} id=${JSON.stringify(supplement.id)}>\n${supplement.text}\n</runtime_context>`);
  const summaries = new Map(((record(context.status.plugins["actspace.context.compaction"]).summaries as { messageId: string; compactionId: string }[] | undefined) ?? []).map(value => [value.messageId, value.compactionId]));
  const summaryIds = new Set((record(context.status.plugins["actspace.context.compaction"]).summaryIds as string[] | undefined) ?? []);
  for (const { node } of context.content.conversation.entries) {
    const summary = summaries.has(node.messageId) || summaryIds.has(node.messageId);
    const bucket = summary ? "summarizedConversation" : "conversation";
    const ref = node.kind === "tool-result" ? { callId: node.callId } : { messageId: node.messageId };
    const base = { bucket, trajectoryRef: ref } as const;
    if (node.kind === "assistant" && Array.isArray(node.content)) {
      const normal = node.content.filter(part => !["reasoning", "tool-call"].includes(String(record(part).type)));
      if (normal.length) add({ ...base, key: contextEntryKey("message", node.messageId), kind: "assistant", title: "模型回复" }, normal);
      const thinking = node.content.filter(part => record(part).type === "reasoning");
      if (thinking.length) add({ ...base, key: contextEntryKey("thinking", node.messageId), kind: "thinking", title: "思考" }, thinking);
      for (const call of node.content.filter(part => record(part).type === "tool-call")) {
        const block = record(call);
        add({ ...base, key: contextEntryKey("tool-call", String(block.callId)), kind: "tool-call", title: String(block.name ?? "工具调用"), trajectoryRef: { callId: String(block.callId) } }, call);
      }
    } else add({ ...base, key: contextEntryKey(node.kind === "tool-result" ? "tool-result" : summary ? "summary" : "message", node.kind === "tool-result" ? node.callId : summaries.get(node.messageId) ?? node.messageId), kind: node.kind, title: summary ? "压缩摘要" : node.kind === "user" ? "用户消息" : node.kind === "assistant" ? "模型回复" : "工具结果" }, node.content);
  }
  const buckets: ContextContentManifest["buckets"] = {};
  for (const entry of entries) buckets[entry.bucket] = (buckets[entry.bucket] ?? 0) + entry.estimatedTokens;
  return { manifest: { schemaVersion: 1, estimatorVersion: CONTEXT_ESTIMATOR_VERSION, comparable: true, totalEstimatedTokens: entries.reduce((sum, entry) => sum + entry.estimatedTokens, 0), buckets, entries }, text: texts };
}

/** Stable provenance survives prepare only when the actual input is unchanged.
 * Adapter/hook rewrites keep honest totals but cannot fabricate source matches. */
export function requestContentManifest(context: Context, input: LlmInput, original?: LlmInput): ContextContentManifest {
  const manifest = (original && inputManifests.get(original)) ?? describeContextContent(context).manifest;
  const changed = original && (contentFingerprint([input.messages, input.tools]) !== contentFingerprint([original.messages, original.tools]));
  if (changed) {
    const buckets: ContextContentManifest["buckets"] = { systemPrompt: 0, tools: 0, conversation: 0 };
    for (const message of input.messages) { const bucket = message.role === "system" ? "systemPrompt" : "conversation"; buckets[bucket]! += estimateContextTokens(message.content); }
    for (const tool of input.tools) buckets.tools! += estimateContextTokens(tool);
    return { ...manifest, comparable: false, comparisonUnavailableReason: "prepared-input-changed", buckets, totalEstimatedTokens: Object.values(buckets).reduce((a, b) => a + b, 0), entries: [] };
  }
  return { ...manifest, entries: manifest.entries.map(({ preview: _preview, fullTextAvailable: _full, source: _source, ...entry }) => entry) };
}

const inputManifests = new WeakMap<LlmInput, ContextContentManifest>();
export function rememberInputManifest(context: Context, input: LlmInput, converted: readonly { message: import("@actspace/llm-service").LlmMessage; origin: { messageId?: string; supplementKey?: string } | null }[]): void {
  const { manifest } = describeContextContent(context);
  const entries = new Map(manifest.entries.map(entry => [entry.key, { ...entry }]));
  const update = (entryKey: string, content: unknown, fallback?: ContextPanelEntry) => {
    const entry = entries.get(entryKey) ?? fallback;
    if (entry) entries.set(entryKey, { ...entry, estimatedTokens: estimateContextTokens(content) });
  };
  for (const { message, origin } of converted) {
    if (origin?.supplementKey) { update(origin.supplementKey, message.content); continue; }
    if (message.role === "tool" && message.callId) {
      const entryKey = contextEntryKey("tool-result", message.callId);
      update(entryKey, message.content, { key: entryKey, bucket: "conversation", kind: "tool-result", title: "工具结果（未记录）", trajectoryRef: { callId: message.callId }, estimatedTokens: 0 });
    } else if (origin?.messageId) {
      const id = origin.messageId;
      if (message.role === "assistant" && Array.isArray(message.content)) {
        update(contextEntryKey("message", id), message.content.filter(part => part.type !== "reasoning" && part.type !== "tool-call"));
        update(contextEntryKey("thinking", id), message.content.filter(part => part.type === "reasoning"));
        for (const part of message.content) if (part.type === "tool-call") update(contextEntryKey("tool-call", part.callId), part);
      } else {
        update(contextEntryKey("message", id), message.content);
        for (const entry of entries.values()) if (entry.bucket === "summarizedConversation" && entry.trajectoryRef?.messageId === id) update(entry.key, message.content);
      }
    }
  }
  const values = [...entries.values()]; const buckets: ContextContentManifest["buckets"] = {};
  for (const entry of values) buckets[entry.bucket] = (buckets[entry.bucket] ?? 0) + entry.estimatedTokens;
  inputManifests.set(input, { ...manifest, entries: values, buckets, totalEstimatedTokens: values.reduce((total, entry) => total + entry.estimatedTokens, 0) });
}
