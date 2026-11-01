import { describe, expect, it } from "vitest";
import { projectManagedContextState, type ManagedContextProjection } from "../context-projection";

const projection: ManagedContextProjection = {
  schemaVersion: 1,
  identity: { sessionId: "s1", logicalAgentScopeId: "main:s1" },
  basis: "current-context",
  contextRevision: 3,
  throughJournalSeq: 11,
  surfaceGeneration: 2,
  request: { requestId: "r2", routeId: "default", model: "model-b" },
  content: {
    system: { sections: [
      { id: "rule-1", owner: "actspace.context-rules", order: 20, content: "Keep answers concise." },
      { id: "identity", owner: "actspace.context-system", order: 0, content: "You are an agent." },
    ], modelFacts: [{ provider: "test" }] },
    conversation: { replaceGeneration: 2, entries: [{ node: { kind: "user", messageId: "m1", content: "hello" }, sourceEventSeqs: [10] }] },
    supplements: [{ id: "runtime", owner: "actspace.context-runtime", sourceEventSeq: -1, afterEventSeq: -1, text: "mode=agent" }],
    tools: [{ name: "read_file", description: "Read a file", inputSchema: {} }],
  },
  status: { throughJournalSeq: 11, cycle: 0, paths: [{ path: "src/app.ts" }], facts: [], plugins: {} },
};

describe("managed Context Projection adapter", () => {
  it("preserves engine content and maps it to UI buckets", () => {
    const state = projectManagedContextState({ sessionId: "s1", throughJournalSeq: 11, updatedAt: "2026-10-11T00:00:00Z" }, projection, { maxTokens: 200_000 });
    expect(state.sessionId).toBe("s1");
    expect(state.requestId).toBe("r2");
    expect(state.buckets.find(bucket => bucket.name === "rules")?.tokens).toBeGreaterThan(0);
    expect(state.buckets.find(bucket => bucket.name === "tools")?.tokens).toBeGreaterThan(0);
    expect(state.entries.map(entry => entry.title)).toEqual(expect.arrayContaining(["rule-1", "runtime", "read_file", "user 1", "Context references"]));
    expect(state.maxTokens).toBe(200_000);
    expect(state.basis).toBe("current-request");
  });
});
