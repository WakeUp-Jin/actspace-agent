import type { HarnessContract, PluginArtifact, SharedArtifactModule } from "@actspace/cordis-adapter";
import type { ResolvedComposition } from "./types.js";
import { canonical } from "./harness-patch.js";
export interface HarnessCompatibilityHost {
  readonly capabilities?: readonly string[];
  readonly requiredServices?: readonly HarnessContract[];
  readonly services: readonly HarnessContract[];
  readonly events: readonly HarnessContract[];
  readonly sharedModules: readonly SharedArtifactModule[];
  readonly codecArtifacts: readonly string[];
}
export interface HarnessCompatibilityDiagnostic { readonly code: "CONTRACT_MISMATCH" | "RESTART_REQUIRED"; readonly entryId?: string; readonly message: string }
/** Pure admission: no module import, registration or tool execution occurs here. */
export function checkHarnessCompatibility(composition: ResolvedComposition, artifacts: readonly PluginArtifact[], host: HarnessCompatibilityHost): readonly HarnessCompatibilityDiagnostic[] {
  const errors: HarnessCompatibilityDiagnostic[] = [];
  const fail = (message: string, entryId?: string, code: HarnessCompatibilityDiagnostic["code"] = "CONTRACT_MISMATCH") => errors.push({ code, message, ...(entryId ? { entryId } : {}) });
  const providers = { services: new Map(host.services.map(c => [c.id, c])), events: new Map(host.events.map(c => [c.id, c])) };
  const active = composition.entries.filter(e => e.enabled && e.state !== "skipped");
  for (const artifact of artifacts) {
    for (const module of artifact.manifest.sharedModules) if (!host.sharedModules.some(m => canonical(m) === canonical(module))) fail(`Unapproved Host module ${module.specifier}`, undefined, "RESTART_REQUIRED");
    if (artifact.manifest.plugin.codecs.length && !host.codecArtifacts.includes(artifact.artifactId)) fail(`Codec implementation not admitted: ${artifact.manifest.plugin.pluginId}`, undefined, "RESTART_REQUIRED");
  }
  for (const entry of active) {
    const behavior = composition.manifests.find(m => m.pluginId === entry.pluginId)?.behaviors.find(b => b.entryId === (entry.manifestEntryId ?? entry.entryId));
    const contracts = behavior?.contracts;
    if (!contracts) { fail("Missing behavior contracts", entry.entryId); continue; }
    if (canonical([...entry.provides].sort()) !== canonical(contracts.services.provides.map(c => c.id).sort()) || canonical([...entry.injects].sort()) !== canonical(contracts.services.requires.filter(c => !c.optional).map(c => c.id).sort()) || canonical([...entry.optionalInjects ?? []].sort()) !== canonical(contracts.services.requires.filter(c => c.optional).map(c => c.id).sort())) fail("Service declarations differ from behavior", entry.entryId);
    for (const capability of entry.requiredCapabilities) if (!(host.capabilities ?? composition.hostCapabilities).includes(capability)) fail(`Missing Host capability ${capability}`, entry.entryId);
    if (entry.frontendRequired) fail("Plugin frontend unsupported", entry.entryId);
    for (const kind of ["services", "events"] as const) for (const contract of contracts[kind].provides) {
      if (providers[kind].has(contract.id)) fail(`Duplicate ${kind} provider ${contract.id}`, entry.entryId);
      else providers[kind].set(contract.id, contract);
    }
  }
  for (const entry of active) {
    const contracts = composition.manifests.find(m => m.pluginId === entry.pluginId)?.behaviors.find(b => b.entryId === (entry.manifestEntryId ?? entry.entryId))?.contracts;
    if (!contracts) continue;
    for (const kind of ["services", "events"] as const) for (const required of contracts[kind].requires) {
      const provided = providers[kind].get(required.id);
      if (!provided && required.optional) continue;
      if (!provided || provided.version !== required.version || provided.mode !== required.mode) fail(`Incompatible ${kind} contract ${required.id}`, entry.entryId);
    }
  }
  for (const required of host.requiredServices ?? []) {
    const provided = providers.services.get(required.id);
    if (!provided || provided.version !== required.version) fail(`Missing Host-required service ${required.id}`);
  }
  return errors;
}

/** Missing optional dependencies remain explicit in the preparation report. */
export function harnessOptionalFallbacks(composition: ResolvedComposition, host: HarnessCompatibilityHost): readonly { entryId: string; contractId: string; fallback: string }[] {
  const active = composition.entries.filter(e => e.enabled && e.state !== "skipped");
  const declarations = active.map(entry => ({ entry, contracts: composition.manifests.find(m => m.pluginId === entry.pluginId)?.behaviors.find(b => b.entryId === (entry.manifestEntryId ?? entry.entryId))?.contracts }));
  const report: { entryId: string; contractId: string; fallback: string }[] = [];
  for (const kind of ["services", "events"] as const) {
    const provided = new Set([...host[kind], ...declarations.flatMap(d => d.contracts?.[kind].provides ?? [])].map(c => c.id));
    for (const { entry, contracts } of declarations) for (const required of contracts?.[kind].requires ?? []) {
      if (required.optional && !provided.has(required.id)) report.push({ entryId: entry.entryId, contractId: required.id, fallback: required.fallback! });
    }
  }
  return report;
}
