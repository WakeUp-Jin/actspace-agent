import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { publishPluginArtifact, defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
import { composeRuntime, harnessOptionalFallbacks, checkHarnessCompatibility } from "@actspace/composition";
import { validateCandidate } from "../candidate.js";

it("validates configuration through a fixed pure entry and reports declared optional degradation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "harness-validator-"));
  try {
    const sourceRoot = join(directory, "source"); await mkdir(sourceRoot);
    await writeFile(join(sourceRoot, "plugin.js"), "throw new Error('behavior must not load during validation');");
    await writeFile(join(sourceRoot, "validate.js"), "export const validate = value => Number.isInteger(value.limit) && value.limit > 0;");
    const base = defineBuiltinPluginManifest({ pluginId: "validated", version: "1", name: "validated", entry: { entryId: "validated", behavior: "./plugin.js" }, host: { required: [], optional: [] }, frontend: null, contributions: { services: ["reader"], events: [], tools: [], prompts: [] } });
    const plugin = { ...base, behaviors: base.behaviors.map(b => ({ ...b, config: { limit: 1 }, contracts: { configValidator: "./validate.js", services: { provides: [{ id: "reader", version: 1 }], requires: [{ id: "cache", version: 1, optional: true, fallback: "read directly" }] }, events: { provides: [], requires: [] } } })) };
    const artifact = await publishPluginArtifact({ sourceRoot, artifactRoot: join(directory, "artifacts"), files: ["plugin.js", "validate.js"], plugin });
    const composition = composeRuntime({ profile: { id: "main", runtimeContract: "actspace.runtime.v2", orderedBundleIds: ["base"] }, bundles: [{ id: "base", version: "1", provenance: "test", manifests: [plugin] }], hostCapabilities: [] });
    const host = { services: [], events: [], sharedModules: [], codecArtifacts: [] };
    const request = { composition, artifacts: new Map([[plugin.pluginId, artifact]]), sharedServices: [] };
    await expect(validateCandidate(request, host, [])).resolves.toBeUndefined();
    expect(harnessOptionalFallbacks(composition, host)).toEqual([{ entryId: "validated", contractId: "cache", fallback: "read directly" }]);
    await expect(validateCandidate({ ...request, composition: { ...composition, entries: composition.entries.map(e => ({ ...e, config: { limit: -1 } })) } }, host, [])).rejects.toMatchObject({ code: "CONTRACT_MISMATCH" });
    await expect(validateCandidate({ ...request, sharedServices: ["privileged-host"] }, host, [])).rejects.toMatchObject({ code: "RESTART_REQUIRED" });
    expect(checkHarnessCompatibility({ ...composition, entries: composition.entries.map(e => ({ ...e, enabled: false })) }, [artifact], { ...host, requiredServices: [{ id: "reader", version: 1 }] })[0]?.message).toContain("reader");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
