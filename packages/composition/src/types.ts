import type { JsonValue, PluginManifest } from "@actspace/cordis-adapter";
import type { CompositionEntry, PatchOperationResult } from "@actspace/bundle";
export type ServiceAdmission = { readonly serviceId: string; readonly providerEntryId: string; readonly providerPluginId: string; readonly required: boolean };
export type CodecAdmission = { readonly module: string; readonly eventTypes: readonly string[]; readonly pluginId: string; readonly required: boolean };
export type CompositionDiagnostic = { readonly severity: "warning" | "error" | "info"; readonly message: string; readonly entryId?: string };
export type ResolvedComposition = {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly bundles: readonly { readonly id: string; readonly version: string }[];
  readonly manifests: readonly PluginManifest[];
  readonly entries: readonly CompositionEntry[];
  readonly services?: readonly ServiceAdmission[];
  readonly codecs?: readonly CodecAdmission[];
  readonly patchResults: readonly PatchOperationResult[];
  readonly hostCapabilities: readonly string[];
  readonly warnings: readonly string[];
  readonly diagnostics?: readonly CompositionDiagnostic[];
  readonly digest: string;
  readonly config: JsonValue;
  readonly loaderConfig?: JsonValue;
  readonly startupRequirements?: readonly string[];
};
export type BootManifest = ResolvedComposition & {
  readonly loaderConfig: JsonValue;
  readonly startupRequirements: readonly string[];
};
