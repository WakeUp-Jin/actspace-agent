/** provider 连接和 key：内置服务商的写入、运行时配置，以及设置页 / 语音用的 setProviderKey / clearProviderKey。 */
import {
  type AppSettings,
  type LlmProviderId,
  PROVIDER_REGISTRY,
  type ProviderConnectionSettings,
  type SecretProviderId,
} from "@actspace/shared";
import { resolveAuthScheme, resolvePromptCacheMode } from "../custom-connection";
import {
  migrateLegacyProviderBaseUrl,
  normalizeBaseUrl,
  normalizeOptionalBaseUrl,
  normalizePricingMultiplier,
  normalizeProxySettings,
  normalizeProxyUrl,
} from "../sanitize";
import type { SettingsStore } from "../store";
import {
  type ProviderConnectionMutationInput,
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

export function getProviderRuntimeConfig(store: SettingsStore, provider: LlmProviderId): ProviderRuntimeConfig | ProviderRuntimeError {
  return getConnectionRuntimeConfig(store, provider);
}

/** 连接的运行时配置：`<provider>:default` 读旧的服务商设置，其余是自定义连接。 */
export function getConnectionRuntimeConfig(
  store: SettingsStore,
  provider: LlmProviderId,
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
  const apiKey = isCustom
    ? store.secrets.providerCredentials[`connection:${connectionId}`]
    : store.getStoredKey(provider);
  if (!apiKey) return { ok: false, code: "api_key_missing", message: "尚未配置 API Key。" };

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
    ...(connection?.protocol === "anthropic-messages" && { authScheme: resolveAuthScheme(connection) }),
    apiKey,
    baseUrl,
    pricingMultiplier: settings.defaultPricingMultiplier ?? 1,
    ...(proxyUrl && { transport: { proxyUrl } }),
  };
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
