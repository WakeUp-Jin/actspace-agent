import { expect, it } from "vitest";
import { checkHarnessCompatibility, composeRuntime } from "../src/index.js";
import { defineBuiltinPluginManifest, type HarnessBehaviorContracts } from "@actspace/cordis-adapter";
const manifest = defineBuiltinPluginManifest({ pluginId: "reader", version: "1", name: "reader", entry: { entryId: "reader", behavior: "./reader.js" }, host: { required: [], optional: [] }, frontend: null, injects: ["storage"], contributions: { services: ["reader"], events: [], tools: [], prompts: [] } });
const contracts: HarnessBehaviorContracts = { services: { provides: [{ id: "reader", version: 1 }], requires: [{ id: "storage", version: 1 }] }, events: { provides: [], requires: [{ id: "before", version: 1, mode: "waterfall" }] } };
const composition = composeRuntime({ profile: { id: "main", runtimeContract: "actspace.runtime.v2", orderedBundleIds: ["base"] }, bundles: [{ id: "base", version: "1", provenance: "test", manifests: [{ ...manifest, behaviors: manifest.behaviors.map(b => ({ ...b, contracts })) }] }], hostCapabilities: [] });
const host = { services: [{ id: "storage", version: 1 }], events: [{ id: "before", version: 1, mode: "waterfall" as const }], sharedModules: [], codecArtifacts: [] };
it("rejects missing/version-mismatched services and mismatched event modes", () => {
  expect(checkHarnessCompatibility(composition, [], host)).toEqual([]);
  expect(checkHarnessCompatibility(composition, [], { ...host, services: [] })[0]?.message).toContain("storage");
  expect(checkHarnessCompatibility(composition, [], { ...host, services: [{ id: "storage", version: 2 }] })[0]?.message).toContain("storage");
  expect(checkHarnessCompatibility(composition, [], { ...host, events: [{ id: "before", version: 1, mode: "emit" }] })[0]?.message).toContain("before");
});
it("rejects duplicate providers and undeclared contracts", () => {
  expect(checkHarnessCompatibility(composition, [], { ...host, services: [...host.services, { id: "reader", version: 1 }] })[0]?.message).toContain("Duplicate");
  expect(checkHarnessCompatibility({ ...composition, manifests: [manifest] }, [], host)[0]?.message).toContain("Missing behavior");
});

it("requires execution factory contracts and rejects unapproved shared modules/codecs", () => {
  expect(checkHarnessCompatibility(composition, [], { ...host, requiredServices: [{ id: "agent.run-factory", version: 1 }] })[0]?.message).toContain("agent.run-factory");
  const artifact = { artifactId: "new-codec", manifest: { plugin: { ...manifest, codecs: [{ module: "./codec.js", eventTypes: ["test/event"] }] }, sharedModules: [{ specifier: "host-module", resolvedUrl: "file:///untrusted", sha256: "caller-hash" }] } };
  const errors = checkHarnessCompatibility(composition, [artifact as never], host);
  expect(errors.map(e => e.code)).toEqual(["RESTART_REQUIRED", "RESTART_REQUIRED"]);
});

it("checks capabilities against the current Host rather than the persisted composition ceiling", () => {
  const old = { ...composition, hostCapabilities: ["network"], entries: composition.entries.map(e => ({ ...e, requiredCapabilities: ["network"] })) };
  expect(checkHarnessCompatibility(old, [], { ...host, capabilities: [] })[0]?.message).toContain("Missing Host capability network");
});
