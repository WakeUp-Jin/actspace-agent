import { describe, expect, it } from "vitest";
import type { ResolvedComposition } from "@actspace/composition";
import type { CordisRootHandle } from "@actspace/cordis-adapter";
import { createDshBootCandidate } from "../src/index.js";

const composition: ResolvedComposition = { schemaVersion: 1, profileId: "default", bundles: [], manifests: [], entries: [], patchResults: [], hostCapabilities: [], warnings: [], digest: "digest", config: {} };
const options = { host: { hostKind: "cli-run" as const, capabilityCeiling: [], runtimeContract: "actspace.runtime.v2" as const, invocationId: "test" }, composition, cordisAdmission: { status: "passed" as const, packages: [], hmrAbsent: true, singleFamily: true, forbiddenPackages: [], failures: [] }, discoveredCodecs: [] };
const probe = { settled: true, disposed: false, pendingServices: [] };
function root(dispose: CordisRootHandle["dispose"]): CordisRootHandle { return { context: {}, mount: async () => undefined, getService: () => undefined, facts: () => [], awaitSettlement: async () => probe, dispose }; }

describe("production boot candidate", () => {
  it("rejects unsettled loader state before publishing", async () => {
    const pending = root(async () => probe); pending.awaitSettlement = async () => ({ ...probe, settled: false, pendingServices: ["session.storage"] });
    await expect(createDshBootCandidate({ ...options, root: pending })).rejects.toThrow("session.storage");
  });
  it("shares concurrent disposal and retries a failed release", async () => {
    let calls = 0;
    const candidate = await createDshBootCandidate({ ...options, root: root(async () => { calls++; if (calls === 1) throw new Error("release failed"); return { ...probe, disposed: true }; }) });
    const first = candidate.disposeCandidate(); const second = candidate.disposeCandidate();
    expect(first).toBe(second); await expect(first).rejects.toThrow("release failed");
    await candidate.disposeCandidate(); await candidate.disposeCandidate(); expect(calls).toBe(2);
  });
});
