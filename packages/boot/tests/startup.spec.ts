import { describe, expect, it } from "vitest";
import type { CompositionEntry } from "@actspace/bundle";
import type { ResolvedComposition } from "@actspace/composition";
import { createTrustedBootCandidate, validateStartup } from "../src/index.js";

const entry: CompositionEntry = { entryId: "agent.loop", pluginId: "core", pluginVersion: "1", module: "builtin", required: true, enabled: true, config: {}, requiredCapabilities: [], optionalCapabilities: [], provides: ["agent.loop"], injects: ["llm.service"], frontendRequired: false, provenance: "builtin", state: "candidate" };
describe("startup validation", () => {
  it("publishes only active Fiber-backed required providers", () => expect(validateStartup([entry], [{ entryId: "agent.loop", hasFiber: true, state: "ACTIVE", providedServices: ["agent.loop"] }], ["agent.loop"]).ok).toBe(true));
  it("rejects pending entries and missing providers", () => expect(validateStartup([entry], [{ entryId: "agent.loop", hasFiber: true, state: "PENDING", unresolvedServices: ["llm.service"] }], ["agent.loop"]).ok).toBe(false));
  it("publishes a Trusted Boot candidate only after settlement and disposes its root", async () => {
    let disposed = false;
    const composition: ResolvedComposition = { schemaVersion: 1, profileId: "default", bundles: [], manifests: [], entries: [entry], patchResults: [], hostCapabilities: [], warnings: [], digest: "digest", config: {} };
    const candidate = await createTrustedBootCandidate({ host: { hostKind: "cli-run", capabilityCeiling: [], runtimeContract: "actspace.runtime.v2", invocationId: "test" }, composition, cordisAdmission: { status: "passed", packages: [], hmrAbsent: true, singleFamily: true, forbiddenPackages: [], failures: [] }, createCordisRoot: async () => ({ context: {}, mount: async () => undefined, getService: () => undefined, facts: () => [], awaitSettlement: async () => ({ settled: true, disposed: false, pendingServices: [] }), dispose: async () => { disposed = true; return { settled: true, disposed: true, pendingServices: [] }; } }), discoveredCodecs: [], activations: [{ entryId: "agent.loop", hasFiber: true, state: "ACTIVE", providedServices: ["agent.loop"] }], requiredProviders: ["agent.loop"] });
    expect(candidate.manifest.profileId).toBe("default"); await candidate.disposeCandidate(); expect(disposed).toBe(true);
  });
});
