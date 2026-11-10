import { describe, expect, it, vi } from "vitest";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { apply as applyAssembly, type ContextAssemblyService } from "@actspace/context-assembly";
import { ContextCompactionCoordinator } from "@actspace/context-engine";
import { apply } from "../plugin.js";

async function tree(withHost: boolean) {
  const ctx = new CordisContextClass();
  const compaction = new ContextCompactionCoordinator();
  ctx.provide("context.engine", { compaction });
  ctx.provide("actspace.host.agent", withHost ? { contextDisclosure: { normalizeFile: async () => undefined, historyPath: async () => "", createIndex: vi.fn(), resolveArtifact: vi.fn() } } : {});
  await ctx.plugin({ apply: inner => applyAssembly(inner as never) });
  const assembly = ctx.get("context.assembly") as ContextAssemblyService;
  return { ctx, compaction, assembly };
}

describe("context disclosure plugin lifecycle", () => {
  it("disables cleanly when the optional host capability is absent", async () => {
    const { ctx, compaction, assembly } = await tree(false);
    await ctx.plugin({ apply: inner => apply(inner as never) });
    expect(ctx.get("context.disclosure")).toBeUndefined();
    expect(assembly.kinds("main")).not.toContain("disclosure");
    expect(compaction.hydrator()).toBeUndefined();
    await ctx.fiber.dispose();
    expect(ctx.get("context.disclosure")).toBeUndefined();
  });

  it("joins the engine through the coordinator and context.assembly, and leaves on dispose", async () => {
    const { ctx, compaction, assembly } = await tree(true);
    await ctx.plugin({ apply: inner => apply(inner as never) });
    expect(ctx.get("context.disclosure")).toBeDefined();
    expect(assembly.kinds("main")).toContain("disclosure");
    expect(assembly.kinds("subagent")).toContain("disclosure");
    expect(compaction.hydrator()).toBeDefined();
    await ctx.fiber.dispose();
    expect(assembly.kinds("main")).not.toContain("disclosure");
    expect(compaction.hydrator()).toBeUndefined();
  });

  it("rejects a tree without context.assembly", async () => {
    const ctx = new CordisContextClass();
    ctx.provide("context.engine", { compaction: new ContextCompactionCoordinator() });
    ctx.provide("actspace.host.agent", { contextDisclosure: {} });
    await expect(ctx.plugin({ apply: inner => apply(inner as never) })).rejects.toThrow("context.assembly");
  });
});
