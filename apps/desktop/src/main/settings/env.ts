/** 把 settings 同步到 process.env：LLM 凭据不进 env，只保留搜索 key 和工具偏好的 env 兼容。拆分时原样搬迁，以后退役。 */
import { SEARCH_PROVIDER_IDS } from "@actspace/shared";
import { SEARCH_PROVIDER_ENV_KEYS } from "./constants";
import type { PersistedSecretProviderId, PersistedSecrets, PersistedSettingsV3 } from "./types";

export function setOrDeleteEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

export function applyProviderKey(secrets: PersistedSecrets, provider: PersistedSecretProviderId, envKey: string): void {
  setOrDeleteEnv(envKey, secrets[provider]);
}

/** Desktop LLM credentials stay main-only; only search/tool preferences retain env compatibility. */
export function applyToEnv(settings: PersistedSettingsV3, secrets: PersistedSecrets, reloadEnv: () => void): void {
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.KIMI_API_KEY;
  for (const id of SEARCH_PROVIDER_IDS) applyProviderKey(secrets, id, SEARCH_PROVIDER_ENV_KEYS[id]);
  process.env.IMAGE_GENERATION_BASE_URL = settings.imageGeneration.baseUrl;
  process.env.IMAGE_GENERATION_MODEL = settings.imageGeneration.model;
  process.env.ACTSPACE_DISABLED_TOOLS = settings.agent.disabledTools.join(",");
  process.env.ACTSPACE_BASH_ALWAYS_ASK = settings.agent.bashAlwaysAsk ? "1" : "0";
  setOrDeleteEnv("LLM_TEMPERATURE", settings.agent.temperature === null ? undefined : String(settings.agent.temperature));
  setOrDeleteEnv("LLM_MAX_TOKENS", settings.agent.maxTokens === null ? undefined : String(settings.agent.maxTokens));
  reloadEnv();
}
