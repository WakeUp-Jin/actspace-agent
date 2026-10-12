import { expect, it } from "vitest";
import { ContextEngine } from "../engine.js";
import type { Context } from "../types.js";

it("puts an anchored supplement after all results in a multi-call batch", async () => {
  const context: Context = { request: { sessionId: "s", requestId: "r", routeId: "route", model: "model", options: {} },
    content: { system: { sections: [], modelFacts: [] }, tools: [], conversation: { replaceGeneration: 0, entries: [
      { node: { kind: "assistant", messageId: "a", content: [{ type: "tool-call", callId: "a", name: "read", arguments: "{}" }, { type: "tool-call", callId: "b", name: "read", arguments: "{}" }] }, sourceEventSeqs: [2] },
      { node: { kind: "tool-result", messageId: "ta", callId: "a", content: "one", isError: false }, sourceEventSeqs: [3] },
      { node: { kind: "tool-result", messageId: "tb", callId: "b", content: "two", isError: true }, sourceEventSeqs: [4] },
      { node: { kind: "user", messageId: "u", content: "next" }, sourceEventSeqs: [6] },
    ] }, supplements: [{ id: "mode", owner: "runtime", sourceEventSeq: 5, afterEventSeq: 2, text: "current state" }] },
    status: { throughJournalSeq: 6, cycle: 0, paths: [], facts: [], plugins: {} } };
  const engine = new ContextEngine({ resolve: () => context });
  const input = await engine.toLlmInput(context);
  expect(input.messages.map(message => message.role)).toEqual(["assistant", "tool", "tool", "user", "user"]);
  expect(input.messages[3]!.content).toContain('owner="runtime"');
  expect(input.messages[4]!.content).toBe("next");
  expect(context.content.conversation.entries).toHaveLength(4);
});
