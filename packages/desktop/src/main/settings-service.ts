/**
 * SettingsService owns non-sensitive settings.json v2 and encrypted secrets.json.
 * Renderer-facing views contain status only; decrypted keys and runtime transports stay in main.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import {
  getEnv,
  loadEnv,
  MAIN_AGENT_SYSTEM_PROMPT,
  normalizeProxyUrl,
  type ProviderRuntimeConfig,
} from "@actspace/agent-core";
import {
  BUILTIN_MODEL_LIST,
  LEGACY_MODEL_KEY_MAP,
  PROVIDER_IDS,
  PROVIDER_REGISTRY,
  SEARCH_PROVIDER_IDS,
  isPublicModelId,
  legacyModelIdFromKey,
  normalizeModelKey,
  type AgentSettingsV2,
  type AgentSystemPromptFile,
  type AppSettings,
  type AppSettingsV2,
  type InstalledModelSettings,
  type KairosModelId,
  type KairosSettingsV2,
  type KairosThinkingMode,
  type LlmProviderId,
  type ModelDefinition,
  type ModelId,
  type ModelKey,
  type PluginsSettings,
  type ProviderConnectionSettings,
  type ProviderConnectionState,
  type ProviderProxySettings,
  type SearchProviderId,
  type SearchUsageResult,
  type SecretProviderId,
  type SettingsUpdateInput,
  type SettingsV2UpdateInput,
  type SkillsSettings,
  type TaskModelSettings,
} from "@actspace/shared";
import type { ProviderConnectionProbeResult } from "./provider-connection-service";

const LLM_TEMPERATURE_DEFAULT = 0;
const LLM_MAX_TOKENS_DEFAULT = 8192;
const AGENT_SYSTEM_PROMPT_MAX_CHARS = 20_000;
const PROMPTS_DIR = "prompts";
const MAIN_AGENT_PROMPT_FILE = "main-agent.md";
const SETTINGS_FILE = "settings.json";
const SETTINGS_V1_BACKUP_FILE = "settings.v1.backup.json";
const SECRETS_FILE = "secrets.json";
const BUILTIN_MODEL_ADDED_AT = "2026-07-24T00:00:00.000Z";

export interface SecretCrypto {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(cipher: Buffer): string;
}

type AtomicJsonWriter = (filePath: string, value: unknown) => Promise<void>;

export interface SettingsServiceOptions {
  dataRoot: string;
  crypto: SecretCrypto;
  reloadEnv?: () => void;
  /** Test seam for deterministic write failures; production uses temp file + rename. */
  writeJson?: AtomicJsonWriter;
}

export interface ProviderConnectionMutationInput {
  provider: LlmProviderId;
  apiKey?: string | null;
  enabled?: boolean;
  baseUrl?: string | null;
  proxy?: ProviderProxySettings;
}

export interface ProviderRuntimeError {
  ok: false;
  code: "provider_disabled" | "api_key_missing" | "invalid_base_url" | "invalid_proxy_url";
  message: string;
}

export interface ModelStorageMutationInput {
  installedModels?: Partial<Record<ModelKey, InstalledModelSettings | null>>;
  customModels?: Partial<Record<ModelKey, ModelDefinition | null>>;
}

export class ProviderSettingsError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid_api_key"
      | "invalid_base_url"
      | "invalid_proxy_url"
      | "secret_storage_unavailable"
      | "write_failed",
  ) {
    super(message);
    this.name = "ProviderSettingsError";
  }
}

export interface PersistedSettingsV2 {
  version: 2;
  providers: Record<LlmProviderId, ProviderConnectionSettings>;
  installedModels: Partial<Record<ModelKey, InstalledModelSettings>>;
  customModels: Partial<Record<ModelKey, ModelDefinition>>;
  taskModels: TaskModelSettings;
  agent: AgentSettingsV2;
  kairos: KairosSettingsV2;
  plugins: PluginsSettings;
  skills: SkillsSettings;
}

type PersistedSecretProviderId = LlmProviderId | SearchProviderId;
type PersistedSecrets = { version: 1 } & Partial<Record<PersistedSecretProviderId, string>>;

interface ReadSettingsResult {
  settings: PersistedSettingsV2;
  legacySystemPrompt?: string;
  source: "missing" | "v1" | "v2" | "invalid";
  rawV1?: string;
  warning?: string;
}

const ALL_SECRET_PROVIDER_IDS: readonly PersistedSecretProviderId[] = [
  ...PROVIDER_IDS,
  ...SEARCH_PROVIDER_IDS,
];

const SEARCH_PROVIDER_ENV_KEYS = {
  zhipu: "ZHIPU_API_KEY",
  tavily: "TAVILY_API_KEY",
  tinyfish: "TINYFISH_API_KEY",
  exa: "EXA_API_KEY",
} as const;

export class SettingsService {
  private readonly dataRoot: string;
  private readonly crypto: SecretCrypto;
  private readonly reloadEnv: () => void;
  private readonly writeJson: AtomicJsonWriter;

  private settings: PersistedSettingsV2;
  private secrets: PersistedSecrets = { version: 1 };
  private mutationTail: Promise<void> = Promise.resolve();
  private lastLoadError?: string;

  constructor(options: SettingsServiceOptions) {
    this.dataRoot = options.dataRoot;
    this.crypto = options.crypto;
    this.reloadEnv = options.reloadEnv ?? (() => loadEnv());
    this.writeJson = options.writeJson ?? writeJsonAtomic;
    this.settings = defaultSettingsFromEnv(this.dataRoot);
  }

  async load(): Promise<void> {
    this.secrets = await this.readSecretsFile();
    const loaded = await this.readSettingsFile();
    this.settings = loaded.settings;
    this.lastLoadError = loaded.warning;

    try {
      await this.ensureAgentSystemPromptFile(loaded.legacySystemPrompt);
      if (loaded.source === "v1" && loaded.rawV1 !== undefined) {
        await writeBackupOnce(join(this.dataRoot, SETTINGS_V1_BACKUP_FILE), loaded.rawV1);
        await this.writeSettingsFile();
      } else if (loaded.source === "missing") {
        await this.writeSettingsFile();
      }
    } catch {
      // Never overwrite the original v1/invalid file after a failed migration/write.
      this.settings = defaultSettingsFromEnv(this.dataRoot);
      this.lastLoadError = "设置迁移或写入失败，已使用安全默认配置。";
      try {
        await this.ensureAgentSystemPromptFile();
      } catch {
        // Prompt creation failure remains non-fatal for settings load.
      }
    }

    this.applyToEnv();
  }

  getLastLoadError(): string | undefined {
    return this.lastLoadError;
  }

  /** Renderer transition view: v2 data plus deprecated v1 selection fields. */
  get(): AppSettings {
    const v2 = this.getV2();
    const defaultModelId = legacyModelIdFromKey(v2.taskModels.defaultChatModel as ModelKey) ?? null;
    const exploreModelId = legacyModelIdFromKey(v2.taskModels.exploreModel as ModelKey) ?? null;
    const legacyKairosModel = legacyModelIdFromKey(v2.kairos.modelId as ModelKey);
    return {
      version: 2,
      defaultModelId: isPublicModelId(defaultModelId) ? defaultModelId : null,
      providers: v2.providers,
      installedModels: v2.installedModels,
      customModels: v2.customModels,
      taskModels: v2.taskModels,
      kairosModelKey: v2.kairos.modelId,
      searchProviders: v2.searchProviders,
      agent: { ...v2.agent, exploreModelId },
      kairos: {
        ...v2.kairos,
        modelId: isKairosModelId(legacyKairosModel) ? legacyKairosModel : null,
      },
      plugins: v2.plugins,
      skills: v2.skills,
    };
  }

  /** Main-only pure v2 view. */
  getV2(): AppSettingsV2 {
    const definitions = [...BUILTIN_MODEL_LIST, ...Object.values(this.settings.customModels).filter(isDefined)];
    const providers = Object.fromEntries(PROVIDER_IDS.map((provider) => {
      const providerModels = definitions.filter((definition) => definition.provider === provider);
      const installed = providerModels.filter((definition) => Boolean(this.settings.installedModels[definition.key]));
      const enabled = installed.filter((definition) => this.settings.installedModels[definition.key]?.enabled);
      const settings = this.settings.providers[provider];
      return [provider, {
        hasApiKey: Boolean(this.getDecryptedKey(provider)),
        enabled: settings.enabled,
        baseUrl: settings.baseUrl,
        proxy: {
          enabled: settings.proxy.enabled,
          url: redactProxyUrl(settings.proxy.url),
        },
        lastConnection: { ...settings.lastConnection },
        installedModelCount: installed.length,
        enabledModelCount: enabled.length,
      }];
    })) as AppSettingsV2["providers"];

    return {
      version: 2,
      providers,
      installedModels: cloneJson(this.settings.installedModels),
      customModels: cloneJson(this.settings.customModels),
      taskModels: { ...this.settings.taskModels },
      searchProviders: {
        zhipu: { hasApiKey: Boolean(this.getDecryptedKey("zhipu")) },
        tavily: { hasApiKey: Boolean(this.getDecryptedKey("tavily")) },
        tinyfish: { hasApiKey: Boolean(this.getDecryptedKey("tinyfish")) },
        exa: { hasApiKey: Boolean(this.getDecryptedKey("exa")) },
      },
      agent: { ...this.settings.agent, disabledTools: [...this.settings.agent.disabledTools] },
      kairos: { ...this.settings.kairos, enabledSkills: [...this.settings.kairos.enabledSkills] },
      plugins: { repoRoot: this.settings.plugins.repoRoot, fsWatch: { ...this.settings.plugins.fsWatch } },
      skills: { disabled: [...this.settings.skills.disabled] },
    };
  }

  /** Main-only storage snapshot used by model services; never contains decrypted secrets. */
  getModelStorageState(): Pick<PersistedSettingsV2, "installedModels" | "customModels" | "taskModels" | "kairos"> {
    return cloneJson({
      installedModels: this.settings.installedModels,
      customModels: this.settings.customModels,
      taskModels: this.settings.taskModels,
      kairos: this.settings.kairos,
    });
  }

  async updateModelStorage(input: ModelStorageMutationInput): Promise<void> {
    await this.enqueueMutation(async () => {
      const previous = cloneJson(this.settings);
      try {
        for (const [rawKey, value] of Object.entries(input.installedModels ?? {})) {
          const key = normalizeModelKey(rawKey);
          if (!key) continue;
          if (value === null) delete this.settings.installedModels[key];
          else this.settings.installedModels[key] = sanitizeInstalledModel(value, value);
        }
        for (const [rawKey, value] of Object.entries(input.customModels ?? {})) {
          const key = normalizeModelKey(rawKey);
          if (!key) continue;
          if (value === null) delete this.settings.customModels[key];
          else if (isValidModelDefinition(value, key)) this.settings.customModels[key] = cloneJson(value);
        }
        await this.writeSettingsFile();
      } catch (error) {
        this.settings = previous;
        throw error;
      }
    });
  }

  async update(input: SettingsUpdateInput): Promise<AppSettings> {
    return this.enqueueMutation(async () => {
      const previous = cloneJson(this.settings);
      try {
        if (input.defaultModelId !== undefined) {
          this.settings.taskModels.defaultChatModel = isPublicModelId(input.defaultModelId)
            ? LEGACY_MODEL_KEY_MAP[input.defaultModelId]
            : null;
        }
        if (input.agent) {
          this.settings.agent = sanitizeAgentV2({ ...this.settings.agent, ...input.agent }, this.settings.agent);
          if (input.agent.exploreModelId !== undefined) {
            this.settings.taskModels.exploreModel = input.agent.exploreModelId && isPublicModelId(input.agent.exploreModelId)
              ? LEGACY_MODEL_KEY_MAP[input.agent.exploreModelId]
              : null;
          }
          await this.ensureAgentSystemPromptFile();
        }
        if (input.kairos) {
          this.settings.kairos = sanitizeKairosV2({
            ...this.settings.kairos,
            ...input.kairos,
            modelId: input.kairos.modelId === undefined
              ? this.settings.kairos.modelId
              : input.kairos.modelId === null
                ? null
                : LEGACY_MODEL_KEY_MAP[input.kairos.modelId],
          }, this.settings.kairos);
        }
        if (input.plugins) {
          this.settings.plugins = sanitizePlugins({
            repoRoot: input.plugins.repoRoot !== undefined ? input.plugins.repoRoot : this.settings.plugins.repoRoot,
            fsWatch: { ...this.settings.plugins.fsWatch, ...input.plugins.fsWatch },
          });
        }
        if (input.skills) {
          this.settings.skills = sanitizeSkills({ ...this.settings.skills, ...input.skills });
        }
        await this.writeSettingsFile();
        this.applyToEnv();
        return this.get();
      } catch (error) {
        this.settings = previous;
        throw error;
      }
    });
  }

  async updateV2(input: SettingsV2UpdateInput): Promise<AppSettingsV2> {
    return this.enqueueMutation(async () => {
      const previous = cloneJson(this.settings);
      try {
        if (input.providers) {
          for (const provider of PROVIDER_IDS) {
            const patch = input.providers[provider];
            if (!patch) continue;
            this.settings.providers[provider] = sanitizeProviderSettings(
              { ...this.settings.providers[provider], ...patch, proxy: { ...this.settings.providers[provider].proxy, ...patch.proxy } },
              this.settings.providers[provider],
            );
          }
        }
        if (input.installedModels) {
          for (const [rawKey, patch] of Object.entries(input.installedModels)) {
            const key = normalizeModelKey(rawKey);
            if (!key || !patch) continue;
            const current = this.settings.installedModels[key];
            if (!current) continue;
            this.settings.installedModels[key] = sanitizeInstalledModel({ ...current, ...patch }, current);
          }
        }
        if (input.customModels) {
          for (const [rawKey, definition] of Object.entries(input.customModels)) {
            const key = normalizeModelKey(rawKey);
            if (!key) continue;
            if (definition === null) delete this.settings.customModels[key];
            else if (isValidModelDefinition(definition, key)) this.settings.customModels[key] = cloneJson(definition);
          }
        }
        if (input.taskModels) {
          this.settings.taskModels = sanitizeTaskModels({ ...this.settings.taskModels, ...input.taskModels });
        }
        if (input.agent) {
          this.settings.agent = sanitizeAgentV2({ ...this.settings.agent, ...input.agent }, this.settings.agent);
        }
        if (input.kairos) {
          this.settings.kairos = sanitizeKairosV2({ ...this.settings.kairos, ...input.kairos }, this.settings.kairos);
        }
        if (input.plugins) this.settings.plugins = sanitizePlugins({ ...this.settings.plugins, ...input.plugins });
        if (input.skills) this.settings.skills = sanitizeSkills({ ...this.settings.skills, ...input.skills });
        await this.writeSettingsFile();
        this.applyToEnv();
        return this.getV2();
      } catch (error) {
        this.settings = previous;
        throw error;
      }
    });
  }

  async updateProviderConnection(input: ProviderConnectionMutationInput): Promise<AppSettings> {
    return this.enqueueMutation(async () => {
      const previousSettings = cloneJson(this.settings);
      const previousSecrets = { ...this.secrets };
      let secretsWritten = false;
      try {
        const current = this.settings.providers[input.provider];
        const next: ProviderConnectionSettings = {
          enabled: input.enabled ?? current.enabled,
          baseUrl: input.baseUrl === undefined ? current.baseUrl : normalizeOptionalBaseUrl(input.baseUrl),
          proxy: input.proxy === undefined ? { ...current.proxy } : normalizeProxySettings(input.proxy),
          lastConnection: { status: "untested" },
        };

        if (input.apiKey !== undefined) {
          if (input.apiKey === null) {
            delete this.secrets[input.provider];
          } else {
            const trimmed = input.apiKey.trim();
            if (!trimmed) throw new ProviderSettingsError("API Key 不能为空。", "invalid_api_key");
            if (!this.crypto.isAvailable()) {
              throw new ProviderSettingsError("系统密钥串不可用，无法安全保存 API Key。", "secret_storage_unavailable");
            }
            this.secrets[input.provider] = this.crypto.encrypt(trimmed).toString("base64");
          }
        }

        this.settings.providers[input.provider] = next;
        if (input.apiKey !== undefined) {
          await this.writeSecretsFile();
          secretsWritten = true;
        }
        await this.writeSettingsFile();
        this.applyToEnv();
        return this.get();
      } catch (error) {
        this.settings = previousSettings;
        this.secrets = previousSecrets;
        if (secretsWritten) await this.restoreFilesBestEffort(previousSettings, previousSecrets);
        if (error instanceof ProviderSettingsError) throw error;
        throw new ProviderSettingsError("供应商设置写入失败。", "write_failed");
      }
    });
  }

  getProviderRuntimeConfig(provider: LlmProviderId): ProviderRuntimeConfig | ProviderRuntimeError {
    const settings = this.settings.providers[provider];
    if (!settings.enabled) {
      return { ok: false, code: "provider_disabled", message: "该服务商已停用。" };
    }
    const apiKey = this.getDecryptedKey(provider);
    if (!apiKey) {
      return { ok: false, code: "api_key_missing", message: "尚未配置 API Key。" };
    }

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
      apiKey,
      baseUrl,
      ...(proxyUrl && { transport: { proxyUrl } }),
    };
  }

  async markProviderConnectionResult(
    provider: LlmProviderId,
    result: ProviderConnectionProbeResult,
  ): Promise<void> {
    await this.enqueueMutation(async () => {
      const previous = cloneJson(this.settings);
      try {
        this.settings.providers[provider].lastConnection = {
          status: result.ok ? "available" : "unavailable",
          checkedAt: result.checkedAt,
          ...(result.errorKind && { errorKind: result.errorKind }),
          message: result.message.slice(0, 300),
        };
        await this.writeSettingsFile();
      } catch (error) {
        this.settings = previous;
        throw error;
      }
    });
  }

  async readAgentSystemPrompt(): Promise<AgentSystemPromptFile> {
    await this.ensureAgentSystemPromptFile();
    return {
      path: this.settings.agent.systemPromptPath,
      content: await readFile(this.settings.agent.systemPromptPath, "utf8"),
    };
  }

  async writeAgentSystemPrompt(content: string): Promise<AgentSystemPromptFile> {
    await this.ensureAgentSystemPromptFile();
    const nextContent = content.slice(0, AGENT_SYSTEM_PROMPT_MAX_CHARS);
    await writeTextAtomic(this.settings.agent.systemPromptPath, nextContent);
    return { path: this.settings.agent.systemPromptPath, content: nextContent };
  }

  /** Compatibility API for the current key modal; all LLM providers share the v2 connection path. */
  async setProviderKey(provider: SecretProviderId, apiKey: string): Promise<{ ok: boolean; error?: string }> {
    if (provider === "deepseek" || provider === "kimi" || provider === "openrouter") {
      try {
        await this.updateProviderConnection({ provider, apiKey });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "API Key 保存失败。" };
      }
    }
    return this.setSearchProviderKey(provider, apiKey);
  }

  async clearProviderKey(provider: SecretProviderId): Promise<{ ok: boolean }> {
    if (provider === "deepseek" || provider === "kimi" || provider === "openrouter") {
      try {
        await this.updateProviderConnection({ provider, apiKey: null });
        return { ok: true };
      } catch {
        return { ok: false };
      }
    }
    return this.clearSearchProviderKey(provider);
  }

  async getSearchUsage(): Promise<SearchUsageResult> {
    const key = this.getDecryptedKey("tavily");
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

  /** Main-only decryption boundary. */
  getDecryptedKey(provider: PersistedSecretProviderId): string | undefined {
    const base64 = this.secrets[provider];
    if (!base64) return undefined;
    try {
      return this.crypto.decrypt(Buffer.from(base64, "base64"));
    } catch {
      return undefined;
    }
  }

  private async setSearchProviderKey(
    provider: SearchProviderId,
    apiKey: string,
  ): Promise<{ ok: boolean; error?: string }> {
    return this.enqueueMutation(async () => {
      const previous = { ...this.secrets };
      try {
        const trimmed = apiKey.trim();
        if (!trimmed) return { ok: false, error: "API Key 不能为空。" };
        if (!this.crypto.isAvailable()) return { ok: false, error: "系统密钥串不可用，无法安全保存 API Key。" };
        this.secrets[provider] = this.crypto.encrypt(trimmed).toString("base64");
        await this.writeSecretsFile();
        this.applyToEnv();
        return { ok: true };
      } catch {
        this.secrets = previous;
        return { ok: false, error: "API Key 保存失败。" };
      }
    });
  }

  private async clearSearchProviderKey(provider: SearchProviderId): Promise<{ ok: boolean }> {
    return this.enqueueMutation(async () => {
      const previous = { ...this.secrets };
      try {
        delete this.secrets[provider];
        await this.writeSecretsFile();
        this.applyToEnv();
        return { ok: true };
      } catch {
        this.secrets = previous;
        return { ok: false };
      }
    });
  }

  private applyProviderKey(provider: PersistedSecretProviderId, envKey: string): void {
    setOrDeleteEnv(envKey, this.getDecryptedKey(provider));
  }

  /** Desktop LLM credentials stay main-only; only search/tool preferences retain env compatibility. */
  private applyToEnv(): void {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.KIMI_API_KEY;
    for (const id of SEARCH_PROVIDER_IDS) this.applyProviderKey(id, SEARCH_PROVIDER_ENV_KEYS[id]);
    process.env.ACTSPACE_DISABLED_TOOLS = this.settings.agent.disabledTools.join(",");
    process.env.ACTSPACE_BASH_ALWAYS_ASK = this.settings.agent.bashAlwaysAsk ? "1" : "0";
    setOrDeleteEnv("LLM_TEMPERATURE", this.settings.agent.temperature === null ? undefined : String(this.settings.agent.temperature));
    setOrDeleteEnv("LLM_MAX_TOKENS", this.settings.agent.maxTokens === null ? undefined : String(this.settings.agent.maxTokens));
    this.reloadEnv();
  }

  private async readSettingsFile(): Promise<ReadSettingsResult> {
    const filePath = join(this.dataRoot, SETTINGS_FILE);
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (isNotFoundError(error)) {
        return { settings: defaultSettingsFromEnv(this.dataRoot), source: "missing" };
      }
      return {
        settings: defaultSettingsFromEnv(this.dataRoot),
        source: "invalid",
        warning: "设置文件读取失败，已使用安全默认配置。",
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        settings: defaultSettingsFromEnv(this.dataRoot),
        source: "invalid",
        warning: "设置文件格式无效，已使用安全默认配置。",
      };
    }
    if (!isRecord(parsed)) {
      return { settings: defaultSettingsFromEnv(this.dataRoot), source: "invalid", warning: "设置文件格式无效，已使用安全默认配置。" };
    }
    if (parsed.version === 1) {
      const migrated = migrateV1Settings(parsed, this.dataRoot, Boolean(this.getDecryptedKey("deepseek")));
      return { ...migrated, source: "v1", rawV1: raw };
    }
    if (parsed.version === 2) {
      return {
        settings: mergePersistedSettingsV2(parsed, this.dataRoot),
        source: "v2",
        ...(!hasRequiredV2Sections(parsed) && { warning: "设置文件字段不完整，已在内存中使用安全默认值。" }),
      };
    }
    return {
      settings: defaultSettingsFromEnv(this.dataRoot),
      source: "invalid",
      warning: "设置文件版本不受支持，已使用安全默认配置。",
    };
  }

  private async readSecretsFile(): Promise<PersistedSecrets> {
    try {
      const raw = await readFile(join(this.dataRoot, SECRETS_FILE), "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: PersistedSecrets = { version: 1 };
      for (const id of ALL_SECRET_PROVIDER_IDS) {
        const value = parsed[id];
        if (typeof value === "string" && value.length > 0) out[id] = value;
      }
      return out;
    } catch {
      return { version: 1 };
    }
  }

  private writeSettingsFile(): Promise<void> {
    return this.writeJson(join(this.dataRoot, SETTINGS_FILE), this.settings);
  }

  private writeSecretsFile(): Promise<void> {
    return this.writeJson(join(this.dataRoot, SECRETS_FILE), this.secrets);
  }

  private async restoreFilesBestEffort(settings: PersistedSettingsV2, secrets: PersistedSecrets): Promise<void> {
    try {
      await this.writeJson(join(this.dataRoot, SETTINGS_FILE), settings);
      await this.writeJson(join(this.dataRoot, SECRETS_FILE), secrets);
    } catch {
      // Original operation still reports failure; recovery is best effort only.
    }
  }

  private async ensureAgentSystemPromptFile(legacySystemPrompt?: string): Promise<void> {
    const filePath = this.settings.agent.systemPromptPath;
    try {
      await readFile(filePath, "utf8");
      return;
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
    const initialContent = legacySystemPrompt && legacySystemPrompt.trim().length > 0
      ? legacySystemPrompt.slice(0, AGENT_SYSTEM_PROMPT_MAX_CHARS)
      : MAIN_AGENT_SYSTEM_PROMPT;
    await writeTextAtomic(filePath, initialContent);
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.mutationTail.then(operation, operation);
    this.mutationTail = run.then(() => undefined, () => undefined);
    return run;
  }
}

function defaultProviderSettings(): ProviderConnectionSettings {
  return {
    enabled: true,
    baseUrl: null,
    proxy: { enabled: false, url: null },
    lastConnection: { status: "untested" },
  };
}

function defaultInstalledModels(): Partial<Record<ModelKey, InstalledModelSettings>> {
  return Object.fromEntries(BUILTIN_MODEL_LIST.map((definition) => [
    definition.key,
    { enabled: true, addedAt: BUILTIN_MODEL_ADDED_AT },
  ])) as Partial<Record<ModelKey, InstalledModelSettings>>;
}

function defaultSettingsFromEnv(dataRoot: string): PersistedSettingsV2 {
  const env = getEnv();
  return {
    version: 2,
    providers: Object.fromEntries(PROVIDER_IDS.map((id) => [id, defaultProviderSettings()])) as PersistedSettingsV2["providers"],
    installedModels: defaultInstalledModels(),
    customModels: {},
    taskModels: { defaultChatModel: null, utilityModel: null, exploreModel: null },
    agent: {
      systemPromptPath: defaultSystemPromptPath(dataRoot),
      temperature: env.LLM_TEMPERATURE !== LLM_TEMPERATURE_DEFAULT ? env.LLM_TEMPERATURE : null,
      maxTokens: env.LLM_MAX_TOKENS !== LLM_MAX_TOKENS_DEFAULT ? env.LLM_MAX_TOKENS : null,
      disabledTools: [...env.ACTSPACE_DISABLED_TOOLS],
      bashAlwaysAsk: env.ACTSPACE_BASH_ALWAYS_ASK,
    },
    kairos: { modelId: null, thinking: "auto", enabledSkills: [] },
    plugins: { repoRoot: null, fsWatch: { enabled: false } },
    skills: { disabled: [] },
  };
}

function migrateV1Settings(
  raw: Record<string, unknown>,
  dataRoot: string,
  hasDeepSeekKey: boolean,
): Omit<ReadSettingsResult, "source" | "rawV1"> {
  const seed = defaultSettingsFromEnv(dataRoot);
  const agent = isRecord(raw.agent) ? raw.agent : {};
  const kairos = isRecord(raw.kairos) ? raw.kairos : {};
  const defaultModel = isModelId(raw.defaultModelId) ? LEGACY_MODEL_KEY_MAP[raw.defaultModelId] : null;
  const exploreModel = isModelId(agent.exploreModelId) ? LEGACY_MODEL_KEY_MAP[agent.exploreModelId] : null;
  const kairosModel = isModelId(kairos.modelId) ? LEGACY_MODEL_KEY_MAP[kairos.modelId] : null;
  return {
    legacySystemPrompt: typeof agent.systemPrompt === "string" ? agent.systemPrompt : undefined,
    settings: {
      ...seed,
      taskModels: {
        defaultChatModel: defaultModel,
        utilityModel: hasDeepSeekKey ? LEGACY_MODEL_KEY_MAP["deepseek-v4-flash"] : null,
        exploreModel,
      },
      agent: sanitizeAgentV2({
        systemPromptPath: agent.systemPromptPath,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        disabledTools: agent.disabledTools,
        bashAlwaysAsk: agent.bashAlwaysAsk,
      }, seed.agent),
      kairos: sanitizeKairosV2({
        modelId: kairosModel,
        thinking: kairos.thinking as KairosThinkingMode | undefined,
        enabledSkills: kairos.enabledSkills,
      }, seed.kairos),
      plugins: sanitizePlugins(isRecord(raw.plugins) ? raw.plugins : {}),
      skills: sanitizeSkills(isRecord(raw.skills) ? raw.skills : {}),
    },
  };
}

function mergePersistedSettingsV2(raw: Record<string, unknown>, dataRoot: string): PersistedSettingsV2 {
  const seed = defaultSettingsFromEnv(dataRoot);
  const providers = isRecord(raw.providers) ? raw.providers : {};
  for (const id of PROVIDER_IDS) {
    seed.providers[id] = sanitizeProviderSettings(
      isRecord(providers[id]) ? providers[id] : {},
      seed.providers[id],
    );
  }
  seed.installedModels = sanitizeInstalledModels(raw.installedModels, seed.installedModels);
  seed.customModels = sanitizeCustomModels(raw.customModels);
  seed.taskModels = sanitizeTaskModels(raw.taskModels);
  seed.agent = sanitizeAgentV2(isRecord(raw.agent) ? raw.agent : {}, seed.agent);
  seed.kairos = sanitizeKairosV2(isRecord(raw.kairos) ? raw.kairos : {}, seed.kairos);
  seed.plugins = sanitizePlugins(isRecord(raw.plugins) ? raw.plugins : {});
  seed.skills = sanitizeSkills(isRecord(raw.skills) ? raw.skills : {});
  return seed;
}

function hasRequiredV2Sections(raw: Record<string, unknown>): boolean {
  return ["providers", "installedModels", "customModels", "taskModels", "agent", "kairos", "plugins", "skills"]
    .every((key) => isRecord(raw[key]));
}

function sanitizeProviderSettings(input: unknown, fallback: ProviderConnectionSettings): ProviderConnectionSettings {
  const value = isRecord(input) ? input : {};
  let baseUrl = fallback.baseUrl;
  if (value.baseUrl === null) baseUrl = null;
  else if (typeof value.baseUrl === "string") {
    try { baseUrl = normalizeBaseUrl(value.baseUrl); } catch { baseUrl = fallback.baseUrl; }
  }
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : fallback.enabled,
    baseUrl,
    proxy: sanitizeProxySettings(value.proxy, fallback.proxy),
    lastConnection: sanitizeConnectionState(value.lastConnection, fallback.lastConnection),
  };
}

function sanitizeProxySettings(input: unknown, fallback: ProviderProxySettings): ProviderProxySettings {
  if (!isRecord(input)) return { ...fallback };
  const enabled = typeof input.enabled === "boolean" ? input.enabled : fallback.enabled;
  if (input.url === null) return { enabled, url: null };
  if (typeof input.url !== "string") return { enabled, url: fallback.url };
  try { return { enabled, url: normalizeProxyUrl(input.url) }; } catch { return { ...fallback }; }
}

function normalizeProxySettings(input: ProviderProxySettings): ProviderProxySettings {
  if (!input.enabled && !input.url) return { enabled: false, url: null };
  if (!input.url) throw new ProviderSettingsError("代理地址不能为空。", "invalid_proxy_url");
  try {
    return { enabled: input.enabled, url: normalizeProxyUrl(input.url) };
  } catch {
    throw new ProviderSettingsError("代理地址无效，仅支持不含认证信息的 HTTP(S) 地址。", "invalid_proxy_url");
  }
}

function normalizeOptionalBaseUrl(value: string | null): string | null {
  if (value === null || !value.trim()) return null;
  try { return normalizeBaseUrl(value); } catch {
    throw new ProviderSettingsError("Base URL 无效，仅支持不含认证信息的 HTTP(S) 地址。", "invalid_base_url");
  }
}

function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("invalid scheme");
  if (parsed.username || parsed.password) throw new Error("credentials forbidden");
  return parsed.toString().replace(/\/$/, "");
}

function sanitizeConnectionState(input: unknown, fallback: ProviderConnectionState): ProviderConnectionState {
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

function sanitizeInstalledModels(
  input: unknown,
  fallback: Partial<Record<ModelKey, InstalledModelSettings>>,
): Partial<Record<ModelKey, InstalledModelSettings>> {
  const out = cloneJson(fallback);
  if (!isRecord(input)) return out;
  for (const [rawKey, value] of Object.entries(input)) {
    const key = normalizeModelKey(rawKey);
    if (!key || !isRecord(value)) continue;
    out[key] = sanitizeInstalledModel(value, out[key] ?? { enabled: false, addedAt: BUILTIN_MODEL_ADDED_AT });
  }
  return out;
}

function sanitizeInstalledModel(input: unknown, fallback: InstalledModelSettings): InstalledModelSettings {
  const value = isRecord(input) ? input : {};
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : fallback.enabled,
    addedAt: typeof value.addedAt === "string" && value.addedAt ? value.addedAt : fallback.addedAt,
    ...(typeof value.customLabel === "string" && value.customLabel.trim() && { customLabel: value.customLabel.trim() }),
  };
}

function sanitizeCustomModels(input: unknown): Partial<Record<ModelKey, ModelDefinition>> {
  const out: Partial<Record<ModelKey, ModelDefinition>> = {};
  if (!isRecord(input)) return out;
  for (const [rawKey, value] of Object.entries(input)) {
    const key = normalizeModelKey(rawKey);
    if (key && isValidModelDefinition(value, key)) out[key] = cloneJson(value);
  }
  return out;
}

function isValidModelDefinition(value: unknown, key: ModelKey): value is ModelDefinition {
  if (!isRecord(value)) return false;
  const normalized = normalizeModelKey(value.key);
  return normalized === key && value.provider === key.slice(0, key.indexOf(":")) &&
    (value.api === "openai-completions" || value.api === "anthropic-messages") &&
    typeof value.apiModel === "string" && value.apiModel.length > 0 && typeof value.label === "string";
}

function sanitizeTaskModels(input: unknown): TaskModelSettings {
  const value = isRecord(input) ? input : {};
  return {
    defaultChatModel: normalizeNullableModelKey(value.defaultChatModel),
    utilityModel: normalizeNullableModelKey(value.utilityModel),
    exploreModel: normalizeNullableModelKey(value.exploreModel),
  };
}

function sanitizeAgentV2(input: unknown, fallback: AgentSettingsV2): AgentSettingsV2 {
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

function sanitizeKairosV2(input: unknown, fallback: KairosSettingsV2): KairosSettingsV2 {
  const value = isRecord(input) ? input : {};
  const thinking = value.thinking;
  return {
    modelId: value.modelId === undefined ? fallback.modelId : normalizeNullableModelKey(value.modelId),
    thinking: thinking === "auto" || thinking === "on" || thinking === "off" ? thinking : fallback.thinking,
    enabledSkills: sanitizeSkillNameList(value.enabledSkills, fallback.enabledSkills),
  };
}

function sanitizePlugins(input: unknown): PluginsSettings {
  const value = isRecord(input) ? input : {};
  const fsWatch = isRecord(value.fsWatch) ? value.fsWatch : {};
  return {
    repoRoot: typeof value.repoRoot === "string" && value.repoRoot.trim() ? value.repoRoot.trim() : null,
    fsWatch: { enabled: typeof fsWatch.enabled === "boolean" ? fsWatch.enabled : false },
  };
}

function sanitizeSkills(input: unknown): SkillsSettings {
  const value = isRecord(input) ? input : {};
  return { disabled: sanitizeSkillNameList(value.disabled, []) };
}

function sanitizeSkillNameList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const names = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return [...new Set(names)];
}

function normalizeNullableModelKey(value: unknown): ModelKey | null {
  if (value === null || value === undefined) return null;
  return normalizeModelKey(value) ?? null;
}

function isModelId(value: unknown): value is ModelId {
  return typeof value === "string" && isPublicModelId(value);
}

function isKairosModelId(value: unknown): value is KairosModelId {
  return value === "deepseek-v4-pro" || value === "kimi-k2.6" || value === "kimi-k2.7-code";
}

function isConnectionErrorKind(value: unknown): value is ProviderConnectionState["errorKind"] {
  return value === "proxy" || value === "network" || value === "timeout" || value === "auth" ||
    value === "rate_limit" || value === "insufficient_balance" || value === "invalid_request" || value === "server";
}

function redactProxyUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? ":••••" : ""}`;
  } catch {
    return null;
  }
}

function setOrDeleteEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(tmp, filePath);
}

async function writeTextAtomic(filePath: string, value: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, value, "utf8");
  await rename(tmp, filePath);
}

async function writeBackupOnce(filePath: string, value: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  try {
    await writeFile(filePath, value, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
  }
}

function defaultSystemPromptPath(dataRoot: string): string {
  return join(dataRoot, PROMPTS_DIR, MAIN_AGENT_PROMPT_FILE);
}

function sanitizeSystemPromptPath(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return isAbsolute(trimmed) ? trimmed : join(dirname(fallback), trimmed);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT");
}

function isAlreadyExistsError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "EEXIST");
}
