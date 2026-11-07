import { describe, expect, it } from "vitest";
import { applyContextEstimate, contextEstimateSummaryKeys, foldContextEstimate, initialContextEstimate, viewContextEstimate, type ContextEstimateEvent, type ContextEstimateState } from "../context-estimate";
import { contextEntryKey, describeConversationEntries, describeStaticContextEntries, estimateConversationNode } from "../context-entries";
import { ESTIMATOR_VERSION } from "../token-estimate";

let seq = 0;
const at = (type: string, data: unknown, surface?: unknown): ContextEstimateEvent => ({ seq: seq++, type, time: `2026-11-06T00:00:${String(seq).padStart(2, "0")}Z`, data, ...(surface ? { surface } : {}) });
const user = (messageId: string, content: unknown) => at("user/message", { messageId, content: content }, { kind: "append" });
const prompt = (core: string) => at("request/system-prompt", {
  requestId: "r", turnId: "t", stepId: "s", digest: core, contributorProvenance: [],
  sections: [{ owner: "actspace.context-system", id: "core", order: 0, content: core }, { owner: "actspace.context-rules", id: "agents", order: 1, content: "rule" }],
  modelFacts: [{ owner: "runtime", id: "cwd", order: 0, content: { cwd: "/w" } }],
});
const tools = (names: string[]) => at("request/tools", { requestId: "r", turnId: "t", stepId: "s", digest: names.join(), tools: names.map(name => ({ name, description: `${name} tool`, inputSchema: {} })) });
const supplement = (data: Record<string, unknown>) => at("plugin/actspace.context/supplement", data);
const fold = (events: ContextEstimateEvent[]) => foldContextEstimate(events);

describe("contextEstimate fold", () => {
  it("matches the engine's describe for the same prompt, tools, supplements and conversation", () => {
    seq = 0;
    const nodes = [{ kind: "user", messageId: "u1", content: "hello there" }, { kind: "assistant", messageId: "a1", content: [{ type: "text", text: "hi" }, { type: "tool-call", callId: "c1", name: "read", arguments: "{\"p\":1}" }] }, { kind: "tool-result", messageId: "tool-c1", callId: "c1", content: "file body", isError: false }];
    const state = fold([
      at("request/header", { requestId: "r1", contextWindow: 1000 }), prompt("core prompt"), tools(["read", "write"]),
      supplement({ op: "add", owner: "paths", id: "active", text: "a.ts", lifetime: "persistent", afterEventSeq: -1 }),
      ...nodes.map(node => node.kind === "tool-result"
        ? at("tool/result", { callId: node.callId!, status: "completed", modelOutput: node.content }, { kind: "append" })
        : at(`${node.kind}/message`, { messageId: node.messageId, content: node.content }, { kind: "append" })),
    ]);
    // Supplements anchored on the empty conversation disappear once a message lands, like the engine's `retained`.
    const engine = [
      ...describeStaticContextEntries({ sections: [{ owner: "actspace.context-system", id: "core", order: 0, content: "core prompt" }, { owner: "actspace.context-rules", id: "agents", order: 1, content: "rule" }], modelFacts: [{ cwd: "/w" }], modelFactSources: [{ owner: "runtime", id: "cwd" }], tools: ["read", "write"].map(name => ({ name, description: `${name} tool`, inputSchema: {} })), supplements: [] }),
      ...describeConversationEntries(nodes, new Map()),
    ];
    const view = viewContextEstimate(state);
    expect(view.totalEstimatedTokens).toBe(engine.reduce((sum, item) => sum + item.entry.estimatedTokens, 0));
    expect(view.buckets.rules).toBeGreaterThan(0);
    expect(view.buckets.tools).toBe(engine.filter(item => item.entry.bucket === "tools").reduce((sum, item) => sum + item.entry.estimatedTokens, 0));
    expect(view.contextWindow).toBe(1000);
    expect(view.percentUsed).toBeCloseTo(view.totalEstimatedTokens / 10);
    expect(view.estimatorVersion).toBe(ESTIMATOR_VERSION);
    expect(view.entries.every(entry => entry.preview === undefined)).toBe(true);
  });

  it("replaces prompt and tool entries wholesale on each new record", () => {
    seq = 0;
    const first = fold([prompt("a".repeat(400)), tools(["read", "write", "bash"])]);
    const second = foldContextEstimate([prompt("short"), tools(["read"])], first);
    expect(viewContextEstimate(second).buckets.systemPrompt).toBeLessThan(viewContextEstimate(first).buckets.systemPrompt);
    expect(viewContextEstimate(second).entries.filter(entry => entry.bucket === "tools").map(entry => entry.title)).toEqual(["read"]);
  });

  it("adds and removes supplements and drops turn and request ones when they stop being visible", () => {
    seq = 0;
    let state = fold([user("u1", "x")]);
    state = foldContextEstimate([
      supplement({ op: "add", owner: "p", id: "keep", text: "persistent", lifetime: "persistent", afterEventSeq: 0 }),
      supplement({ op: "add", owner: "p", id: "turn", text: "turn", lifetime: "turn", turnId: "t", afterEventSeq: 0 }),
      supplement({ op: "add", owner: "p", id: "req", text: "request", lifetime: "request", turnId: "t", afterEventSeq: 0 }),
      supplement({ op: "bind", owner: "p", id: "req", requestId: "r", stepId: "s1" }),
    ], state);
    expect(state.supplements.map(value => value.id)).toEqual(["keep", "turn", "req"]);
    state = applyContextEstimate(state, at("step/end", { turnId: "t", stepId: "s1" }));
    expect(state.supplements.map(value => value.id)).toEqual(["keep", "turn"]);
    state = applyContextEstimate(state, at("turn/end", { turnId: "t" }));
    expect(state.supplements.map(value => value.id)).toEqual(["keep"]);
    state = applyContextEstimate(state, supplement({ op: "remove", owner: "p", id: "keep" }));
    expect(state.supplements).toEqual([]);
  });

  it("moves replaced conversation into the summary bucket using the event's replaced estimate", () => {
    seq = 0;
    const events = [user("u1", "a".repeat(40)), user("u2", "b".repeat(40)), user("u3", "c".repeat(40))];
    let state = fold(events);
    const replaced = estimateConversationNode({ kind: "user", messageId: "u1", content: "a".repeat(40) }) * 2;
    const summary = { kind: "user", messageId: "compaction-1", content: "summary" };
    const replace = (compactionId: string, node: typeof summary, sources: number[], tokens: { conversation: number; summarizedConversation: number }) =>
      at("surface/replaced", { compactionId, sourceEventSeqs: sources, replacedTokens: tokens, estimatorVersion: ESTIMATOR_VERSION, node }, { kind: "replace", start: 0, end: sources.length, sourceEventSeqs: sources });
    const first = replace("k1", summary, [0, 1], { conversation: replaced, summarizedConversation: 0 });
    state = applyContextEstimate(state, first);
    expect(state.conversation).toBe(estimateConversationNode({ kind: "user", messageId: "u3", content: "c".repeat(40) }));
    expect(state.summarizedConversation).toBe(estimateConversationNode(summary, "k1"));
    expect(contextEstimateSummaryKeys(state).get("compaction-1")).toBe("k1");
    // A second compaction folds the first summary in; its key disappears and only the new one remains.
    const second = { kind: "user", messageId: "compaction-2", content: "summary two" };
    state = applyContextEstimate(state, replace("k2", second, [0, 1, first.seq], { conversation: 0, summarizedConversation: estimateConversationNode(summary, "k1") }));
    expect(state.summaries.map(value => value.compactionId)).toEqual(["k2"]);
    expect(state.summarizedConversation).toBe(estimateConversationNode(second, "k2"));
  });

  it("returns the same state for events that do not change the estimate", () => {
    seq = 0;
    const state = fold([at("request/header", { requestId: "r1", contextWindow: 1000 }), prompt("p"), user("u1", "x")]);
    for (const type of ["assistant/chunk", "tool/call", "session/title-set", "step/start", "turn/start"]) expect(applyContextEstimate(state, at(type, { turnId: "t" }))).toBe(state);
    expect(applyContextEstimate(state, at("request/header", { requestId: "r1", contextWindow: 1000 }))).toBe(state);
    expect(applyContextEstimate(state, at("step/end", { turnId: "t", stepId: "s" }))).toBe(state);
  });

  it("keeps the state size independent of the message count", () => {
    seq = 0;
    const size = (messages: number): number => {
      let state: ContextEstimateState = fold([prompt("p"), tools(["read"])]);
      for (let index = 0; index < messages; index++) state = applyContextEstimate(state, user(`u${index}`, `message ${index}`));
      return JSON.stringify(state).length;
    };
    const small = size(10);
    expect(size(1000)).toBeLessThan(small + 40);
  });

  it("starts empty and keys supplements like the engine", () => {
    seq = 0;
    expect(viewContextEstimate(initialContextEstimate())).toMatchObject({ totalEstimatedTokens: 0, contextWindow: null, percentUsed: 0, requestId: null, throughJournalSeq: -1 });
    const state = fold([supplement({ op: "add", owner: "p", id: "x", text: "t", lifetime: "persistent", afterEventSeq: -1 })]);
    expect(state.supplements[0]!.entry.key).toBe(contextEntryKey("supplement", "p", "x"));
  });
});
