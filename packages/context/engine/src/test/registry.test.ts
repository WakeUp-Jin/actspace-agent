import { expect, it } from "vitest";
import { ContextSourceRegistry, type ContextSource } from "../registry.js";
import type { Context } from "../types.js";

const base: Context = { request: { sessionId: "s", requestId: "r", routeId: "route", model: "model", options: {} },
  content: { system: { sections: [], modelFacts: [] }, conversation: { entries: [], replaceGeneration: 0 }, tools: [], supplements: [] },
  status: { throughJournalSeq: -1, cycle: 0, paths: [], facts: [], plugins: {} } };
const source = (id: string, order = 0): ContextSource => ({ id, owner: id, order, criticality: "required", fields: ["system"],
  get: (_, contribute) => contribute({ system: { sections: [{ id, owner: id, order, content: id }], modelFacts: [] } }) });

it("orders and disposes sources without crossing registry boundaries", async () => {
  const first = new ContextSourceRegistry(); const second = new ContextSourceRegistry();
  const remove = first.register(source("late", 2)); first.register(source("early", 1));
  expect(() => first.register(source("late"))).toThrow("Duplicate");
  expect((await first.apply(base)).content.system.sections.map(section => section.id)).toEqual(["early", "late"]);
  remove(); remove();
  expect((await first.apply(base)).content.system.sections.map(section => section.id)).toEqual(["early"]);
  expect((await second.apply(base)).content.system.sections).toEqual([]);
});

it("rejects owner impersonation and undeclared writes; optional failure commits no partial output", async () => {
  const registry = new ContextSourceRegistry();
  registry.register({ ...source("optional"), criticality: "optional", get: (_, write) => {
    write({ system: { sections: [{ id: "valid", owner: "optional", order: 0, content: "partial" }], modelFacts: [] } });
    write({ tools: [] });
  } });
  expect((await registry.apply(base)).content.system.sections).toEqual([]);
  registry.register({ ...source("bad"), get: (_, write) => write({ system: { sections: [{ id: "x", owner: "other", order: 0, content: "bad" }], modelFacts: [] } }) });
  await expect(registry.apply(base)).rejects.toThrow("Required context source bad failed");
});

it("freezes source inputs and expires the contribution callback", async () => {
  const registry = new ContextSourceRegistry(); let callback: Parameters<ContextSource["get"]>[1] | undefined;
  registry.register({ ...source("test"), get: (context, write) => { expect(Object.isFrozen(context.status)).toBe(true); callback = write; } });
  await registry.apply(base);
  expect(() => callback!({})).toThrow("after completion");
});

it("accepts a tool contribution from an independently named extension", async () => {
  const registry = new ContextSourceRegistry();
  registry.register({ id: "context-conversation", owner: "conversation", order: 0, fields: ["conversation"], criticality: "required", get: (context, write) => write({ conversation: context.content.conversation }) });
  registry.register({ id: "future-tools", owner: "future", order: 1, fields: ["tools"], criticality: "required", get: (_context, write) => write({ tools: [{ name: "future", description: "Future tool", inputSchema: {} }] }) });
  const context = { request: { sessionId: "s", requestId: "r", routeId: "r", model: "m", options: {} }, content: { system: { sections: [], modelFacts: [] }, conversation: { entries: [], replaceGeneration: 0 }, supplements: [], tools: [] }, status: { throughJournalSeq: -1, cycle: 0, paths: [], facts: [], plugins: {} } };
  expect((await registry.apply(context)).content.tools.map(tool => tool.name)).toEqual(["future"]);
});
