import { createHash } from "node:crypto";
import type { CompositionEntry, Patch } from "@actspace/bundle";
import type { PluginArtifact } from "@actspace/cordis-adapter";
import { applyPatch } from "./patch.js";
import type { ResolvedComposition } from "./types.js";

/** Resolve only verified artifact manifests; caller owns artifact verification and admission. */
export function resolveHarnessPatch(base: ResolvedComposition, patch: Patch, artifacts: readonly PluginArtifact[]): ResolvedComposition {
  const byArtifact = new Map(artifacts.map(a => [a.artifactId, a]));
  if (byArtifact.size !== artifacts.length) throw new Error("Duplicate artifact identity");
  const resolve = (artifactId: string, manifestEntryId: string, slot: string): CompositionEntry => {
    const artifact = byArtifact.get(artifactId);
    if (!artifact) throw new Error(`Missing artifact ${artifactId}`);
    const manifest = artifact.manifest.plugin;
    const row = manifest.behaviors.find(b => b.entryId === manifestEntryId);
    if (!row) throw new Error(`Missing manifest entry ${manifestEntryId}`);
    return { entryId: slot, manifestEntryId, artifactId, pluginId: manifest.pluginId, pluginVersion: manifest.version,
      module: row.module, required: row.required, enabled: row.enabled, config: structuredClone(row.config),
      requiredCapabilities: row.host.required, optionalCapabilities: row.host.optional, provides: row.provides ?? [],
      injects: row.injects ?? [], frontendRequired: row.frontend?.required ?? false,
      provenance: manifest.source.reference, state: row.enabled ? "candidate" : "skipped" };
  };
  const prepared: Patch = { ...patch, operations: patch.operations.map(op => {
    if (op.kind !== "insert") return op;
    if (!op.entry.artifactId) throw new Error("Inserted entry requires an artifact identity");
    return { ...op, entry: resolve(op.entry.artifactId, op.entry.manifestEntryId ?? op.entry.entryId, op.entry.entryId) };
  }) };
  const result = applyPatch(base.entries, prepared, resolve);
  const selected = new Map<string, PluginArtifact>();
  for (const entry of result.entries) {
    const matches = artifacts.filter(a => a.manifest.plugin.pluginId === entry.pluginId && (!entry.artifactId || a.artifactId === entry.artifactId));
    if (matches.length !== 1) throw new Error(`Ambiguous or missing artifact for ${entry.pluginId}`);
    const artifact = matches[0]!;
    if (selected.has(entry.pluginId) && selected.get(entry.pluginId)!.artifactId !== artifact.artifactId) throw new Error(`Multiple artifacts for plugin ${entry.pluginId}`);
    selected.set(entry.pluginId, artifact);
  }
  const entries = result.entries.map(entry => ({ ...entry, artifactId: selected.get(entry.pluginId)!.artifactId }));
  const manifests = [...selected.values()].map(a => a.manifest.plugin);
  const content = { profileId: base.profileId, bundles: base.bundles, entries, artifacts: [...selected].map(([id, a]) => [id, a.artifactId]).sort(), hostCapabilities: base.hostCapabilities };
  const active = entries.filter(e => e.enabled && e.state !== "skipped");
  return { ...base, entries, manifests, patchResults: result.results,
    services: active.flatMap(e => e.provides.map(serviceId => ({ serviceId, providerEntryId: e.entryId, providerPluginId: e.pluginId, required: e.required }))),
    codecs: manifests.flatMap(m => m.codecs.map(c => ({ module: c.module, eventTypes: [...c.eventTypes], pluginId: m.pluginId, required: true }))),
    startupRequirements: active.filter(e => e.required).map(e => e.entryId),
    digest: createHash("sha256").update(canonical(content)).digest("hex") };
}
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter(k => record[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(record[k])}`).join(",")}}`;
}
