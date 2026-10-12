import { describe, expect, it } from "vitest";
import { apply } from "../plugin.js";
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
});
