import { describe, expect, it } from "vitest";
import { CordisContextClass, createCordisRoot, loadCordisBehavior, mountIsolatedCordisTree, discoverPluginCodecs, entryId, eventTypeId, pluginId, serviceId, type PluginManifest } from "../src/index.js";

const manifest: PluginManifest = { schemaVersion: 1, pluginId: pluginId("example.plugin"), version: "1.0.0", name: "Example", runtimeContract: "actspace.runtime.v2", source: { kind: "builtin", reference: "builtin:example" }, codecs: [{ module: "./codec.js", eventTypes: [eventTypeId("plugin/example.plugin/state")] }], behaviors: [{ entryId: entryId("example.entry"), module: "./plugin.js", required: true, enabled: true, config: {}, host: { required: [], optional: [] }, frontend: null, provides: [serviceId("example.service")], injects: [] }], contributions: { services: ["example.service"], events: [eventTypeId("plugin/example.plugin/state")], contributions: [] } };

describe("codec-first Cordis lifecycle", () => {
  it("discovers codecs before loading behavior and disposes its effect exactly once", async () => {
    let evaluated = false;
    let disposed = 0;
    const codecs = await discoverPluginCodecs([manifest], async () => ({ codecs: [{ type: "plugin/example.plugin/state", ownerPluginId: "example.plugin", currentVersion: 1, criticality: "required", validate: () => undefined }] }));
    expect(codecs).toHaveLength(1);
    expect(evaluated).toBe(false);
    const behavior = await loadCordisBehavior("./plugin.js", async () => {
      evaluated = true;
      return { apply: (ctx: any) => { ctx.provide("example.service", {}); return () => { disposed++; }; } };
    });
    const ctx = new CordisContextClass();
    const fiber = await ctx.plugin(behavior);
    expect(evaluated).toBe(true);
    expect(ctx.get("example.service")).toBeDefined();
    await fiber.dispose();
    await ctx.fiber.dispose();
    expect(disposed).toBe(1);
    expect(ctx.get("example.service")).toBeUndefined();
  });

  it("rejects missing declared services and releases the failed candidate effect", async () => {
    const root = await createCordisRoot();
    let disposed = 0;
    try {
      await expect(mountIsolatedCordisTree({ parent: root.context, sharedServices: [], entries: [{
        id: "example", config: {}, provides: ["example.service"], injects: [],
        module: { apply: () => () => { disposed++; } },
      }] })).rejects.toThrow("service missing");
      expect(disposed).toBe(1);
    } finally { await root.dispose(); }
  });

  it("stops Cordis-owned timers during disposal", async () => {
    const ctx = new CordisContextClass();
    let ticks = 0;
    await ctx.plugin({ apply: inner => {
      inner.effect(() => {
        const timer = setInterval(() => { ticks++; }, 2);
        return () => clearInterval(timer);
      });
    } });
    await new Promise(resolve => setTimeout(resolve, 12));
    expect(ticks).toBeGreaterThan(0);
    await ctx.fiber.dispose();
    const stopped = ticks;
    await new Promise(resolve => setTimeout(resolve, 8));
    expect(ticks).toBe(stopped);
  });
});
