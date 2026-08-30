import { createHash } from "node:crypto";
import { validatePluginManifest, type JsonValue } from "@actspace/cordis-adapter";
import type { Bundle, CompositionEntry, Patch, PatchOperationResult, Profile } from "@actspace/bundle";
import { applyPatch } from "./patch.js";
import type { CodecAdmission, ResolvedComposition, ServiceAdmission } from "./types.js";

export function composeRuntime(input: { readonly profile: Profile; readonly bundles: readonly Bundle[]; readonly hostBundle?: Bundle; readonly homePatch?: Patch; readonly invocationPatch?: Patch; readonly hostCapabilities: readonly string[]; readonly loaderConfig?: JsonValue }): ResolvedComposition {
  const byId = new Map(input.bundles.map((bundle) => [bundle.id, bundle]));
  const ordered = input.profile.orderedBundleIds.map((id) => { const bundle = byId.get(id); if (!bundle) throw new Error(`Bundle ${id} not found.`); return bundle; });
  if (input.hostBundle) ordered.push(input.hostBundle);
  const manifests = ordered.flatMap((bundle) => bundle.manifests.map(validatePluginManifest));
  const pluginIds = new Set<string>(); const entries: CompositionEntry[] = []; const warnings: string[] = [];
  for (const manifest of manifests) {
    if (pluginIds.has(manifest.pluginId)) throw new Error(`Duplicate plugin id ${manifest.pluginId}.`); pluginIds.add(manifest.pluginId);
    for (const behavior of manifest.behaviors) {
      if (entries.some((entry) => entry.entryId === behavior.entryId)) throw new Error(`Duplicate Entry id ${behavior.entryId}.`);
      if (behavior.frontend !== null && !behavior.frontend.required) warnings.push(`Entry ${behavior.entryId} declares optional frontend keys that fixed ActSpace Hosts ignore: ${behavior.frontend.rendererKeys.join(", ") || "none"}.`);
      entries.push(Object.freeze({ entryId: behavior.entryId, pluginId: manifest.pluginId, pluginVersion: manifest.version, module: behavior.module, required: behavior.required, enabled: behavior.enabled, config: behavior.config, requiredCapabilities: behavior.host.required, optionalCapabilities: behavior.host.optional, provides: Object.freeze([...(behavior.provides ?? [])]), injects: Object.freeze([...(behavior.injects ?? [])]), frontendRequired: behavior.frontend?.required ?? false, provenance: manifest.source.reference, state: behavior.enabled ? "candidate" : "skipped" }));
    }
  }
  let current: readonly CompositionEntry[] = entries; const patchResults: PatchOperationResult[] = [];
  for (const patch of [input.profile.patch, input.homePatch, input.invocationPatch]) if (patch) { const applied = applyPatch(current, patch); current = applied.entries; patchResults.push(...applied.results); }
  const ceiling = new Set(input.hostCapabilities);
  current = current.map((entry) => { const missing = entry.requiredCapabilities.filter((capability) => !ceiling.has(capability)); const frontendMissing = entry.frontendRequired; if (!entry.enabled || (missing.length === 0 && !frontendMissing)) return entry; const message = frontendMissing ? `Entry ${entry.entryId} requires plugin frontend code.` : `Entry ${entry.entryId} lacks Host capabilities: ${missing.join(", ")}.`; if (entry.required) throw new Error(message); warnings.push(message); return Object.freeze({ ...entry, state: "skipped" as const }); });
  const activeEntries = current.filter((entry) => entry.enabled && (entry.state === "candidate" || entry.state === "active"));
  const serviceMap = new Map<string, ServiceAdmission>();
  for (const entry of activeEntries) for (const serviceId of entry.provides) {
    if (serviceMap.has(serviceId)) throw new Error(`Multiple active providers for service ${serviceId}.`);
    serviceMap.set(serviceId, Object.freeze({ serviceId, providerEntryId: entry.entryId, providerPluginId: entry.pluginId, required: entry.required }));
  }
  const services = Object.freeze([...serviceMap.values()].sort((left, right) => left.serviceId.localeCompare(right.serviceId)));
  const codecs: readonly CodecAdmission[] = Object.freeze(manifests.flatMap((manifest) => manifest.codecs.map((codec) => Object.freeze({ module: codec.module, eventTypes: Object.freeze([...codec.eventTypes].map(String).sort()), pluginId: String(manifest.pluginId), required: manifest.behaviors.some((behavior) => behavior.required && behavior.enabled) }))));
  const loaderConfig: JsonValue = input.loaderConfig ?? { profileId: input.profile.id, entries: current.map((entry) => ({ id: entry.entryId, config: entry.config })) };
  const startupRequirements = Object.freeze(activeEntries.filter((entry) => entry.required).map((entry) => entry.entryId));
  const diagnostics = Object.freeze(warnings.map((message): { readonly severity: "warning"; readonly message: string } => Object.freeze({ severity: "warning", message })));
  const canonical = JSON.stringify({ profile: input.profile.id, bundles: ordered.map(({ id, version }) => ({ id, version })), entries: current, services, codecs, patchResults, hostCapabilities: [...ceiling].sort(), loaderConfig, startupRequirements });
  return Object.freeze({ schemaVersion: 1, profileId: input.profile.id, bundles: Object.freeze(ordered.map(({ id, version }) => Object.freeze({ id, version }))), manifests: Object.freeze(manifests), entries: Object.freeze(current), services, codecs, patchResults: Object.freeze(patchResults), hostCapabilities: Object.freeze([...ceiling].sort()), warnings: Object.freeze(warnings), diagnostics, digest: createHash("sha256").update(canonical).digest("hex"), config: loaderConfig, loaderConfig, startupRequirements });
}
