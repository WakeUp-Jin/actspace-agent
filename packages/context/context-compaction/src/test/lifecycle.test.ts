import { EMPTY_LLM_USAGE } from "@actspace/llm-service";
import { ContextCompactionCoordinator } from "@actspace/context-engine";
import { describe, expect, it, vi } from "vitest";
import { apply, CompactionPlugin, CompactionService } from "../plugin.js";
import { CordisContextClass } from "@actspace/cordis-adapter";

import { compactionSession } from "./session-fixture.js";

describe("compaction plugin lifecycle", () => {
  it.each([
    { routes: ["default", "utility"], override: undefined, expected: "utility" },
    { routes: ["default", "utility"], override: "default", expected: "default" },
    { routes: ["default", "utility"], override: "custom", expected: "custom" },
    { routes: ["default"], override: undefined, expected: "default" },
    { routes: ["fixture"], override: undefined, expected: "fixture" },
  ])("uses $expected for routes $routes and override $override", async ({ routes, override, expected }) => {
    const ctx = new CordisContextClass();
    ctx.provide("llm.auxiliary-requests", { start: async () => ({ finish: async () => {} }) });
    ctx.provide("context.engine", { compaction: new ContextCompactionCoordinator() });
    const session = await compactionSession();
    const prepare = vi.fn((request) => ({
      request: { ...request, requestId: "fixture-request" },
      registration: { registrationId: "fixture", adapter: { adapterVersion: "fixture" } },
      dispatch: async () => (async function* () { yield { type: "done", usage: EMPTY_LLM_USAGE, stopReason: "stop", content: [{ type: "text", text: "summary" }] }; })(),
      release: vi.fn(),
    }));
    ctx.provide("llm.service", { routes: { list: () => routes.map(routeId => ({ routeId })) }, prepareAsync: prepare });
    try {
      await ctx.plugin({ inject: ["llm.service", "context.engine"], apply: (inner) => apply(inner as never, { routeId: override }) });
      expect(await (ctx.get("compaction.runtime") as CompactionService).compact(session)).toBe(true);
      expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ routeId: expected, model: "default" }));
    } finally {
      await session.close();
      await ctx.fiber.dispose();
    }
  });

  it("owns the compaction runtime through a Cordis Service", async () => {
    const ctx = new CordisContextClass();
    ctx.provide("llm.auxiliary-requests", { start: async () => ({ finish: async () => {} }) });
    ctx.provide("context.engine", { compaction: new ContextCompactionCoordinator() });
    ctx.provide("llm.service", { routes: { list: () => [{ routeId: "fixture" }] } });
    await ctx.plugin({ inject: ["llm.service", "context.engine"], apply: (inner) => apply(inner as never) });
    const service = ctx.get("compaction.runtime");
    expect(service).toBeInstanceOf(CompactionService);
    expect((service as CompactionService).runtime).toBeInstanceOf(CompactionPlugin);
    await ctx.fiber.dispose();
    expect(ctx.get("compaction.runtime")).toBeUndefined();
  });

  it("exposes live Chat trigger overrides through the registered Cordis service", async () => {
    const ctx = new CordisContextClass();
    ctx.provide("llm.auxiliary-requests", { start: async () => ({ finish: async () => {} }) });
    ctx.provide("context.engine", { compaction: new ContextCompactionCoordinator() });
    ctx.provide("llm.service", { routes: { list: () => [{ routeId: "fixture" }] } });
    try {
      await ctx.plugin({ inject: ["llm.service", "context.engine"], apply: (inner) => apply(inner as never) });
      const service = ctx.get("compaction.runtime") as CompactionService;
      let ratio = 0.95;
      const chat = service.withTriggerRatio(() => ratio);
      expect(chat).toBeInstanceOf(CompactionPlugin);
      expect(chat).not.toBe(service.runtime);
      // Selecting nothing ends the run right after the trigger gate, so `select` marks a triggered compaction.
      const select = vi.spyOn(chat, "select").mockReturnValue(null);
      const baseSelect = vi.spyOn(service.runtime, "select").mockReturnValue(null);
      const session = { header: { sessionId: "s" }, lastSeq: 0, journal: { surface: { entries: [], replaceGeneration: 0 } } } as unknown as Parameters<CompactionPlugin["maybeCompact"]>[0];
      const usage = { inputTokens: 70_000, outputTokens: 0, contextWindow: 128_000 };
      expect(await chat.maybeCompact(session, usage)).toBe(false);
      expect(select).not.toHaveBeenCalled();
      ratio = 0.5;
      expect(await chat.maybeCompact(session, usage)).toBe(false);
      expect(select).toHaveBeenCalledOnce();
      expect(await service.maybeCompact(session, usage)).toBe(false);
      expect(baseSelect).not.toHaveBeenCalled();
      const fixed = service.withTriggerRatio(0.5);
      const fixedSelect = vi.spyOn(fixed, "select").mockReturnValue(null);
      await fixed.maybeCompact(session, usage);
      expect(fixedSelect).toHaveBeenCalledOnce();
    } finally {
      vi.restoreAllMocks();
      await ctx.fiber.dispose();
    }
    expect(ctx.get("compaction.runtime")).toBeUndefined();
  });

});
