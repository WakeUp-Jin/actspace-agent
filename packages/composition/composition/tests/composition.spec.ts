import { describe, expect, it } from "vitest";
import { entryId, pluginId, serviceId, type PluginManifest } from "@actspace/cordis-adapter";
import type { Bundle, Profile } from "@actspace/bundle";
import { composeRuntime } from "../src/index.js";

const manifest: PluginManifest = { schemaVersion: 1, pluginId: pluginId("example.plugin"), version: "1", name: "Example", runtimeContract: "actspace.runtime.v2", source: { kind: "builtin", reference: "builtin:example" }, codecs: [], behaviors: [{ entryId: entryId("example.entry"), module: "./plugin.js", required: true, enabled: true, config: { value: 1 }, host: { required: ["filesystem.read"], optional: [] }, frontend: null, provides: [serviceId("example.service")], injects: [] }], contributions: { services: ["example.service"], events: [], contributions: [] } };
const bundle: Bundle = { id: "base", version: "1", provenance: "base", manifests: [manifest] };
const profile: Profile = { id: "default", runtimeContract: "actspace.runtime.v2", orderedBundleIds: ["base"] };

describe("composition", () => {
  it("creates a deterministic resolved composition and immutable loader facts", () => {
    const resolved = composeRuntime({ profile, bundles: [bundle], hostCapabilities: ["filesystem.read"] });
    expect(resolved.entries[0]?.entryId).toBe("example.entry");
    expect(resolved.services?.[0]).toMatchObject({ serviceId: "example.service", providerEntryId: "example.entry" });
    expect(resolved.loaderConfig).toEqual(resolved.config);
    expect(resolved.startupRequirements).toEqual(["example.entry"]);
  });
  it("fails closed when a required Host capability is absent", () => expect(() => composeRuntime({ profile, bundles: [bundle], hostCapabilities: [] })).toThrow("lacks Host capabilities"));
  it("rejects required plugin frontend code and warns for optional frontend metadata", () => {
    const behavior = manifest.behaviors[0]!;
    const required: Bundle = { ...bundle, manifests: [{ ...manifest, behaviors: [{ ...behavior, frontend: { required: true, rendererKeys: ["example.card"] } }] }] };
    expect(() => composeRuntime({ profile, bundles: [required], hostCapabilities: ["filesystem.read"] })).toThrow("requires plugin frontend code");
    const optional: Bundle = { ...bundle, manifests: [{ ...manifest, behaviors: [{ ...behavior, frontend: { required: false, rendererKeys: ["example.card"] } }] }] };
    expect(composeRuntime({ profile, bundles: [optional], hostCapabilities: ["filesystem.read"] }).warnings[0]).toContain("fixed ActSpace Hosts ignore");
  });
  it("distinguishes optional patch misses from required misses", () => {
    const optionalProfile: Profile = { ...profile, patch: { id: "optional", provenance: "test", operations: [{ id: "miss", kind: "disable", target: "missing", optional: true }] } };
    expect(composeRuntime({ profile: optionalProfile, bundles: [bundle], hostCapabilities: ["filesystem.read"] }).patchResults[0]?.state).toBe("skipped");
    const requiredProfile: Profile = { ...profile, patch: { id: "required", provenance: "test", operations: [{ id: "miss", kind: "disable", target: "missing" }] } };
    expect(() => composeRuntime({ profile: requiredProfile, bundles: [bundle], hostCapabilities: ["filesystem.read"] })).toThrow("Target missing not found");
  });
  it("rejects two active providers for one Service ID", () => {
    const secondManifest: PluginManifest = { ...manifest, pluginId: pluginId("example.second"), behaviors: [{ ...manifest.behaviors[0]!, entryId: entryId("example.second"), module: "./second.js" }] };
    const second: Bundle = { id: "second", version: "1", provenance: "second", manifests: [secondManifest] };
    const two: Profile = { ...profile, orderedBundleIds: ["base", "second"] };
    expect(() => composeRuntime({ profile: two, bundles: [bundle, second], hostCapabilities: ["filesystem.read"] })).toThrow("Multiple active providers");
  });
  it("includes the loader transport in the digest", () => {
    const first = composeRuntime({ profile, bundles: [bundle], hostCapabilities: ["filesystem.read"], loaderConfig: { entries: [{ id: "fixture", name: "./plugin.js", inject: [] }] } });
    const second = composeRuntime({ profile, bundles: [bundle], hostCapabilities: ["filesystem.read"], loaderConfig: { entries: [{ id: "fixture", name: "./other.js", inject: [] }] } });
    expect(first.loaderConfig).not.toEqual(second.loaderConfig);
    expect(first.digest).not.toBe(second.digest);
  });
});
