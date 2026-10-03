import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { importArtifactModule, verifyPluginArtifact, type PluginArtifact, type PluginArtifactManifest } from "@actspace/cordis-adapter";
import { canonical, checkHarnessCompatibility, type HarnessCompatibilityHost } from "@actspace/composition";
import type { HarnessMountRequest } from "@actspace/boot";
import { HarnessControlError, type SelectionDescription } from "./contracts.js";
export async function loadArtifact(root: string, id: string): Promise<PluginArtifact> {
  if (!/^sha256-[a-f0-9]{64}$/.test(id)) throw new HarnessControlError("ARTIFACT_INVALID", "Invalid artifact identity");
  try {
    const path = join(root, id);
    const manifest = JSON.parse(await readFile(join(path, "artifact.json"), "utf8")) as PluginArtifactManifest;
    return await verifyPluginArtifact({ artifactId: id, root: path, manifest });
  } catch (cause) { throw new HarnessControlError("ARTIFACT_INVALID", `Cannot admit artifact ${id}`, { cause }); }
}
export function describeMount(request: HarnessMountRequest): SelectionDescription {
  return structuredClone({ hostContractDigest: request.hostContractDigest!, composition: request.composition, artifactIds: [...request.artifacts.values()].map(a => a.artifactId).sort(), sharedServices: [...request.sharedServices] });
}
export async function validateCandidate(request: HarnessMountRequest, host: HarnessCompatibilityHost, sharedServices: readonly string[]): Promise<void> {
  if (request.sharedServices.some(s => !sharedServices.includes(s))) throw new HarnessControlError("RESTART_REQUIRED", "Candidate expands Host shared services");
  const errors = checkHarnessCompatibility(request.composition, [...request.artifacts.values()], host);
  if (errors.length) throw new HarnessControlError(errors[0]!.code, errors.map(e => `${e.entryId ?? "Host"}: ${e.message}`).join("; "), { diagnostics: errors });
  for (const entry of request.composition.entries.filter(e => e.enabled && e.state !== "skipped")) {
    const artifact = request.artifacts.get(entry.pluginId)!;
    const behavior = artifact.manifest.plugin.behaviors.find(b => b.entryId === (entry.manifestEntryId ?? entry.entryId))!;
    const validator = behavior.contracts?.configValidator;
    if (validator) {
      const module = await importArtifactModule(artifact, validator) as { validate?: (value: unknown) => unknown };
      if (typeof module.validate !== "function" || await module.validate(structuredClone(entry.config)) !== true) throw new HarnessControlError("CONTRACT_MISMATCH", `Invalid configuration: ${entry.entryId}`);
    } else if (canonical(entry.config) !== canonical(behavior.config)) throw new HarnessControlError("CONTRACT_MISMATCH", `Configuration override requires validator: ${entry.entryId}`);
  }
}
