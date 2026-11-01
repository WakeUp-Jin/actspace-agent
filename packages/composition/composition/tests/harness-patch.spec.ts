import { describe, expect, it } from "vitest";
import { entryId, pluginId, serviceId, type PluginArtifact, type PluginManifest } from "@actspace/cordis-adapter";
import { composeRuntime, resolveHarnessPatch } from "../src/index.js";
const make = (id: string, artifactId: string): PluginArtifact => {
  const plugin: PluginManifest = { schemaVersion: 1, pluginId: pluginId(id), version: "1", name: id, runtimeContract: "actspace.runtime.v2", source: { kind: "builtin", reference: id }, codecs: [], behaviors: [{ entryId: entryId(id), module: "./tool.js", required: true, enabled: true, config: {}, host: { required: [], optional: [] }, frontend: null, provides: [serviceId("search")], injects: [] }], contributions: { services: ["search"], events: [], contributions: [] } };
  return { artifactId, root: "/fixture", manifest: { schemaVersion: 1, plugin, files: [], sharedModules: [] } };
};
const old = make("old", "old-content");
const next = make("next", "next-content");
const base = composeRuntime({ profile: { id: "main", runtimeContract: "actspace.runtime.v2", orderedBundleIds: ["base"] }, bundles: [{ id: "base", version: "1", provenance: "test", manifests: [old.manifest.plugin] }], hostCapabilities: [] });
const patch = { id: "replace", provenance: "test", operations: [{ id: "op", kind: "replace" as const, target: "old", artifactId: "next-content", manifestEntryId: "next" }] };
describe("fixed Harness patches", () => {
  it("keeps the slot while deriving implementation and service facts from the artifact", () => {
    const result = resolveHarnessPatch(base, patch, [old, next]);
    expect(result.entries[0]).toMatchObject({ entryId: "old", manifestEntryId: "next", pluginId: "next", artifactId: "next-content" });
    expect(result.manifests).toEqual([next.manifest.plugin]);
    expect(base.entries[0]?.pluginId).toBe("old");
    expect(result.digest).toBe(resolveHarnessPatch(base, patch, [next, old]).digest);
  });
  it("rejects missing artifact and forged behavior identities", () => {
    expect(() => resolveHarnessPatch(base, patch, [old])).toThrow("Missing artifact");
    expect(() => resolveHarnessPatch(base, { ...patch, operations: [{ ...patch.operations[0]!, manifestEntryId: "forged" }] }, [next])).toThrow("Missing manifest entry");
  });
  it("rejects ambiguous versions instead of guessing a source", () => {
    expect(() => resolveHarnessPatch(base, { ...patch, operations: [] }, [old, make("old", "other-content")])).toThrow("Ambiguous");
  });
  it("ignores caller-supplied module and service claims for artifact-backed insertion", () => {
    const result = resolveHarnessPatch(base, { ...patch, operations: [{ id: "remove", kind: "remove", target: "old" }, { id: "insert", kind: "insert", entry: { ...base.entries[0]!, artifactId: next.artifactId, manifestEntryId: "next", module: "./forged.js", provides: ["admin"] } }] }, [old, next]);
    expect(result.entries[0]?.module).toBe("./tool.js");
    expect(result.entries[0]?.provides).toEqual(["search"]);
  });
});
