import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CordisContextClass, loadCordisBehavior, computeLocalPluginIntegrity, discoverPluginCodecs, entryId, eventTypeId, loadConfiguredPlugins, pluginId, serviceId, type PluginManifest } from "../src/index.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("explicit plugin source loading", () => {
  it("pins local content and keeps codec loading separate from behavior activation", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-package-plugin-")); roots.push(root); const pluginRoot = join(root, "plugin"); await mkdir(pluginRoot); const marker = join(root, "activated");
    await writeFile(join(pluginRoot, "codec.mjs"), "export const codecs = [{ type: 'plugin/example.local/state', ownerPluginId: 'example.local', currentVersion: 1, criticality: 'required', validate() {} }];\n");
    await writeFile(join(pluginRoot, "plugin.mjs"), `import { writeFile } from "node:fs/promises";\nexport async function apply(ctx) { await writeFile(${JSON.stringify(marker)}, "active"); ctx.provide("example.service", { ready: true }); }\n`);
    const unsigned: PluginManifest = { schemaVersion: 1, pluginId: pluginId("example.local"), version: "1.0.0", name: "Example local", runtimeContract: "actspace.runtime.v2", source: { kind: "local-path", reference: pluginRoot }, codecs: [{ module: "./codec.mjs", eventTypes: [eventTypeId("plugin/example.local/state")] }], behaviors: [{ entryId: entryId("example.service"), module: "./plugin.mjs", required: false, enabled: true, config: {}, host: { required: [], optional: [] }, frontend: null, provides: [serviceId("example.service")], injects: [] }], contributions: { services: ["example.service"], events: [eventTypeId("plugin/example.local/state")], contributions: [] } };
    const integrity = await computeLocalPluginIntegrity(pluginRoot, unsigned); const manifest: PluginManifest = { ...unsigned, source: { ...unsigned.source, integrity } };
    await writeFile(join(pluginRoot, "actspace.plugin.json"), JSON.stringify(manifest)); await writeFile(join(root, "plugins.json"), JSON.stringify({ schemaVersion: 1, plugins: [manifest.source] }));
    const loaded = await loadConfiguredPlugins(join(root, "plugins.json")); expect(await discoverPluginCodecs(loaded.manifests, loaded.codecLoader)).toHaveLength(1); await expect(access(marker)).rejects.toThrow();
    const ctx = new CordisContextClass();
    try {
      const behavior = await loadCordisBehavior(manifest.behaviors[0]!.module, specifier => loaded.behaviorLoader(specifier, manifest));
      await expect(access(marker)).rejects.toThrow();
      await ctx.plugin(behavior);
      expect(await readFile(marker, "utf8")).toBe("active");
      expect(ctx.get("example.service")).toEqual({ ready: true });
    } finally { await ctx.fiber.dispose(); }
    expect(ctx.get("example.service")).toBeUndefined();
  });
});
