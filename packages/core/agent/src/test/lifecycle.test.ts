import { describe, expect, it } from "vitest";
import { apply } from "../plugin.js";
import { AgentRegistryService } from "../registry.js";
import { CordisContextClass } from "@actspace/cordis-adapter";

describe("core agent plugin lifecycle", () => {

  it("owns the Agent registry through a Cordis Service", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: (inner) => apply(inner as never) });
    expect(ctx.get("agent.registry")).toBeInstanceOf(AgentRegistryService);
    await ctx.fiber.dispose();
    expect(ctx.get("agent.registry")).toBeUndefined();
  });
});
