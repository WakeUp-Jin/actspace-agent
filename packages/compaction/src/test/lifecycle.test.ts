import { describe, expect, it } from "vitest";
import { activate, apply, CompactionPlugin, CompactionService } from "../plugin.js";
import { CordisContextClass } from "@actspace/cordis-adapter";

describe("compaction plugin lifecycle", () => {
  it("publishes the compaction behavior entry and disposes", async () => {
    const activation = activate();
    expect(activation.services?.["compaction.surface"]).toMatchObject({ CompactionPlugin: expect.any(Function) });
    await activation.dispose();
  });

  it("owns the compaction runtime through a Cordis Service", async () => {
    const ctx = new CordisContextClass();
    ctx.provide("llm.service", { routes: { list: () => [{ routeId: "fixture" }] } });
    await ctx.plugin({ inject: ["llm.service"], apply: (inner) => apply(inner as never) });
    const service = ctx.get("compaction.runtime");
    expect(service).toBeInstanceOf(CompactionService);
    expect((service as CompactionService).runtime).toBeInstanceOf(CompactionPlugin);
    await ctx.fiber.dispose();
    expect(ctx.get("compaction.runtime")).toBeUndefined();
  });
});
