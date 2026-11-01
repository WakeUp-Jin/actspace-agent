import type { CordisContext } from "@actspace/cordis-adapter";
import { describe, expect, it } from "vitest";
import { manifest } from "../manifest.js";
import { apply } from "../plugin.js";

describe("desktop app plugin", () => {
  it("declares a real Desktop application behavior", () => {
    expect(manifest.pluginId).toBe("actspace.desktop-app");
    expect(manifest.behaviors[0]?.entryId).toBe("desktop.app");
    expect(manifest.contributions.services).toContain("desktop.app");
    expect(typeof apply).toBe("function");
  });
});

it("mounts the title behavior before publishing the Desktop application and releases it with the plugin", async () => {
  const { CordisContextClass } = await import("@actspace/cordis-adapter");
  const ctx = new CordisContextClass();
    ctx.provide("llm.auxiliary-requests", { start: async () => ({ finish: async () => {} }) });
  ctx.provide("actspace.host.desktop", {});
  ctx.provide("session.runtime", { snapshot: () => ({ metadata: { title: null } }) });
  ctx.provide("agent.runtime", { runs: {} });
  ctx.provide("llm.service", {});
  try {
    const fiber = ctx.plugin({ apply: (scope) => apply(scope as CordisContext) });
    await fiber;
    expect(ctx.get("desktop.titles")).toBeDefined();
    expect(ctx.get("desktop.app")).toBeDefined();
    await fiber.dispose();
    expect(ctx.get("desktop.titles")).toBeUndefined();
    expect(ctx.get("desktop.app")).toBeUndefined();
  } finally { await ctx.fiber.dispose(); }
});
