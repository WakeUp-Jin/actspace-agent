/** settings 字段的 sanitize / normalize：把磁盘上读到的未知值收敛成合法值，不合法时回落到 fallback 或抛 ProviderSettingsError。不含 custom connection。 */
import { DEFAULT_SPEECH_SETTINGS, isSpeechModel, type SpeechSettings } from "@actspace/shared";
import { dirname, isAbsolute, join } from "node:path";
import {
  DEEPSEEK_FLASH_KEY,
  DEFAULT_IMAGE_INSPECTION_MODEL_KEY,
  DEFAULT_QUICK_OPEN_ACCELERATOR,
  isPublicModelId,
  isImageInspectionModelKey,
  normalizeModelKey,
  type AgentSettingsV2,
  type InstalledModelSettings,
  type ImageInspectionSettings,
  type LlmProviderId,
  type ModelDefinition,
  type ModelId,
  type ModelKey,
  type ProviderConnectionSettings,
  type ProviderConnectionState,
  type ProviderCredentialSettings,
  type ProviderProxySettings,
  type SettingsV4UsagePreferences,
  type SkillsSettings,
  type ShortcutsSettings,
  type TaskModelSettings,
} from "@actspace/shared";
import { BUILTIN_MODEL_ADDED_AT } from "./constants";
import { isValidCredentialId } from "./secrets-file";
import { type PersistedSettingsV3, ProviderSettingsError } from "./types";
import { cloneJson, isRecord } from "./utils";

export function normalizeProxyUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Proxy URL must use HTTP or HTTPS.");
  if (!url.hostname) throw new Error("Proxy URL must include a host.");
  return url.toString().replace(/\/$/, "");
}

export function sanitizeUsagePreferences(value: Record<string, unknown>): SettingsV4UsagePreferences {
  const range = value.range === "24h" || value.range === "7d" || value.range === "30d" || value.range === "all" ? value.range : "30d";
  const status = value.status === "success" || value.status === "error" || value.status === "aborted" || value.status === "unknown" ? value.status : "all";
  const activeTab = value.activeTab === "providers" || value.activeTab === "models" || value.activeTab === "tools" || value.activeTab === "pricing" ? value.activeTab : "requests";
  return {
    range,
    status,
    modelFilter: typeof value.modelFilter === "string" ? value.modelFilter.slice(0, 200) : "",
    showDetails: value.showDetails === true,
    activeTab,
  };
}

export function normalizeModelKeyOrNull(value: unknown): ModelKey | null {
  if (typeof value !== "string") return null;
  return normalizeModelKey(value);
}

export function sanitizeNullableNumber(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export function sanitizeNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return fallback;
  const rounded = Math.round(value * 20) / 20;
  return Math.abs(value - rounded) < Number.EPSILON * 10 ? rounded : fallback;
}

export function sanitizeNullableInteger(value: unknown, min: number, max: number): number | null {
  const number = sanitizeNullableNumber(value, min, max);
  return number === null ? null : Math.floor(number);
}

export function sanitizeShortcuts(input: unknown): ShortcutsSettings {
  const value = isRecord(input) ? input : {};
  return {
    quickOpen: sanitizeQuickOpenShortcut(value.quickOpen),
  };
}

export function sanitizeQuickOpenShortcut(input: unknown): ShortcutsSettings["quickOpen"] {
  const value = isRecord(input) ? input : {};
  const accelerator = typeof value.accelerator === "string" && value.accelerator.trim()
    ? value.accelerator.trim().slice(0, 120)
    : DEFAULT_QUICK_OPEN_ACCELERATOR;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    accelerator,
    target: sanitizeQuickOpenTarget(value.target),
  };
}

export function sanitizeQuickOpenTarget(input: unknown): ShortcutsSettings["quickOpen"]["target"] {
  if (!isRecord(input)) return { kind: "automatic" };
  if (input.kind === "workspace" && typeof input.workspaceId === "string" && input.workspaceId.trim()) {
    return { kind: "workspace", workspaceId: input.workspaceId.trim().slice(0, 200) };
  }
  if (input.kind === "session" && typeof input.sessionId === "string" && input.sessionId.trim()) {
    return { kind: "session", sessionId: input.sessionId.trim().slice(0, 200) };
  }
  return { kind: "automatic" };
}

export function sanitizeImageInspectionSettings(input: unknown): ImageInspectionSettings {
  const value = isRecord(input) ? input : {};
  const modelKey = isImageInspectionModelKey(value.modelKey)
    ? value.modelKey
    : DEFAULT_IMAGE_INSPECTION_MODEL_KEY;
  const credentialId = isValidCredentialId(value.credentialId) ? value.credentialId : undefined;
  return {
    modelKey,
    ...(credentialId && { credentialId }),
  };
}

export function sanitizeImageGenerationSettings(
  input: unknown,
  fallback: PersistedSettingsV3["imageGeneration"],
): PersistedSettingsV3["imageGeneration"] {
  if (!isRecord(input)) return { ...fallback };
  try {
    return {
      baseUrl: normalizeImageGenerationBaseUrl(
        typeof input.baseUrl === "string" ? input.baseUrl : fallback.baseUrl,
      ),
      model: normalizeImageGenerationModel(
        typeof input.model === "string" ? input.model : fallback.model,
      ),
    };
  } catch {
    return { ...fallback };
  }
}

export function normalizeImageGenerationBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new ProviderSettingsError("Base URL 格式无效。", "invalid_base_url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ProviderSettingsError("Base URL 仅支持 HTTP(S)。", "invalid_base_url");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new ProviderSettingsError("Base URL 不能包含认证信息、查询参数或锚点。", "invalid_base_url");
  }
  const normalized = parsed.toString().replace(/\/$/, "");
  if (/\/images\/generations$/i.test(normalized)) {
    throw new ProviderSettingsError("Base URL 请填写服务根路径，不要包含 /images/generations。", "invalid_base_url");
  }
  return normalized;
}

export function normalizeImageGenerationModel(value: string): string {
  const model = value.trim();
  if (!model || model.length > 200 || /[\u0000-\u001f\u007f]/.test(model)) {
    throw new ProviderSettingsError("模型名称无效。", "invalid_model");
  }
  return model;
}

export function sanitizeProviderSettings(
  input: unknown,
  fallback: ProviderConnectionSettings,
  provider?: LlmProviderId,
): ProviderConnectionSettings {
  const value = isRecord(input) ? input : {};
  let baseUrl = fallback.baseUrl;
  if (value.baseUrl === null) baseUrl = null;
  else if (typeof value.baseUrl === "string") {
    try {
      const normalized = normalizeBaseUrl(value.baseUrl);
      baseUrl = provider ? migrateLegacyProviderBaseUrl(provider, normalized) : normalized;
    } catch { baseUrl = fallback.baseUrl; }
  }
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : fallback.enabled,
    baseUrl,
    proxy: sanitizeProxySettings(value.proxy, fallback.proxy),
    lastConnection: sanitizeConnectionState(value.lastConnection, fallback.lastConnection),
    defaultPricingMultiplier: normalizePricingMultiplier(value.defaultPricingMultiplier, fallback.defaultPricingMultiplier),
    additionalCredentials: sanitizeProviderCredentials(value.additionalCredentials),
  };
}

export function migrateLegacyProviderBaseUrl(provider: LlmProviderId, baseUrl: string | null): string | null {
  // Preserve custom gateways; only the retired official DeepSeek Anthropic endpoint is migrated.
  return provider === "deepseek" && baseUrl === "https://api.deepseek.com/anthropic"
    ? null
    : baseUrl;
}

export function sanitizeProviderCredentials(input: unknown): ProviderCredentialSettings[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: ProviderCredentialSettings[] = [];
  for (const value of input) {
    if (!isRecord(value) || !isValidCredentialId(value.id) || seen.has(value.id)) continue;
    const label = typeof value.label === "string" ? value.label.trim().slice(0, 80) : "";
    if (!label) continue;
    seen.add(value.id);
    out.push({
      id: value.id,
      label,
      pricingMultiplier: normalizePricingMultiplier(value.pricingMultiplier, 1),
      lastConnection: sanitizeConnectionState(value.lastConnection, { status: "untested" }),
    });
  }
  return out;
}

export function sanitizeProxySettings(input: unknown, fallback: ProviderProxySettings): ProviderProxySettings {
  if (!isRecord(input)) return { ...fallback };
  const enabled = typeof input.enabled === "boolean" ? input.enabled : fallback.enabled;
  if (input.url === null) return { enabled, url: null };
  if (typeof input.url !== "string") return { enabled, url: fallback.url };
  try { return { enabled, url: normalizeProxyUrl(input.url) }; } catch { return { ...fallback }; }
}

export function normalizeProxySettings(input: ProviderProxySettings): ProviderProxySettings {
  if (!input.enabled && !input.url) return { enabled: false, url: null };
  if (!input.url) throw new ProviderSettingsError("代理地址不能为空。", "invalid_proxy_url");
  try {
    return { enabled: input.enabled, url: normalizeProxyUrl(input.url) };
  } catch {
    throw new ProviderSettingsError("代理地址无效，仅支持不含认证信息的 HTTP(S) 地址。", "invalid_proxy_url");
  }
}

export function normalizeOptionalBaseUrl(value: string | null): string | null {
  if (value === null || !value.trim()) return null;
  try { return normalizeBaseUrl(value); } catch {
    throw new ProviderSettingsError("Base URL 无效，仅支持不含认证信息的 HTTP(S) 地址。", "invalid_base_url");
  }
}

export function normalizeCredentialLabel(value: string): string {
  const label = value.trim();
  if (!label) throw new ProviderSettingsError("API Key 名称不能为空。", "invalid_api_key");
  return label.slice(0, 80);
}

export function normalizePricingMultiplier(value: unknown, fallback?: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100) {
    return Math.round(value * 10_000) / 10_000;
  }
  if (fallback !== undefined) return fallback;
  throw new ProviderSettingsError("价格倍率必须是 0 到 100 之间的数字。", "write_failed");
}

export function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("invalid scheme");
  if (parsed.username || parsed.password) throw new Error("credentials forbidden");
  return parsed.toString().replace(/\/$/, "");
}

export function sanitizeConnectionState(input: unknown, fallback: ProviderConnectionState): ProviderConnectionState {
  if (!isRecord(input)) return { ...fallback };
  const status = input.status === "available" || input.status === "unavailable" || input.status === "untested"
    ? input.status
    : fallback.status;
  return {
    status,
    ...(typeof input.checkedAt === "string" && { checkedAt: input.checkedAt }),
    ...(isConnectionErrorKind(input.errorKind) && { errorKind: input.errorKind }),
    ...(typeof input.message === "string" && { message: input.message.slice(0, 300) }),
  };
}

export function modelKeyMigrationPriority(key: string): number {
  if (key === "deepseek:deepseek-v4-pro" || key === "deepseek-v4-pro") return 0;
  return key === normalizeModelKey(key) ? 2 : 1;
}

export function sanitizeInstalledModels(
  input: unknown,
  fallback: Partial<Record<ModelKey, InstalledModelSettings>>,
): Partial<Record<ModelKey, InstalledModelSettings>> {
  const out = cloneJson(fallback);
  if (!isRecord(input)) return out;
  for (const [rawKey, value] of Object.entries(input).sort(([a], [b]) => modelKeyMigrationPriority(a) - modelKeyMigrationPriority(b))) {
    const key = normalizeModelKey(rawKey);
    if (!key || !isRecord(value)) continue;
    out[key] = sanitizeInstalledModel(value, out[key] ?? { enabled: false, addedAt: BUILTIN_MODEL_ADDED_AT });
  }
  return out;
}

export function sanitizeInstalledModel(input: unknown, fallback: InstalledModelSettings): InstalledModelSettings {
  const value = isRecord(input) ? input : {};
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : fallback.enabled,
    addedAt: typeof value.addedAt === "string" && value.addedAt ? value.addedAt : fallback.addedAt,
    ...(typeof value.connectionId === "string" ? { connectionId: value.connectionId } : fallback.connectionId ? { connectionId: fallback.connectionId } : {}),
    ...(typeof value.customLabel === "string" && value.customLabel.trim() && { customLabel: value.customLabel.trim() }),
    ...(isValidCredentialId(value.credentialId) && { credentialId: value.credentialId }),
  };
}

export function sanitizeCustomModels(input: unknown): Partial<Record<ModelKey, ModelDefinition>> {
  const out: Partial<Record<ModelKey, ModelDefinition>> = {};
  if (!isRecord(input)) return out;
  for (const [rawKey, value] of Object.entries(input).sort(([a], [b]) => modelKeyMigrationPriority(a) - modelKeyMigrationPriority(b))) {
    const key = normalizeModelKey(rawKey);
    // Official Flash facts replace retired/alias catalog records; connection-specific models keep their own keys.
    if (key === DEEPSEEK_FLASH_KEY) continue;
    if (key && isValidModelDefinition(value, key)) out[key] = { ...cloneJson(value), key };
  }
  return out;
}

export function isValidModelDefinition(value: unknown, key: ModelKey): value is ModelDefinition {
  if (!isRecord(value)) return false;
  const normalized = normalizeModelKey(value.key);
  return normalized === key && value.provider === key.slice(0, key.indexOf(":")) &&
    (value.api === "openai-completions" || value.api === "openai-responses" || value.api === "anthropic-messages") &&
    typeof value.apiModel === "string" && value.apiModel.length > 0 && typeof value.label === "string";
}

export function sanitizeTaskModels(input: unknown): TaskModelSettings {
  const value = isRecord(input) ? input : {};
  return {
    defaultChatModel: normalizeNullableModelKey(value.defaultChatModel),
    utilityModel: normalizeNullableModelKey(value.utilityModel),
    exploreModel: normalizeNullableModelKey(value.exploreModel),
  };
}

export function sanitizeAgentV2(input: unknown, fallback: AgentSettingsV2): AgentSettingsV2 {
  const value = isRecord(input) ? input : {};
  const temperature = value.temperature;
  const maxTokens = value.maxTokens;
  return {
    systemPromptPath: sanitizeSystemPromptPath(value.systemPromptPath, fallback.systemPromptPath),
    temperature: typeof temperature === "number" && Number.isFinite(temperature) && temperature >= 0 && temperature <= 2
      ? temperature : temperature === null ? null : fallback.temperature,
    maxTokens: typeof maxTokens === "number" && Number.isFinite(maxTokens) && maxTokens >= 1
      ? Math.floor(maxTokens) : maxTokens === null ? null : fallback.maxTokens,
    disabledTools: Array.isArray(value.disabledTools)
      ? value.disabledTools.filter((item): item is string => typeof item === "string")
      : [...fallback.disabledTools],
    bashAlwaysAsk: typeof value.bashAlwaysAsk === "boolean" ? value.bashAlwaysAsk : fallback.bashAlwaysAsk,
  };
}

export function sanitizeSkills(input: unknown): SkillsSettings {
  const value = isRecord(input) ? input : {};
  return { disabled: sanitizeSkillNameList(value.disabled, []) };
}

export function sanitizeSkillNameList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const names = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return [...new Set(names)];
}

export function normalizeNullableModelKey(value: unknown): ModelKey | null {
  if (value === null || value === undefined) return null;
  return normalizeModelKey(value) ?? null;
}

export function isModelId(value: unknown): value is ModelId {
  return typeof value === "string" && (isPublicModelId(value) || value === "deepseek-v4-pro");
}

export function isConnectionErrorKind(value: unknown): value is ProviderConnectionState["errorKind"] {
  return value === "proxy" || value === "network" || value === "timeout" || value === "auth" ||
    value === "rate_limit" || value === "insufficient_balance" || value === "invalid_request" || value === "server";
}

export function redactProxyUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? ":••••" : ""}`;
  } catch {
    return null;
  }
}

export function sanitizeSystemPromptPath(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return isAbsolute(trimmed) ? trimmed : join(dirname(fallback), trimmed);
}

export function sanitizeSpeechSettings(value: unknown): SpeechSettings {
  const input = isRecord(value) ? value : {};
  return {
    ...DEFAULT_SPEECH_SETTINGS,
    model: isSpeechModel(input.model) ? input.model : DEFAULT_SPEECH_SETTINGS.model,
    voiceId: typeof input.voiceId === "string" && input.voiceId.trim() ? input.voiceId.trim().slice(0, 200) : DEFAULT_SPEECH_SETTINGS.voiceId,
    speed: typeof input.speed === "number" && Number.isFinite(input.speed) && input.speed >= 0.5 && input.speed <= 2 ? input.speed : 1,
  };
}
