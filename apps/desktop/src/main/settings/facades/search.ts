/** 搜索 provider 的 key 和用量查询。 */
import type { SearchProviderId, SearchUsageResult } from "@actspace/shared";
import type { SettingsStore } from "../store";
import { ProviderSettingsError } from "../types";

export async function getSearchUsage(store: SettingsStore): Promise<SearchUsageResult> {
  const key = store.getStoredKey("tavily");
  if (!key) return { ok: false, error: "未配置 Tavily API Key。" };
  try {
    const response = await fetch("https://api.tavily.com/usage", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { ok: false, error: `Tavily 用量查询失败（HTTP ${response.status}）。` };
    const data = (await response.json()) as { account?: { plan_usage?: number; plan_limit?: number | null } };
    return {
      ok: true,
      tavily: {
        planUsage: data.account?.plan_usage ?? 0,
        planLimit: data.account?.plan_limit ?? null,
      },
    };
  } catch {
    return { ok: false, error: "Tavily 用量查询失败（网络错误或超时）。" };
  }
}

export async function setSearchProviderKey(
  store: SettingsStore,
  provider: SearchProviderId,
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  return store.enqueueMutation(async () => {
    const previous = { ...store.secrets };
    try {
      store.assertCredentialStorageWritable();
      const trimmed = apiKey.trim();
      if (!trimmed) return { ok: false, error: "API Key 不能为空。" };
      store.secrets[provider] = trimmed;
      await store.writeSecretsFile();
      store.applyToEnv();
      return { ok: true };
    } catch (error) {
      store.secrets = previous;
      return {
        ok: false,
        error: error instanceof ProviderSettingsError ? error.message : "API Key 保存失败。",
      };
    }
  });
}

export async function clearSearchProviderKey(store: SettingsStore, provider: SearchProviderId): Promise<{ ok: boolean }> {
  return store.enqueueMutation(async () => {
    const previous = { ...store.secrets };
    try {
      store.assertCredentialStorageWritable();
      delete store.secrets[provider];
      await store.writeSecretsFile();
      store.applyToEnv();
      return { ok: true };
    } catch {
      store.secrets = previous;
      return { ok: false };
    }
  });
}
