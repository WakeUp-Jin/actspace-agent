import { describe, expect, it } from "vitest";
import { entryId, eventTypeId, pluginId, serviceId, validatePluginManifest, type PluginManifest } from "../src/index.js";

const manifest = (overrides: Partial<PluginManifest> = {}): PluginManifest => ({
  schemaVersion: 1,
  pluginId: pluginId("example.plugin"),
  version: "1.0.0",
  name: "Example",
  runtimeContract: "actspace.runtime.v2",
  source: { kind: "builtin", reference: "builtin:example" },
  codecs: [{ module: "./codec.js", eventTypes: [eventTypeId("plugin/example.plugin/state")] }],
  behaviors: [{ entryId: entryId("example.entry"), module: "./plugin.js", required: true, enabled: true, config: {}, host: { required: [], optional: [] }, frontend: null, provides: [serviceId("example.service")], injects: [] }],
  contributions: { services: ["example.service"], events: [eventTypeId("plugin/example.plugin/state")], contributions: [] },
  ...overrides,
});

describe("package-level Plugin ABI", () => {
  it("validates a JSON-safe trusted static manifest", () => expect(validatePluginManifest(manifest()).pluginId).toBe("example.plugin"));
  it("fails closed for URL sources, plaintext secrets and duplicate entries", () => {
    expect(() => validatePluginManifest(manifest({ source: { kind: "local-path", reference: "https://example.test/plugin" } }))).toThrow("untrusted source");
    expect(() => validatePluginManifest(manifest({ behaviors: [{ ...manifest().behaviors[0]!, config: { apiKey: "secret" } }] }))).toThrow("credentialRef");
    expect(() => validatePluginManifest(manifest({ behaviors: [manifest().behaviors[0]!, manifest().behaviors[0]!] }))).toThrow("Duplicate Entry");
  });
});
