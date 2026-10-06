import { expect, it } from "vitest";
import { ContextEngine } from "../engine.js";
import type { Context, ContextRequest } from "../types.js";

const request: ContextRequest = { sessionId: "s", requestId: "r", routeId: "route", model: "model", options: { reasoning: true } };
function fixture(): Context {
  return { request, content: {
    system: { sections: [{ id: "second", owner: "system", order: 2, content: "Second" }, { id: "first", owner: "system", order: 1, content: "First" }], modelFacts: [] },
    conversation: { entries: [{ node: { kind: "user", messageId: "u", content: "Hello" }, sourceEventSeqs: [3] }], replaceGeneration: 4 }, supplements: [], tools: [],
  }, status: { throughJournalSeq: 8, cycle: 2, paths: [{ id: "private", path: "/do-not-inject", owners: ["tools"], visibility: "active", readsInCycle: 9, addedCycle: 1 }], facts: [], plugins: { internal: { flag: true } } } };
}

it("converts a detached frozen Context without changing its source or leaking state", async () => {
  const original = fixture(); const before = JSON.stringify(original); let reads = 0;
  const engine = new ContextEngine({ resolve: () => { reads++; return original; } });
  const context = await engine.getContext(request);
  const result = await engine.toLlmInput(context);
  expect(result).toEqual({ ...request, messages: [{ role: "system", content: "First\n\nSecond" }, { role: "user", content: "Hello" }], tools: [] });
  expect(reads).toBe(1);
  expect(JSON.stringify(original)).toBe(before);
  expect(context).not.toBe(original);
  expect(Object.isFrozen(context.content.conversation.entries[0]!.node)).toBe(true);
  expect(JSON.stringify(result)).not.toContain("do-not-inject");
  expect(JSON.stringify(result)).not.toContain("throughJournalSeq");
});

it("rejects mismatched request identity before it reaches the model", async () => {
  const engine = new ContextEngine({ resolve: () => fixture() });
  await expect(engine.getContext({ ...request, sessionId: "another" })).rejects.toThrow("identity");
});
