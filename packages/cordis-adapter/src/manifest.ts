import { entryId, eventTypeId, pluginId, serviceId, type EntryId, type EventTypeId, type PluginId, type ServiceId } from "./identity.js";
import type { JsonValue } from "./plugin-contract.js";
export type PluginSource = { readonly kind: "builtin" | "local-path" | "managed-package"; readonly reference: string; readonly integrity?: string };
export type PluginCodecDescriptor = { readonly module: string; readonly eventTypes: readonly EventTypeId[] };
export type PluginFrontendRequirement = { readonly required: boolean; readonly rendererKeys: readonly string[] } | null;
export type PluginHostRequirement = { readonly required: readonly string[]; readonly optional: readonly string[] };
export type PluginBehaviorDescriptor = { readonly entryId: EntryId; readonly module: string; readonly required: boolean; readonly enabled: boolean; readonly config: JsonValue; readonly host: PluginHostRequirement; readonly frontend: PluginFrontendRequirement; readonly provides?: readonly ServiceId[]; readonly injects?: readonly ServiceId[] };
export type PluginContributionSummary = { readonly services: readonly string[]; readonly events: readonly EventTypeId[]; readonly contributions: readonly string[] };
export type PluginManifest = { readonly schemaVersion: 1; readonly pluginId: PluginId; readonly version: string; readonly name: string; readonly runtimeContract: "actspace.runtime.v2"; readonly source: PluginSource; readonly codecs: readonly PluginCodecDescriptor[]; readonly behaviors: readonly PluginBehaviorDescriptor[]; readonly contributions: PluginContributionSummary };
export type BuiltinPluginManifestInput = { readonly pluginId: string; readonly version: string; readonly name: string; readonly entry: { readonly entryId: string; readonly behavior: string; readonly codec?: string; readonly required?: boolean; readonly enabled?: boolean }; readonly config?: JsonValue; readonly host: { readonly required: readonly string[]; readonly optional: readonly string[] }; readonly frontend: PluginFrontendRequirement; readonly injects?: readonly string[]; readonly contributions: { readonly services: readonly string[]; readonly tools: readonly string[]; readonly prompts: readonly string[]; readonly events: readonly string[] } };

export function defineBuiltinPluginManifest(input: BuiltinPluginManifestInput): PluginManifest {
  const events = input.contributions.events.map(eventTypeId);
  return validatePluginManifest({ schemaVersion: 1, pluginId: pluginId(input.pluginId), version: input.version, name: input.name, runtimeContract: "actspace.runtime.v2", source: { kind: "builtin", reference: `builtin:${input.pluginId}` }, codecs: input.entry.codec === undefined ? [] : [{ module: input.entry.codec, eventTypes: events }], behaviors: [{ entryId: entryId(input.entry.entryId), module: input.entry.behavior, required: input.entry.required ?? true, enabled: input.entry.enabled ?? true, config: input.config ?? {}, host: input.host, frontend: input.frontend, provides: input.contributions.services.map(serviceId), injects: (input.injects ?? []).map(serviceId) }], contributions: { services: input.contributions.services, events, contributions: [...input.contributions.tools, ...input.contributions.prompts] } });
}

export function validatePluginManifest(value: PluginManifest): PluginManifest {
  pluginId(value.pluginId); if (value.schemaVersion !== 1 || value.runtimeContract !== "actspace.runtime.v2" || !value.version || !value.name) throw new Error(`Invalid manifest for ${value.pluginId}.`);
  if (!value.source.reference || /^https?:/i.test(value.source.reference)) throw new Error(`Plugin ${value.pluginId} has an untrusted source.`);
  if (!isJsonValue(value)) throw new Error(`Plugin ${value.pluginId} manifest is not JSON-safe.`);
  const entries = new Set<string>(); for (const behavior of value.behaviors) { entryId(behavior.entryId); if (entries.has(behavior.entryId)) throw new Error(`Duplicate Entry id ${behavior.entryId}.`); entries.add(behavior.entryId); rejectSecretConfig(behavior.config); for (const service of [...behavior.provides ?? [], ...behavior.injects ?? []]) serviceId(service); }
  for (const codec of value.codecs) for (const type of codec.eventTypes) eventTypeId(type);
  return Object.freeze(value);
}
function rejectSecretConfig(value: JsonValue, path = "config"): void { if (value === null || typeof value !== "object") return; if (Array.isArray(value)) { value.forEach((child, index) => rejectSecretConfig(child, `${path}[${index}]`)); return; } for (const [key, child] of Object.entries(value)) { if (/^(authorization|api[_-]?key|password|secret|token|cookie)$/i.test(key)) throw new Error(`Secret field ${path}.${key} is forbidden; use credentialRef.`); rejectSecretConfig(child, `${path}.${key}`); } }
function isJsonValue(value: unknown): boolean { if (value === null || typeof value === "string" || typeof value === "boolean") return true; if (typeof value === "number") return Number.isFinite(value); if (Array.isArray(value)) return value.every(isJsonValue); if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false; return Object.values(value as Record<string, unknown>).every(isJsonValue); }
