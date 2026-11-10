import { describe, expect, it, vi } from "vitest";
import { apply } from "../plugin.js";
import type { ContextCompactionCoordinator } from "../compaction.js";
import { CordisContextClass } from "@actspace/cordis-adapter";
import type { ContextRequest } from "../types.js";

const request: ContextRequest = { sessionId: "s", logicalAgentScopeId: "main:s", requestId: "r", routeId: "default", model: "model", options: {} };

describe("context plugin lifecycle", () => {

  it("owns its engine factory through the Cordis lifecycle", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: (inner) => apply(inner as never) });
    expect(ctx.get("context.engine")).toHaveProperty("create");
    await ctx.fiber.dispose();
    expect(ctx.get("context.engine")).toBeUndefined();
  });

  it("publishes a read-only projection from the Harness registry", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: (inner) => apply(inner as never) });
    const service = ctx.get("context.engine") as { create(options: { resolve: (request: ContextRequest) => unknown }): { getContext(request: ContextRequest): Promise<unknown> }; getProjection(sessionId: string, scope?: string): { identity: { sessionId: string } } | undefined };
    const engine = service.create({ resolve: input => ({ request: input, content: { system: { sections: [], modelFacts: [] }, conversation: { replaceGeneration: 0, entries: [] }, supplements: [], tools: [] }, status: { throughJournalSeq: 0, cycle: 0, paths: [], facts: [], plugins: {} } }) });
    await engine.getContext(request);
    expect(service.getProjection("s", "main:s")).toMatchObject({ identity: { sessionId: "s", logicalAgentScopeId: "main:s" } });
    await ctx.fiber.dispose();
  });

  it("hydrates every engine with the disclosure registered on the coordinator", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: (inner) => apply(inner as never) });
    const service = ctx.get("context.engine") as { compaction: ContextCompactionCoordinator; create(options: { resolve: (request: ContextRequest) => unknown; session?: unknown }): { getContext(request: ContextRequest): Promise<{ status: { cycle: number } }> } };
    const resolve = (input: ContextRequest) => ({ request: input, content: { system: { sections: [], modelFacts: [] }, conversation: { replaceGeneration: 0, entries: [] }, supplements: [], tools: [] }, status: { throughJournalSeq: 0, cycle: 0, paths: [], facts: [], plugins: {} } });
    const session = { header: { sessionId: "s", lineage: null }, lastSeq: 0, append: async () => 0, appendMany: async () => 0, flush: async () => {} };
    const hydrate = vi.fn(async (context: { status: { cycle: number } }) => ({ ...context, status: { ...context.status, cycle: 7 } }));
    const remove = service.compaction.registerDisclosure({ hydrate, recover: async () => {}, prepare: async () => {}, applied: async () => {} } as never);
    expect((await service.create({ resolve, session }).getContext(request)).status.cycle).toBe(7);
    expect(hydrate).toHaveBeenCalledTimes(1);
    remove();
    expect((await service.create({ resolve, session }).getContext(request)).status.cycle).toBe(0);
    await ctx.fiber.dispose();
  });
});
