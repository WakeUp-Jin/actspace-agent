import { describe, expect, it } from "vitest";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { apply as applyAssembly, type ContextAssemblyService } from "@actspace/context-assembly";
import { apply } from "../plugin.js";

describe("context runtime plugin lifecycle", () => {
  it("registers with context.assembly, publishes and disposes its source factory", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: (inner) => applyAssembly(inner as never) });
    const assembly = ctx.get("context.assembly") as ContextAssemblyService;
    await ctx.plugin({ apply: (inner) => apply(inner as never) });
    expect(ctx.get("context.source.runtime")).toHaveProperty("create");
    expect(assembly.kinds("main")).toContain("runtime");
    expect(assembly.kinds("subagent")).toContain("runtime");
    await ctx.fiber.dispose();
    expect(ctx.get("context.source.runtime")).toBeUndefined();
  });

  it("rejects a tree without context.assembly", async () => {
    const ctx = new CordisContextClass();
    await expect(ctx.plugin({ apply: (inner) => apply(inner as never) })).rejects.toThrow("requires context.assembly");
  });
});
