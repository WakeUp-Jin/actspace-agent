import { expect, it, vi } from "vitest";
import { ContextSourceRegistry, type Context } from "@actspace/context-engine";
import type { SourceOptions } from "@actspace/prompt/source-support";
import { createSystemSource } from "../source.js";

it("invalidates selected system prompts on a configuration or model change in the same Turn", async () => {
  let prompt = "first";
  const registry = new ContextSourceRegistry();
  const source = createSystemSource({ prompt: { selectSystem: (request: Context["request"]) => `${request.model}:${prompt}` } } as SourceOptions);
  const get = vi.fn(source.get); registry.register({ ...source, get });
  const context: Context = { request: { sessionId: "s", turnId: "t", requestId: "r", routeId: "route", model: "model1", options: {} },
    content: { system: { sections: [], modelFacts: [] }, conversation: { entries: [], replaceGeneration: 0 }, supplements: [], tools: [] },
    status: { throughJournalSeq: 1, cycle: 0, paths: [], facts: [], plugins: {} } };
  await registry.apply(context); await registry.apply(context); expect(get).toHaveBeenCalledTimes(1);
  prompt = "second";
  expect(JSON.stringify((await registry.apply(context)).content.system)).toContain("model1:second");
  expect(JSON.stringify((await registry.apply({ ...context, request: { ...context.request, model: "model2" } })).content.system)).toContain("model2:second");
  expect(get).toHaveBeenCalledTimes(3);
});
