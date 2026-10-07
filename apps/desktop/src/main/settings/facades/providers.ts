/** provider 连接、凭据和 key：连接的增改删、额外凭据、运行时配置、连接检测结果，以及旧 key 弹窗用的 setProviderKey / clearProviderKey。 */
import {
  type AppSettings,
  type LlmProviderId,
  type ModelKey,
  PROVIDER_REGISTRY,
  type ProviderConnectionSettings,
  type SecretProviderId,
} from "@actspace/shared";
import { resolveAuthScheme, resolvePromptCacheMode } from "../custom-connection";
import { defaultProviderSettings } from "../defaults";
import {
  migrateLegacyProviderBaseUrl,
  normalizeBaseUrl,
  normalizeCredentialLabel,
  normalizeOptionalBaseUrl,
  normalizePricingMultiplier,
  normalizeProxySettings,
  normalizeProxyUrl,
} from "../sanitize";
import { isValidCredentialId, providerCredentialSecretId } from "../secrets-file";
import type { SettingsStore } from "../store";
import {
  type ProviderConnectionMutationInput,
  type ProviderConnectionProbeResult,
  type ProviderCredentialMutationResult,
  type ProviderRuntimeConfig,
  type ProviderRuntimeError,
  ProviderSettingsError,
} from "../types";
import { cloneJson } from "../utils";
import * as general from "./general";
import * as media from "./media";
import * as search from "./search";

export async function updateProviderConnection(store: SettingsStore, input: ProviderConnectionMutationInput): Promise<AppSettings> {
  return store.enqueueMutation(async () => {
    const previousSettings = cloneJson(store.settings);
    const previousSecrets = cloneJson(store.secrets);
    let secretsWritten = false;
    try {
      const current = store.settings.providers[input.provider];
      const next: ProviderConnectionSettings = {
        enabled: input.enabled ?? current.enabled,
        baseUrl: input.baseUrl === undefined
          ? current.baseUrl
          : migrateLegacyProviderBaseUrl(input.provider, normalizeOptionalBaseUrl(input.baseUrl)),
        proxy: input.proxy === undefined ? { ...current.proxy } : normalizeProxySettings(input.proxy),
        lastConnection: { status: "untested" },
        defaultPricingMultiplier: input.defaultPricingMultiplier === undefined
          ? current.defaultPricingMultiplier
          : normalizePricingMultiplier(input.defaultPricingMultiplier),
        additionalCredentials: cloneJson(current.additionalCredentials),
      };

      if (input.apiKey !== undefined) {
        store.assertCredentialStorageWritable();
        if (input.apiKey === null) {
          delete store.secrets[input.provider];
        } else {
          const trimmed = input.apiKey.trim();
          if (!trimmed) throw new ProviderSettingsError("API Key 不能为空。", "invalid_api_key");
          store.secrets[input.provider] = trimmed;
        }
      }

      if (input.provider === "openrouter" && input.managementKey !== undefined) {
        store.assertCredentialStorageWritable();
        if (input.managementKey === null) {
          delete store.secrets["openrouter-management"];
        } else {
          const trimmed = input.managementKey.trim();
          if (!trimmed) throw new ProviderSettingsError("Management Key 不能为空。", "invalid_api_key");
          store.secrets["openrouter-management"] = trimmed;
        }
      }

      store.settings.providers[input.provider] = next;
      if (input.apiKey !== undefined || (input.provider === "openrouter" && input.managementKey !== undefined)) {
        await store.writeSecretsFile();
        secretsWritten = true;
      }
      await store.writeSettingsFile();
      store.applyToEnv();
      return general.get(store);
    } catch (error) {
      store.settings = previousSettings;
      store.secrets = previousSecrets;
      if (secretsWritten) await store.restoreFilesBestEffort(previousSettings, previousSecrets);
      if (error instanceof ProviderSettingsError) throw error;
      throw new ProviderSettingsError("供应商设置写入失败。", "write_failed");
    }
  });
}

export async function removeProvider(store: SettingsStore, provider: LlmProviderId): Promise<AppSettings> {
  return store.enqueueMutation(async () => {
    const previousSettings = cloneJson(store.settings);
    const previousSecrets = cloneJson(store.secrets);
    let secretsWritten = false;
    try {
      store.assertCredentialStorageWritable();
      delete store.secrets[provider];
      if (provider === "openrouter") delete store.secrets["openrouter-management"];
      for (const secretId of Object.keys(store.secrets.providerCredentials)) {
        if (secretId.startsWith(`${provider}:`)) delete store.secrets.providerCredentials[secretId];
      }
      store.settings.providers[provider] = defaultProviderSettings();

      await store.writeSecretsFile();
      secretsWritten = true;
      await store.writeSettingsFile();
      store.applyToEnv();
      return general.get(store);
    } catch (error) {
      store.settings = previousSettings;
      store.secrets = previousSecrets;
      if (secretsWritten) await store.restoreFilesBestEffort(previousSettings, previousSecrets);
      if (error instanceof ProviderSettingsError) throw error;
      throw new ProviderSettingsError("服务商移除失败。", "write_failed");
    }
  });
}

export function getProviderRuntimeConfig(store: SettingsStore, provider: LlmProviderId): ProviderRuntimeConfig | ProviderRuntimeError {
  return getProviderRuntimeConfigForCredential(store, provider);
}

export function getProviderRuntimeConfigForCredential(
  store: SettingsStore,
  provider: LlmProviderId,
  credentialId?: string,
  connectionId?: string,
): ProviderRuntimeConfig | ProviderRuntimeError {
  const isCustom = Boolean(connectionId && connectionId !== `${provider}:default`);
  const connection = isCustom ? store.getV4().settings.models.connections[connectionId!] : undefined;
  if (isCustom && (!connection || connection.providerId !== provider)) {
    return { ok: false, code: "credential_missing", message: "模型绑定的连接不存在或不匹配。" };
  }
  const settings = connection ?? store.settings.providers[provider];
  if (!settings.enabled) {
    return { ok: false, code: "provider_disabled", message: "该服务商已停用。" };
  }
  const credential = credentialId
    ? settings.additionalCredentials.find((item) => item.id === credentialId)
    : undefined;
  if (credentialId && !credential) {
    return { ok: false, code: "credential_missing", message: "模型绑定的额外 API Key 不存在。" };
  }
  const apiKey = isCustom
    ? store.secrets.providerCredentials[`connection:${connectionId}`]
    : credentialId
    ? store.getStoredProviderCredential(provider, credentialId)
    : store.getStoredKey(provider);
  if (!apiKey) return credentialId
    ? { ok: false, code: "credential_missing", message: "模型绑定的额外 API Key 无法读取。" }
    : { ok: false, code: "api_key_missing", message: "尚未配置 API Key。" };

  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(settings.baseUrl ?? PROVIDER_REGISTRY[provider].defaultBaseUrl);
  } catch {
    return { ok: false, code: "invalid_base_url", message: "Base URL 配置无效。" };
  }

  let proxyUrl: string | undefined;
  if (settings.proxy.enabled) {
    if (!settings.proxy.url) {
      return { ok: false, code: "invalid_proxy_url", message: "代理已开启但未配置地址。" };
    }
    try {
      proxyUrl = normalizeProxyUrl(settings.proxy.url);
    } catch {
      return { ok: false, code: "invalid_proxy_url", message: "代理地址配置无效。" };
    }
  }

  return {
    provider,
    ...(connection && { protocol: connection.protocol ?? "openai-completions" }),
    ...(connection && { promptCacheMode: resolvePromptCacheMode(connection.protocol ?? "openai-completions", connection.promptCacheMode) }),
    ...(connection && { billingMode: connection.billingMode ?? "manual" }),
    ...(connection?.protocol === "anthropic-messages" && { authScheme: resolveAuthScheme(connection) }),
    apiKey,
    baseUrl,
    pricingMultiplier: credential?.pricingMultiplier ?? settings.defaultPricingMultiplier ?? 1,
    ...(proxyUrl && { transport: { proxyUrl } }),
  };
}

export async function addProviderCredential(store: SettingsStore, input: {
  provider: LlmProviderId;
  label: string;
  apiKey: string;
  pricingMultiplier?: number;
}): Promise<AppSettings> {
  return store.enqueueMutation(async () => {
    const previousSettings = cloneJson(store.settings);
    const previousSecrets = cloneJson(store.secrets);
    let secretsWritten = false;
    try {
      store.assertCredentialStorageWritable();
      const apiKey = input.apiKey.trim();
      if (!apiKey) throw new ProviderSettingsError("API Key 不能为空。", "invalid_api_key");
      const id = store.createCredentialId();
      if (!isValidCredentialId(id)) throw new ProviderSettingsError("额外 API Key 标识无效。", "write_failed");
      if (store.settings.providers[input.provider].additionalCredentials.some((credential) => credential.id === id)) {
        throw new ProviderSettingsError("额外 API Key 标识冲突，请重试。", "write_failed");
      }
      store.settings.providers[input.provider].additionalCredentials.push({
        id,
        label: normalizeCredentialLabel(input.label),
        pricingMultiplier: normalizePricingMultiplier(input.pricingMultiplier ?? 1),
        lastConnection: { status: "untested" },
      });
      store.secrets.providerCredentials[providerCredentialSecretId(input.provider, id)] = apiKey;
      await store.writeSecretsFile();
      secretsWritten = true;
      await store.writeSettingsFile();
      return general.get(store);
    } catch (error) {
      store.settings = previousSettings;
      store.secrets = previousSecrets;
      if (secretsWritten) await store.restoreFilesBestEffort(previousSettings, previousSecrets);
      if (error instanceof ProviderSettingsError) throw error;
      throw new ProviderSettingsError("额外 API Key 写入失败。", "write_failed");
    }
  });
}

export async function updateProviderCredential(
  store: SettingsStore,
  provider: LlmProviderId,
  credentialId: string,
  label: string,
  pricingMultiplier?: number,
): Promise<ProviderCredentialMutationResult> {
  return store.enqueueMutation(async () => {
    const previous = cloneJson(store.settings);
    const credential = store.settings.providers[provider].additionalCredentials.find((item) => item.id === credentialId);
    if (!credential) return { ok: false, code: "credential_not_found", message: "额外 API Key 不存在。" };
    try {
      credential.label = normalizeCredentialLabel(label);
      if (pricingMultiplier !== undefined) credential.pricingMultiplier = normalizePricingMultiplier(pricingMultiplier);
      await store.writeSettingsFile();
      return { ok: true };
    } catch {
      store.settings = previous;
      throw new ProviderSettingsError("额外 API Key 设置写入失败。", "write_failed");
    }
  });
}

export async function removeProviderCredential(
  store: SettingsStore,
  provider: LlmProviderId,
  credentialId: string,
): Promise<ProviderCredentialMutationResult> {
  return store.enqueueMutation(async () => {
    const credentials = store.settings.providers[provider].additionalCredentials;
    if (!credentials.some((item) => item.id === credentialId)) {
      return { ok: false, code: "credential_not_found", message: "额外 API Key 不存在。" };
    }
    const references = Object.entries(store.settings.installedModels)
      .filter(([key, model]) => key.startsWith(`${provider}:`) && model?.credentialId === credentialId)
      .map(([key]) => key as ModelKey);
    if (
      store.settings.imageInspection.modelKey.startsWith(`${provider}:`) &&
      store.settings.imageInspection.credentialId === credentialId
    ) {
      references.push(store.settings.imageInspection.modelKey);
    }
    if (references.length > 0) {
      return { ok: false, code: "credential_in_use", message: "该 API Key 仍被模型使用。", references };
    }

    const previousSettings = cloneJson(store.settings);
    const previousSecrets = cloneJson(store.secrets);
    let secretsWritten = false;
    try {
      store.assertCredentialStorageWritable();
      store.settings.providers[provider].additionalCredentials = credentials.filter((item) => item.id !== credentialId);
      delete store.secrets.providerCredentials[providerCredentialSecretId(provider, credentialId)];
      await store.writeSecretsFile();
      secretsWritten = true;
      await store.writeSettingsFile();
      return { ok: true };
    } catch {
      store.settings = previousSettings;
      store.secrets = previousSecrets;
      if (secretsWritten) await store.restoreFilesBestEffort(previousSettings, previousSecrets);
      throw new ProviderSettingsError("额外 API Key 删除失败。", "write_failed");
    }
  });
}

export async function markProviderCredentialConnectionResult(
  store: SettingsStore,
  provider: LlmProviderId,
  credentialId: string,
  result: ProviderConnectionProbeResult,
): Promise<ProviderCredentialMutationResult> {
  return store.enqueueMutation(async () => {
    const previous = cloneJson(store.settings);
    const credential = store.settings.providers[provider].additionalCredentials.find((item) => item.id === credentialId);
    if (!credential) return { ok: false, code: "credential_not_found", message: "额外 API Key 不存在。" };
    try {
      credential.lastConnection = {
        status: result.ok ? "available" : "unavailable",
        checkedAt: result.checkedAt,
        ...(result.errorKind && { errorKind: result.errorKind }),
        message: result.message.slice(0, 300),
      };
      await store.writeSettingsFile();
      return { ok: true };
    } catch {
      store.settings = previous;
      throw new ProviderSettingsError("额外 API Key 状态写入失败。", "write_failed");
    }
  });
}

export function getOpenRouterManagementRuntimeConfig(store: SettingsStore): ProviderRuntimeConfig | ProviderRuntimeError {
  const runtime = getProviderRuntimeConfig(store, "openrouter");
  if ("code" in runtime) return runtime;
  const managementKey = store.getStoredKey("openrouter-management");
  if (!managementKey) {
    return { ok: false, code: "api_key_missing", message: "尚未配置 OpenRouter Management Key。" };
  }
  return { ...runtime, apiKey: managementKey };
}

export async function markProviderConnectionResult(
  store: SettingsStore,
  provider: LlmProviderId,
  result: ProviderConnectionProbeResult,
): Promise<void> {
  await store.enqueueMutation(async () => {
    const previous = cloneJson(store.settings);
    try {
      store.settings.providers[provider].lastConnection = {
        status: result.ok ? "available" : "unavailable",
        checkedAt: result.checkedAt,
        ...(result.errorKind && { errorKind: result.errorKind }),
        message: result.message.slice(0, 300),
      };
      await store.writeSettingsFile();
    } catch (error) {
      store.settings = previous;
      throw error;
    }
  });
}

/** Compatibility API for the current key modal; all LLM providers share the v2 connection path. */
export async function setProviderKey(store: SettingsStore, provider: SecretProviderId, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  if (provider === "speech-minimax") return media.setSpeechKey(store, apiKey);
  if (provider === "deepseek" || provider === "kimi" || provider === "openrouter") {
    try {
      await updateProviderConnection(store, { provider, apiKey });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "API Key 保存失败。" };
    }
  }
  if (provider === "image-generation") {
    try {
      await media.updateImageGeneration(store, {
        apiKey,
        baseUrl: store.settings.imageGeneration.baseUrl,
        model: store.settings.imageGeneration.model,
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "API Key 保存失败。" };
    }
  }
  return search.setSearchProviderKey(store, provider, apiKey);
}

export async function clearProviderKey(store: SettingsStore, provider: SecretProviderId): Promise<{ ok: boolean }> {
  if (provider === "speech-minimax") return media.setSpeechKey(store, null);
  if (provider === "deepseek" || provider === "kimi" || provider === "openrouter") {
    try {
      await updateProviderConnection(store, { provider, apiKey: null });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }
  if (provider === "image-generation") {
    return store.enqueueMutation(async () => {
      const previous = { ...store.secrets };
      try {
        store.assertCredentialStorageWritable();
        delete store.secrets["image-generation"];
        await store.writeSecretsFile();
        store.applyToEnv();
        return { ok: true };
      } catch {
        store.secrets = previous;
        return { ok: false };
      }
    });
  }
  return search.clearSearchProviderKey(store, provider);
}
