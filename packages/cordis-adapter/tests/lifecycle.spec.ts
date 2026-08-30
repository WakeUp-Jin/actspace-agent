import { describe, expect, it } from "vitest";
import { activateBehavior, discoverPluginCodecs, entryId, eventTypeId, pluginId, serviceId, type PluginManifest } from "../src/index.js";

const manifest: PluginManifest = { schemaVersion: 1, pluginId: pluginId("example.plugin"), version: "1.0.0", name: "Example", runtimeContract: "actspace.runtime.v2", source: { kind: "builtin", reference: "builtin:example" }, codecs: [{ module: "./codec.js", eventTypes: [eventTypeId("plugin/example.plugin/state")] }], behaviors: [{ entryId: entryId("example.entry"), module: "./plugin.js", required: true, enabled: true, config: {}, host: { required: [], optional: [] }, frontend: null, provides: [serviceId("example.service")], injects: [] }], contributions: { services: ["example.service"], events: [eventTypeId("plugin/example.plugin/state")], contributions: [] } };

describe("codec-first behavior lifecycle", () => {
  it("discovers codecs before evaluating behavior and disposes once", async () => {
    let behaviorEvaluated = false; let disposeCount = 0;
    const codecs = await discoverPluginCodecs([manifest], async () => ({ codecs: [{ type: "plugin/example.plugin/state", ownerPluginId: "example.plugin", currentVersion: 1, criticality: "required", validate: () => undefined }] }));
    expect(codecs).toHaveLength(1); expect(behaviorEvaluated).toBe(false);
    const activation = await activateBehavior(manifest, manifest.behaviors[0]!, async () => { behaviorEvaluated = true; return { activate: () => ({ services: { "example.service": { value: 1 } }, dispose: () => { disposeCount += 1; } }) }; });
    expect(behaviorEvaluated).toBe(true); await activation.dispose(); await activation.dispose(); expect(disposeCount).toBe(1);
  });

  it("rolls back an activation whose services differ from the static manifest", async () => {
    let disposed = false;
    await expect(activateBehavior(manifest, manifest.behaviors[0]!, async () => ({ activate: () => ({ services: {}, dispose: () => { disposed = true; } }) }))).rejects.toThrow("do not match");
    expect(disposed).toBe(true);
  });

  it("stops Effect-owned timers during dispose", async () => {
    let ticks = 0;
    const activation = await activateBehavior(manifest, manifest.behaviors[0]!, async () => ({ activate: () => { const timer = setInterval(() => { ticks += 1; }, 2); return { services: { "example.service": {} }, dispose: () => clearInterval(timer) }; } }));
    await new Promise((resolve) => setTimeout(resolve, 12)); expect(ticks).toBeGreaterThan(0); await activation.dispose(); const stoppedAt = ticks; await new Promise((resolve) => setTimeout(resolve, 8)); expect(ticks).toBe(stoppedAt);
  });
});
