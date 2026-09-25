import { describe, expect, it, vi } from "vitest";
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

  it("exposes live Chat trigger overrides through the registered Cordis service", async () => {
    const ctx = new CordisContextClass();
    ctx.provide("llm.service", { routes: { list: () => [{ routeId: "fixture" }] } });
    try {
      await ctx.plugin({ inject: ["llm.service"], apply: (inner) => apply(inner as never) });
      const service = ctx.get("compaction.runtime") as CompactionService;
      let ratio = 0.95;
      const chat = service.withTriggerRatio(() => ratio);
      expect(chat).toBeInstanceOf(CompactionPlugin);
      expect(chat).not.toBe(service.runtime);
      const compact = vi.spyOn(chat, "compact").mockResolvedValue(true);
      const baseCompact = vi.spyOn(service.runtime, "compact").mockResolvedValue(true);
      // No session access occurs unless compaction triggers; compact is stubbed above.
      const session = {} as Parameters<CompactionPlugin["maybeCompact"]>[0];
      const usage = { inputTokens: 60_000, outputTokens: 0 };
      expect(await chat.maybeCompact(session, usage)).toBe(false);
      expect(compact).not.toHaveBeenCalled();
      ratio = 0.5;
      expect(await chat.maybeCompact(session, usage)).toBe(true);
      expect(compact).toHaveBeenCalledExactlyOnceWith(session);
      expect(await service.maybeCompact(session, usage)).toBe(false);
      expect(baseCompact).not.toHaveBeenCalled();
      const fixed = service.withTriggerRatio(0.5);
      vi.spyOn(fixed, "compact").mockResolvedValue(true);
      expect(await fixed.maybeCompact(session, usage)).toBe(true);
    } finally {
      vi.restoreAllMocks();
      await ctx.fiber.dispose();
    }
    expect(ctx.get("compaction.runtime")).toBeUndefined();
  });

});
