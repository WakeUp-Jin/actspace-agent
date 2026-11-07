import { expect, it } from "vitest";
import { contextEstimateUsage, describeConversationEntries, foldContextEstimate, viewContextEstimate, type ContextEstimateEvent, type ContextPanelView, type ManagedContextProjection } from "@actspace/shared";
import { ContextPanelService } from "../runtime-v2/context-panel-service";
import type { UsageReadModelService } from "../runtime-v2/usage-read-model";

const nodes = [
  { kind: "user", messageId: "u1", content: "inspect the repo" },
  { kind: "assistant", messageId: "a1", content: [{ type: "text", text: "reading" }, { type: "tool-call", callId: "c1", name: "read", arguments: "{}" }] },
  { kind: "tool-result", messageId: "tool-c1", callId: "c1", content: "file body", isError: false },
];
let seq = 0;
const at = (type: string, data: unknown, surface?: unknown): ContextEstimateEvent => ({ seq: seq++, type, time: "2026-11-06T00:00:00Z", data, ...(surface ? { surface } : {}) });
const estimate = viewContextEstimate(foldContextEstimate([
  at("request/header", { requestId: "r1", contextWindow: 100_000 }),
  at("request/system-prompt", { requestId: "r1", digest: "d", contributorProvenance: [], sections: [{ owner: "actspace.context-system", id: "core", order: 0, content: "core prompt" }], modelFacts: [] }),
  at("request/tools", { requestId: "r1", digest: "t", tools: [{ name: "read", description: "read a file", inputSchema: {} }] }),
  ...nodes.map(node => node.kind === "tool-result"
    ? at("tool/result", { callId: node.callId, status: "completed", modelOutput: node.content }, { kind: "append" })
    : at(`${node.kind}/message`, { messageId: node.messageId, content: node.content }, { kind: "append" })),
]));

function service(projection: ManagedContextProjection | null) {
  const values: Record<string, unknown> = { contextEstimate: estimate, surface: { entries: nodes.map(node => ({ node, sourceEventSeqs: [] })), replaceGeneration: 0 } };
  const runtime = { readContextProjection: async () => projection, readContextEntryText: async () => null, sessionQuerySource: async () => null, readSessionProjectionValue: async (_: string, key: string) => values[key] };
  return new ContextPanelService(runtime as never, {} as UsageReadModelService);
}

it("shows the same total in the ring and in the panel's current section", async () => {
  const view = await service(null).describe({ sessionId: "s" }) as ContextPanelView;
  expect(view.current).toMatchObject({ basis: "current-context", status: "ready", totalEstimatedTokens: contextEstimateUsage(estimate).totalTokens });
  expect(view.current.buckets).toEqual(estimate.buckets);
});

it("computes conversation entries from the journal surface when the engine is offline", async () => {
  const view = await service(null).describe({ sessionId: "s" }) as ContextPanelView;
  const conversation = view.current.entries.filter(entry => entry.bucket === "conversation");
  expect(conversation.map(entry => entry.key)).toEqual(describeConversationEntries(nodes, new Map()).map(item => item.entry.key));
  expect(conversation.reduce((sum, entry) => sum + entry.estimatedTokens, 0)).toBe(estimate.buckets.conversation);
  expect(view.current.entries.filter(entry => entry.bucket === "tools").map(entry => entry.title)).toEqual(["read"]);
});

it("uses the live engine's conversation entries and previews when it is online", async () => {
  const live = describeConversationEntries(nodes, new Map()).map(item => ({ ...item.entry, preview: "live preview" }));
  const projection = {
    schemaVersion: 1, identity: { sessionId: "s", logicalAgentScopeId: "main" }, basis: "current-context", contextRevision: 1, throughJournalSeq: 5, surfaceGeneration: 0, instanceGeneration: "g1", model: null,
    manifest: { schemaVersion: 1, estimatorVersion: estimate.estimatorVersion, comparable: true, totalEstimatedTokens: 0, buckets: {}, entries: live },
    content: { system: { sections: [], modelFacts: [] }, conversation: { replaceGeneration: 0, entries: [] }, supplements: [], tools: [] },
    status: { throughJournalSeq: 5, cycle: 0, paths: [], facts: [], plugins: {} },
  } as unknown as ManagedContextProjection;
  const view = await service(projection).describe({ sessionId: "s" }) as ContextPanelView;
  expect(view.current.entries.filter(entry => entry.bucket === "conversation").every(entry => entry.preview === "live preview")).toBe(true);
  expect(view.current.totalEstimatedTokens).toBe(estimate.totalEstimatedTokens);
});
