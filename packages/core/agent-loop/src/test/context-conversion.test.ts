import { expect, it } from "vitest";
import type { LlmMessage } from "@actspace/llm-service";
import { runToolStreamFixture } from "../testing.js";

it("preserves historical summaries, signed reasoning, attachments and runtime blocks in the final request snapshot", async () => {
  let messages: readonly LlmMessage[] = [];
  const historical = [
    { type: "text", text: "Earlier summary" },
    { type: "reasoning", text: "verified reasoning", signature: "signature", replay: { provider: "test", value: "opaque" } },
  ];
  const run = await runToolStreamFixture({ terminalOnly: true, thinkingEnabled: true,
    seedSession: async session => {
      await session.append({ type: "assistant/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" },
        data: { messageId: "summary", content: historical }, surface: { kind: "append", node: { kind: "assistant", messageId: "summary", content: historical } } });
    },
    content: [
      { type: "text", text: "Continue" },
      { type: "artifact", artifact: { artifactId: "image", mediaType: "image/png" }, label: "Screenshot" },
      { type: "artifact", artifact: { artifactId: "note", mediaType: "text/plain" }, label: "Notes", text: "inline attachment" },
      { type: "runtime-context", context: { prior: true } },
    ],
    onMessages: value => { messages = value; },
  });
  expect(messages[0]).toEqual({ role: "assistant", content: historical });
  expect(messages[1]).toEqual({ role: "user", content: [
    { type: "text", text: "Continue" },
    { type: "image", artifactId: "image", mimeType: "image/png", alt: "Screenshot" },
    { type: "text", text: '<attached_file name="Notes" media_type="text/plain">\ninline attachment\n</attached_file>' },
    { type: "text", text: '<runtime_context>{"prior":true}</runtime_context>' },
    { type: "text", text: '<runtime_context>{"agentMode":"agent","agentModeRevision":0}</runtime_context>' },
  ] });
  const snapshot = (run.journal.find(event => event.type === "request/context")!.data as any).snapshot;
  expect(snapshot.schemaVersion).toBe(2);
  expect(snapshot.messages).toEqual(messages);
  expect(snapshot.prepared).toMatchObject({ model: "test", route: "test", adapterVersion: "test", contextWindow: null });
});

it("keeps a rejected batch's multiple tool results paired in the next input", async () => {
  const requests: (readonly LlmMessage[])[] = [];
  await runToolStreamFixture({ extraToolCall: true, onMessages: value => requests.push(value) });
  const next = requests[1]!;
  expect(next.map(message => message.role)).toEqual(["user", "assistant", "tool", "tool"]);
  expect(next.slice(-2).map(message => message.callId)).toEqual(["read-1", "unknown-2"]);
  expect(JSON.stringify(next.slice(-2))).toContain("No tools in this batch were executed");
});

it("reselects the model prompt when a request intervention changes the model", async () => {
  const { ContextSourceRegistry } = await import("@actspace/context");
  const sources = new ContextSourceRegistry();
  sources.register({ id: "model", owner: "model", order: 0, fields: ["system"], criticality: "required", get: (context, write) => write({ system: { sections: [{ id: "model", owner: "model", order: 0, content: `Prompt for ${context.request.model}` }], modelFacts: [] } }) });
  let messages: readonly LlmMessage[] = [];
  const run = await runToolStreamFixture({ terminalOnly: true, contextSources: sources, onMessages: value => { messages = value; }, context: {
    get: () => ({ flush: async () => {} }),
    waterfall: async (type, _payload, next) => { const result = await (next as () => Promise<object>)(); return type === "agent/request" ? { ...result, model: "selected-model" } : result; },
  } });
  expect(messages[0]).toEqual({ role: "system", content: "Prompt for selected-model" });
  const snapshot = (run.journal.find(event => event.type === "request/context")!.data as any).snapshot;
  expect(snapshot.renderedSystemPrompt).toBe("Prompt for selected-model");
  expect(snapshot.prepared.model).toBe("selected-model");
});
