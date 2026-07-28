import {
  normalizeModelKey,
  type ModelDefinition,
  type ModelKey,
  type ModelSelectionId,
} from "./model-config";
import { PROVIDER_IDS, type ProviderId } from "./provider-config";
import type {
  InstalledModelSettings,
  ProviderConnectionState,
} from "./settings";

export type ModelPurpose = "chat" | "utility" | "explore" | "kairos" | "vision";

export interface ProviderAvailability {
  enabled: boolean;
  hasApiKey: boolean;
  lastConnection: ProviderConnectionState;
  additionalCredentials?: Record<string, ProviderCredentialAvailability>;
}

export interface ProviderCredentialAvailability {
  hasApiKey: boolean;
  lastConnection: ProviderConnectionState;
}

export interface ModelSnapshot {
  providers: Record<ProviderId, ProviderAvailability>;
  definitions: Partial<Record<ModelKey, ModelDefinition>>;
  installedModels: Partial<Record<ModelKey, InstalledModelSettings>>;
}

export type ModelUnavailabilityReason =
  | "model_missing"
  | "provider_disabled"
  | "provider_disconnected"
  | "connection_unavailable"
  | "credential_missing"
  | "credential_unavailable"
  | "model_not_installed"
  | "model_disabled"
  | "capability_mismatch";

export interface UsableModel {
  key: ModelKey;
  definition: ModelDefinition;
  installed: InstalledModelSettings;
  provider: ProviderAvailability;
}

export type ModelResolution =
  | { ok: true; model: UsableModel }
  | {
      ok: false;
      key?: ModelKey;
      definition?: ModelDefinition;
      reason: ModelUnavailabilityReason;
    };

export function capabilityMatchesPurpose(definition: ModelDefinition, purpose: ModelPurpose): boolean {
  const { capabilities } = definition;
  if (purpose === "vision") return capabilities.input.includes("image");
  if (!capabilities.input.includes("text")) return false;
  if (purpose === "utility") return true;
  return capabilities.toolUse === "verified" || capabilities.toolUse === "declared";
}

export function resolveConfiguredModel(
  snapshot: ModelSnapshot,
  selection: ModelSelectionId,
  purpose: ModelPurpose,
): ModelResolution {
  const key = normalizeModelKey(selection);
  if (!key) return { ok: false, reason: "model_missing" };

  const definition = snapshot.definitions[key];
  if (!definition) return { ok: false, key, reason: "model_missing" };

  const provider = snapshot.providers[definition.provider];
  if (!provider.enabled) return { ok: false, key, definition, reason: "provider_disabled" };
  const installed = snapshot.installedModels[key];
  if (!installed) return { ok: false, key, definition, reason: "model_not_installed" };
  if (!installed.enabled) return { ok: false, key, definition, reason: "model_disabled" };
  if (installed.credentialId) {
    const credential = provider.additionalCredentials?.[installed.credentialId];
    if (!credential?.hasApiKey) return { ok: false, key, definition, reason: "credential_missing" };
    if (credential.lastConnection.status === "unavailable") {
      return { ok: false, key, definition, reason: "credential_unavailable" };
    }
  } else {
    if (!provider.hasApiKey) return { ok: false, key, definition, reason: "provider_disconnected" };
    // A configured credential is usable before the optional connection test runs.
    // Only an explicit failed test should remove models inheriting the default Key.
    if (provider.lastConnection.status === "unavailable") {
      return { ok: false, key, definition, reason: "connection_unavailable" };
    }
  }
  if (!capabilityMatchesPurpose(definition, purpose)) {
    return { ok: false, key, definition, reason: "capability_mismatch" };
  }

  return { ok: true, model: { key, definition, installed, provider } };
}

export function listUsableModels(snapshot: ModelSnapshot, purpose: ModelPurpose): UsableModel[] {
  const providerOrder = new Map<ProviderId, number>(PROVIDER_IDS.map((id, index) => [id, index]));

  return Object.values(snapshot.definitions)
    .filter((definition): definition is ModelDefinition => Boolean(definition))
    .map((definition) => resolveConfiguredModel(snapshot, definition.key, purpose))
    .filter((resolution): resolution is Extract<ModelResolution, { ok: true }> => resolution.ok)
    .map((resolution) => resolution.model)
    .sort((left, right) => {
      const providerDelta =
        (providerOrder.get(left.definition.provider) ?? Number.MAX_SAFE_INTEGER) -
        (providerOrder.get(right.definition.provider) ?? Number.MAX_SAFE_INTEGER);
      if (providerDelta !== 0) return providerDelta;
      const labelDelta = left.definition.label.localeCompare(right.definition.label);
      return labelDelta !== 0 ? labelDelta : left.key.localeCompare(right.key);
    });
}
