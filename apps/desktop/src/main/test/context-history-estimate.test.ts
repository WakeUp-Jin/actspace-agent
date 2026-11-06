// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { SessionQuerySource } from "@actspace/session-storage";
import { ESTIMATOR_VERSION, estimateConversationNode, foldContextEstimate, viewContextEstimate, type ContextPanelView } from "@actspace/shared";
import { createReadModelSchema } from "../runtime-v2/usage-read-model-schema";
import { commitContextBatch } from "../runtime-v2/context-history-projection";
import { queryContextHistory } from "../runtime-v2/context-history-query";
import { ContextPanelService } from "../runtime-v2/context-panel-service";
import type { UsageReadModelService } from "../runtime-v2/usage-read-model";

const SESSION = "s";
const source = (throughSeq: number) => ({ header: { sessionId: SESSION, createdAt: "2026-11-06T00:00:00.000Z" }, throughSeq, stamp: `stamp-${throughSeq}`, codecSetDigest: "codec" }) as unknown as SessionQuerySource;

/** 两次请求之间：工具变了一次、追加了对话、压缩了一次。 */
function journal() {
  const events: SessionEventEnvelopeV1[] = [];
  const e = (type: string, data: Record<string, unknown>, surface: unknown = null) => { const seq = events.length; events.push({ recordKind: "event", seq, type, eventVersion: 1, criticality: "required", time: new Date(Date.parse("2026-11-06T00:00:00.000Z") + seq * 1000).toISOString(), source: { ownerPluginId: "@actspace/core" }, data, surface, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } } as unknown as SessionEventEnvelopeV1); return seq; };
  const user = (messageId: string, text: string) => e("user/message", { messageId }, { kind: "append", node: { kind: "user", messageId, content: text } });
  const request = (requestId: string, tools: string[] | null) => {
    e("request/header", { requestId, turnId: "t", stepId: requestId, routeId: "p", model: "m", contextWindow: 10_000 });
    if (requestId === "r1") e("request/system-prompt", { requestId, turnId: "t", stepId: requestId, digest: "p", contributorProvenance: [], sections: [{ owner: "actspace.context-system", id: "core", order: 0, content: "core prompt" }], modelFacts: [] });
    if (tools) e("request/tools", { requestId, turnId: "t", stepId: requestId, digest: tools.join(), tools: tools.map(name => ({ name, description: `${name} tool`, inputSchema: {} })) });
    return e("request/context", { requestId, turnId: "t", stepId: requestId, snapshot: { schemaVersion: 3, prepared: { route: "p", model: "m" }, contextModel: { modelKey: "p/m", label: "m", contextWindow: 10_000 } } });
  };
  e("turn/start", { turnId: "t" });
  const u1 = user("u1", "a".repeat(4000));
  request("r1", ["read"]);
  const u2 = user("u2", "b".repeat(4000));
  request("r2", ["read", "write"]);
  const replaced = estimateConversationNode({ kind: "user", messageId: "u1", content: "a".repeat(4000) }) + estimateConversationNode({ kind: "user", messageId: "u2", content: "b".repeat(4000) });
  e("compaction/start", { compactionId: "k1" });
  e("surface/replaced", { compactionId: "k1", sourceEventSeqs: [u1, u2], replacedTokens: { conversation: replaced, summarizedConversation: 0 }, estimatorVersion: ESTIMATOR_VERSION }, { kind: "replace", start: 0, end: 2, node: { kind: "user", messageId: "summary-k1", content: "short summary" }, sourceEventSeqs: [u1, u2] });
  e("compaction/end", { compactionId: "k1" });
  const lastRequest = request("r3", null);
  const u3 = user("u3", "next question");
  return { events, lastRequest, u3 };
}

async function indexed(batch = Infinity) {
  const db = new DatabaseSync(":memory:"); createReadModelSchema(db);
  const { events } = journal();
  for (let index = 0; index < events.length; index += batch === Infinity ? events.length : batch) {
    const slice = events.slice(index, index + (batch === Infinity ? events.length : batch));
    await commitContextBatch(db, source(events.length - 1), slice, `c${index}`, index === 0, index + slice.length >= events.length, index === 0, async () => undefined);
  }
  return queryContextHistory(db, SESSION)!;
}

it("records the tools-changed event from each request/tools after the first", async () => {
  const result = await indexed();
  expect(result.events.filter(event => event.kind === "tools-changed")).toHaveLength(1);
});

it("records each request's buckets from the shared fold and drops the total after compaction", async () => {
  const result = await indexed();
  const { events } = journal();
  const expected = (requestId: string) => viewContextEstimate(foldContextEstimate(events.slice(0, events.findIndex(event => event.type === "request/context" && (event.data as { requestId: string }).requestId === requestId) + 1)));
  expect(result.trend.map(point => point.requestId)).toEqual(["r1", "r2", "r3"]);
  for (const point of result.trend) {
    expect(point.estimatedTokens).toBe(expected(point.requestId).totalEstimatedTokens);
    expect(point.buckets).toEqual(expected(point.requestId).buckets);
  }
  expect(result.trend[1]!.buckets.tools).toBeGreaterThan(result.trend[0]!.buckets.tools!);
  expect(result.trend[2]!.estimatedTokens).toBeLessThan(result.trend[1]!.estimatedTokens);
  expect(result.trend[2]!.buckets.summarizedConversation).toBeGreaterThan(0);
  expect(result.previous?.entries.every(entry => entry.bucket !== "conversation")).toBe(true);
});

it("gives the same history when the journal is indexed in small batches", async () => {
  const whole = await indexed();
  const split = await indexed(3);
  expect({ trend: split.trend, events: split.events, previous: split.previous }).toEqual({ trend: whole.trend, events: whole.events, previous: whole.previous });
});

it("marks conversation entries after the previous request as new", async () => {
  const result = await indexed();
  const { events } = journal();
  const surface = { entries: [] as { node: unknown; sourceEventSeqs: number[] }[] };
  for (const event of events) {
    const op = event.surface as { kind: string; node: unknown; start?: number; end?: number; sourceEventSeqs?: number[] } | null;
    if (op?.kind === "append") surface.entries.push({ node: op.node, sourceEventSeqs: [event.seq] });
    if (op?.kind === "replace") surface.entries.splice(op.start!, op.end! - op.start!, { node: op.node, sourceEventSeqs: [...op.sourceEventSeqs!, event.seq] });
  }
  const estimate = viewContextEstimate(foldContextEstimate(events));
  const values: Record<string, unknown> = { contextEstimate: estimate, surface };
  const runtime = { readContextProjection: async () => null, readContextEntryText: async () => null, sessionQuerySource: async () => source(events.length - 1), readSessionProjectionValue: async (_: string, key: string) => values[key] };
  const history = { contextHistory: () => ({ result, syncing: false }), releaseContext: () => undefined } as unknown as UsageReadModelService;
  const view = await new ContextPanelService(runtime as never, history).describe({ sessionId: SESSION }) as ContextPanelView;
  const previousKeys = new Set(view.previous!.entries.map(entry => entry.key));
  const current = view.current.entries.filter(entry => entry.bucket === "conversation" || entry.bucket === "summarizedConversation");
  // 摘要在 r3 之前就在；u3 在 r3 之后才出现。
  expect(current.filter(entry => !previousKeys.has(entry.key)).map(entry => entry.trajectoryRef?.messageId)).toEqual(["u3"]);
  expect(current.filter(entry => previousKeys.has(entry.key)).map(entry => entry.bucket)).toEqual(["summarizedConversation"]);
});
