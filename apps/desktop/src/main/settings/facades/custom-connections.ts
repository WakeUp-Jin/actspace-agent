/** custom connection 的增改删、运行时配置和连接检测结果；落盘都经 general.applyNamespaceV4。 */
import type { CustomConnectionInput, SettingsV4Models, SettingsV4Snapshot } from "@actspace/shared";
import { randomUUID } from "node:crypto";
import {
  connectionAuthFields,
  connectionModelPatch,
  customConnectionDefaultModel,
  normalizeCustomConnectionBaseUrl,
  resolvePromptCacheMode,
  uniqueConnectionName,
  validateCustomConnection,
  withoutConnectionAuth,
} from "../custom-connection";
import { normalizePricingMultiplier } from "../sanitize";
import type { SettingsStore } from "../store";
import {
  type CustomConnectionRuntimeConfig,
  type ProviderConnectionProbeResult,
  type ProviderRuntimeError,
  ProviderSettingsError,
} from "../types";
import { cloneJson } from "../utils";
import * as general from "./general";
import * as providers from "./providers";

/** requireModel 为 false 时用于探测模型列表，允许还没有默认模型的连接。 */
export function getCustomConnectionRuntimeConfig(store: SettingsStore, connectionId: string, options: { requireModel?: boolean } = {}): CustomConnectionRuntimeConfig | ProviderRuntimeError {
  const connection = store.getV4().settings.models.connections[connectionId];
  if (!connection || connectionId === `${connection.providerId}:default`) {
    return { ok: false, code: "credential_missing", message: "自定义连接不存在。" };
  }
  if (!connection.defaultModel && options.requireModel !== false) {
    return { ok: false, code: "credential_missing", message: "该连接尚未设置默认模型。" };
  }
  const runtime = providers.getProviderRuntimeConfigForCredential(store, connection.providerId, undefined, connectionId);
  if ("code" in runtime) return runtime;
  return { ...runtime, connectionId, protocol: connection.protocol ?? "openai-completions", model: connection.defaultModel ?? "", authMode: connection.authMode ?? "x-api-key", ...(connection.resolvedAuth ? { resolvedAuth: connection.resolvedAuth } : {}) };
}

export async function createCustomConnection(store: SettingsStore, input: CustomConnectionInput): Promise<SettingsV4Snapshot> {
  return store.enqueueMutation(() => createCustomConnectionQueued(store, input));
}

export async function createCustomConnectionQueued(store: SettingsStore, input: CustomConnectionInput): Promise<SettingsV4Snapshot> {
  validateCustomConnection(input);
  const protocol = input.protocol ?? "openai-completions";
  const connectionId = input.connectionId?.trim() || `custom-${randomUUID()}`;
  if (!/^[a-zA-Z0-9._-]{3,80}$/.test(connectionId)) throw new ProviderSettingsError("连接标识无效。", "write_failed");
  const baseUrl = normalizeCustomConnectionBaseUrl(input.baseUrl, protocol);
  const current = store.getV4();
  const displayName = uniqueConnectionName(input.displayName.trim() || new URL(baseUrl).hostname, current.settings.models.connections);
  if (current.settings.models.connections[connectionId]) throw new ProviderSettingsError("连接标识已存在。", "write_failed");
  store.assertCredentialStorageWritable();
  store.secrets.providerCredentials[`connection:${connectionId}`] = input.apiKey.trim();
  try {
    await store.writeSecretsFile();
    return await general.applyNamespaceV4(store, {
      namespace: "models",
      expectedRevision: current.revision,
      patch: {
        connections: {
          [connectionId]: {
            connectionId,
            providerId: input.providerId,
            protocol,
            displayName,
            defaultModel: customConnectionDefaultModel(input)?.trim() || null,
            promptCacheMode: resolvePromptCacheMode(protocol, input.promptCacheMode),
            ...connectionAuthFields(protocol, input.authMode, input.resolvedAuth),
            ...(input.billingMode ? { billingMode: input.billingMode } : {}),
            ...(input.catalogId?.trim() ? { catalogId: input.catalogId.trim().slice(0, 80) } : {}),
            enabled: true,
            baseUrl,
            proxy: input.proxy ?? { enabled: false, url: null },
            lastConnection: { status: "untested" },
            defaultPricingMultiplier: normalizePricingMultiplier(input.pricingMultiplier ?? 1),
            additionalCredentials: [],
          },
        },
        ...connectionModelPatch(input, connectionId, protocol, current.settings.models),
      },
    });
  } catch (error) {
    delete store.secrets.providerCredentials[`connection:${connectionId}`];
    await store.writeSecretsFile();
    throw error;
  }
}

export async function removeCustomConnection(store: SettingsStore, connectionId: string): Promise<SettingsV4Snapshot> {
  return store.enqueueMutation(() => removeCustomConnectionQueued(store, connectionId));
}

export async function removeCustomConnectionQueued(store: SettingsStore, connectionId: string): Promise<SettingsV4Snapshot> {
  const current = store.getV4();
  if (!current.settings.models.connections[connectionId]) throw new ProviderSettingsError("连接不存在。", "write_failed");
  const result = await general.applyNamespaceV4(store, {
    namespace: "models",
    expectedRevision: current.revision,
    patch: { connections: { [connectionId]: null } } as Partial<SettingsV4Models>,
  });
  delete store.secrets.providerCredentials[`connection:${connectionId}`];
  await store.writeSecretsFile();
  return result;
}

export async function updateCustomConnection(store: SettingsStore, input: Omit<CustomConnectionInput, "apiKey"> & { connectionId: string; apiKey?: string }): Promise<SettingsV4Snapshot> {
  return store.enqueueMutation(() => updateCustomConnectionQueued(store, input));
}

export async function updateCustomConnectionQueued(store: SettingsStore, input: Omit<CustomConnectionInput, "apiKey"> & { connectionId: string; apiKey?: string }): Promise<SettingsV4Snapshot> {
  const current = store.getV4();
  const existing = current.settings.models.connections[input.connectionId];
  if (!existing) throw new ProviderSettingsError("连接不存在。", "write_failed");
  validateCustomConnection({ ...input, apiKey: "preserved", protocol: input.protocol ?? existing.protocol }, { requireModel: false });
  if (input.providerId !== existing.providerId || (input.protocol && input.protocol !== (existing.protocol ?? "openai-completions"))) {
    throw new ProviderSettingsError("连接协议不可更改，请创建新的连接。", "write_failed");
  }
  const protocol = existing.protocol ?? "openai-completions";
  const baseUrl = normalizeCustomConnectionBaseUrl(input.baseUrl, protocol);
  const proxy = input.proxy ?? existing.proxy;
  const authMode = input.authMode ?? existing.authMode;
  const keyChanged = Boolean(input.apiKey?.trim());
  // 只有影响请求能否打通的字段变化才作废测试结果和已识别的认证方式；改名、计费不需要重测。
  const reachabilityChanged = keyChanged || baseUrl !== existing.baseUrl || authMode !== existing.authMode
    || proxy.enabled !== existing.proxy.enabled || (proxy.url ?? null) !== (existing.proxy.url ?? null);
  const auth = connectionAuthFields(protocol, authMode, reachabilityChanged ? undefined : input.resolvedAuth ?? existing.resolvedAuth);
  const previousSecrets = cloneJson(store.secrets);
  try {
  if (input.apiKey?.trim()) {
    store.assertCredentialStorageWritable();
    store.secrets.providerCredentials[`connection:${input.connectionId}`] = input.apiKey.trim();
    await store.writeSecretsFile();
  }
  return await general.applyNamespaceV4(store, {
    namespace: "models",
    expectedRevision: current.revision,
    patch: {
      connections: { [input.connectionId]: {
        ...withoutConnectionAuth(existing),
        protocol,
        displayName: input.displayName.trim() || existing.displayName,
        promptCacheMode: resolvePromptCacheMode(protocol, input.promptCacheMode ?? existing.promptCacheMode),
        ...(input.catalogId?.trim() ? { catalogId: input.catalogId.trim().slice(0, 80) } : {}),
        ...auth,
        ...(input.billingMode ? { billingMode: input.billingMode } : {}),
        ...(input.pricingMultiplier !== undefined ? { defaultPricingMultiplier: normalizePricingMultiplier(input.pricingMultiplier) } : {}),
        baseUrl,
        proxy,
        lastConnection: reachabilityChanged ? { status: "untested" } : existing.lastConnection,
      } },
    },
  });
  } catch (error) {
    store.secrets = previousSecrets;
    if (input.apiKey?.trim()) await store.writeSecretsFile();
    throw error;
  }
}

export async function markCustomConnectionResult(store: SettingsStore, connectionId: string, result: ProviderConnectionProbeResult): Promise<void> {
  await store.enqueueMutation(async () => {
    const current = store.getV4();
    const connection = current.settings.models.connections[connectionId];
    if (!connection) throw new ProviderSettingsError("连接不存在。", "write_failed");
    await general.applyNamespaceV4(store, {
      namespace: "models",
      expectedRevision: current.revision,
      patch: {
        connections: {
          [connectionId]: {
            ...connection,
            ...(connection.authMode === "auto" && result.resolvedAuth ? { resolvedAuth: result.resolvedAuth } : {}),
            lastConnection: {
              status: result.ok ? "available" : "unavailable",
              checkedAt: result.checkedAt,
              ...(result.errorKind && { errorKind: result.errorKind }),
              message: result.message?.slice(0, 300),
            },
          },
        },
      },
    });
  });
}
