import { applyCustomModelReasoning, validateCustomModelReasoning } from "@actspace/shared";
import { DEFAULT_SPEECH_SETTINGS, isSpeechModel, type SpeechSettings } from "@actspace/shared";
/**
 * SettingsService owns non-sensitive settings.json v4 and main-only 0600 secrets.json v2.
 * Legacy v1/v2/v3 files are accepted only as migration inputs and retain an on-disk backup.
 * Renderer-facing views contain status only; plaintext keys and runtime transports stay in main.
 */
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, join } from "node:path";
import {
  BUILTIN_MODEL_LIST,
  DEEPSEEK_FLASH_KEY,
  DEFAULT_IMAGE_GENERATION_BASE_URL,
  DEFAULT_IMAGE_GENERATION_MODEL,
  DEFAULT_IMAGE_INSPECTION_MODEL_KEY,
  DEFAULT_QUICK_OPEN_ACCELERATOR,
  LEGACY_MODEL_KEY_MAP,
  PROVIDER_IDS,
  PROVIDER_REGISTRY,
  SEARCH_PROVIDER_IDS,
  isProviderId,
  isConnectionProtocol,
  isPublicModelId,
  isImageInspectionModelKey,
  legacyModelIdFromKey,
  normalizeModelKey,
  type AgentSettingsV2,
  type CustomConnectionInput,
  type AgentSystemPromptFile,
  type AppSettings,
  type AppSettingsV2,
  type CredentialStorageIssueCode,
  type CredentialStorageView,
  type InstalledModelSettings,
  type ImageGenerationSettingsView,
  type ImageInspectionSettings,
  type LlmProviderId,
  type ModelDefinition,
  type ModelApi,
  type ModelId,
  type ModelKey,
  type ProviderConnectionSettings,
  type ProviderConnectionState,
  type ProviderCredentialSettings,
  type ProviderProxySettings,
  type QuickOpenShortcutUpdateInput,
  type SearchProviderId,
  type SearchUsageResult,
  type SecretProviderId,
  type SettingsUpdateInput,
  type SettingsV4,
  type SettingsV4ChangedNotification,
  type SettingsV4InstalledModelSettings,
  type SettingsV4Models,
  type SettingsV4Namespace,
  type SettingsV4Snapshot,
  type SettingsV4SubagentRoute,
  type SettingsV4UpdateInput,
  type SettingsV2UpdateInput,
  type SettingsV4UsagePreferences,
  type SkillsSettings,
  type ShortcutsSettings,
  type TaskModelSettings,
  type UpdateImageGenerationSettingsInput,
} from "@actspace/shared";
type ProviderConnectionProbeResult = {
  readonly ok: boolean;
  readonly checkedAt: string;
  readonly errorKind?: ProviderConnectionState["errorKind"];
  readonly message?: string;
};

type ProviderRuntimeConfig = {
  readonly provider: LlmProviderId;
  readonly protocol?: ModelApi;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly pricingMultiplier: number;
  readonly transport?: { readonly proxyUrl: string };
};

const MAIN_AGENT_SYSTEM_PROMPT = "You are ActSpace's main agent. Follow the active tool and safety policies.";
function normalizeProxyUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Proxy URL must use HTTP or HTTPS.");
  if (!url.hostname) throw new Error("Proxy URL must include a host.");
  return url.toString().replace(/\/$/, "");
}

const LLM_TEMPERATURE_DEFAULT = 0;
const LLM_MAX_TOKENS_DEFAULT = 8192;
const AGENT_SYSTEM_PROMPT_MAX_CHARS = 20_000;
const PROMPTS_DIR = "prompts";
const MAIN_AGENT_PROMPT_FILE = "main-agent.md";
const SETTINGS_FILE = "settings.json";
const SETTINGS_V1_BACKUP_FILE = "settings.v1.backup.json";
const SETTINGS_V2_BACKUP_FILE = "settings.v2.backup.json";
const SETTINGS_V2_BACKUP_DIGEST_FILE = "settings.v2.backup.sha256";
const SETTINGS_V3_BACKUP_FILE = "settings.v3.backup.json";
const SETTINGS_V3_BACKUP_DIGEST_FILE = "settings.v3.backup.sha256";
const SECRETS_FILE = "secrets.json";
const BUILTIN_MODEL_ADDED_AT = "2026-07-24T00:00:00.000Z";

export interface SecretCrypto {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(cipher: Buffer): string;
}

type AtomicJsonWriter = (filePath: string, value: unknown, options?: { mode?: number }) => Promise<void>;

export interface SettingsServiceOptions {
  dataRoot: string;
  crypto: SecretCrypto;
  reloadEnv?: () => void;
  /** Test seam for deterministic write failures; production uses temp file + rename. */
  writeJson?: AtomicJsonWriter;
  createCredentialId?: () => string;
}

export interface ProviderConnectionMutationInput {
  provider: LlmProviderId;
  apiKey?: string | null;
  managementKey?: string | null;
  enabled?: boolean;
  baseUrl?: string | null;
  proxy?: ProviderProxySettings;
  defaultPricingMultiplier?: number;
}

export interface ProviderRuntimeError {
  ok: false;
  code: "provider_disabled" | "api_key_missing" | "credential_missing" | "invalid_base_url" | "invalid_proxy_url";
  message: string;
}

export type ProviderCredentialMutationResult =
  | { ok: true }
  | { ok: false; code: "credential_not_found" | "credential_in_use"; message: string; references?: ModelKey[] };

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
      | "invalid_model"
      | "invalid_proxy_url"
      | "secret_storage_unavailable"
      | "write_failed",
  ) {
    super(message);
    this.name = "ProviderSettingsError";
  }
}

export class SettingsRevisionConflictError extends Error {
  constructor(public readonly latest: SettingsV4Snapshot) {
    super("Settings changed in another window; reload the latest snapshot before retrying.");
    this.name = "SettingsRevisionConflictError";
  }
}

export interface PersistedSettingsV3 {
  version: 3;
  providers: Record<LlmProviderId, ProviderConnectionSettings>;
  installedModels: Partial<Record<ModelKey, InstalledModelSettings>>;
  customModels: Partial<Record<ModelKey, ModelDefinition>>;
  taskModels: TaskModelSettings;
  imageGeneration: {
    baseUrl: string;
    model: string;
  };
  imageInspection: ImageInspectionSettings;
  agent: AgentSettingsV2;
  skills: SkillsSettings;
  shortcuts: ShortcutsSettings;
}

type OpenRouterManagementSecretId = "openrouter-management";
type PersistedSecretProviderId = LlmProviderId | SearchProviderId | OpenRouterManagementSecretId | "image-generation" | "speech-minimax";
type PersistedSecretsV1 = {
  version: 1;
  providerCredentials: Record<string, string>;
} & Partial<Record<PersistedSecretProviderId, string>>;

type PersistedSecrets = {
  version: 2;
  providerCredentials: Record<string, string>;
} & Partial<Record<PersistedSecretProviderId, string>>;

interface CredentialStorageIssue {
  code: CredentialStorageIssueCode;
  message: string;
}

interface ReadSecretsResult {
  secrets: PersistedSecrets;
  source: "missing" | "v1" | "v2" | "legacy-removed" | "unavailable";
  issue?: CredentialStorageIssue;
}

interface ReadSettingsResult {
  settings: PersistedSettingsV3;
  v4Metadata: SettingsV4Metadata;
  legacySystemPrompt?: string;
  source: "missing" | "v1" | "v2" | "v3" | "v4" | "legacy-removed" | "invalid";
  rawV1?: string;
  rawV2?: string;
  rawV3?: string;
  warning?: string;
  blockingError?: string;
}

type SettingsV4Metadata = Pick<SettingsV4, "general" | "tools" | "subagents" | "activity" | "models"> & { speech: SpeechSettings };

const ALL_SETTINGS_V4_NAMESPACES: SettingsV4Namespace[] = [
  "general",
  "models",
  "tools",
  "media",
  "skills",
  "subagents",
  "activity",
];

export type SettingsV4ChangeListener = (notification: SettingsV4ChangedNotification) => void;

const ALL_SECRET_PROVIDER_IDS: readonly PersistedSecretProviderId[] = [
  ...PROVIDER_IDS,
  ...SEARCH_PROVIDER_IDS,
  "openrouter-management",
  "image-generation",
  "speech-minimax",
];

export interface ImageGenerationRuntimeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

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
  private readonly createCredentialId: () => string;

  private settings: PersistedSettingsV3;
  private v4Metadata: SettingsV4Metadata;
  private secrets: PersistedSecrets = emptySecrets();
  private credentialStorageIssue?: CredentialStorageIssue;
  private mutationTail: Promise<void> = Promise.resolve();
  private lastLoadError?: string;
  private readonly v4ChangeListeners = new Set<SettingsV4ChangeListener>();

  constructor(options: SettingsServiceOptions) {
    this.dataRoot = options.dataRoot;
    this.crypto = options.crypto;
    this.reloadEnv = options.reloadEnv ?? (() => undefined);
    this.writeJson = options.writeJson ?? writeJsonAtomic;
    this.createCredentialId = options.createCredentialId ?? randomUUID;
    this.settings = defaultSettingsFromEnv(this.dataRoot);
    this.v4Metadata = defaultSettingsV4Metadata();
  }

  async load(): Promise<void> {
    const loadedSecrets = await this.readSecretsFile();
    this.secrets = loadedSecrets.secrets;
    this.credentialStorageIssue = loadedSecrets.issue;
    if ((loadedSecrets.source === "v1" || loadedSecrets.source === "legacy-removed") && !loadedSecrets.issue) {
      try {
        await this.writeSecretsFile();
      } catch {
        this.credentialStorageIssue = {
          code: "migration_failed",
          message: "旧版凭据已读取，但无法完成本地存储迁移。为避免覆盖现有 Key，Actspace 已暂停凭据修改。",
        };
      }
    }
    const loaded = await this.readSettingsFile();
    this.settings = loaded.settings;
    this.v4Metadata = loaded.v4Metadata;
    this.lastLoadError = loaded.warning;
    if (loaded.blockingError !== undefined) throw new Error(loaded.blockingError);

    try {
      await this.ensureAgentSystemPromptFile(loaded.legacySystemPrompt);
      if (loaded.source === "v1" && loaded.rawV1 !== undefined) {
        await writeBackupOnce(join(this.dataRoot, SETTINGS_V1_BACKUP_FILE), loaded.rawV1);
        await this.writeSettingsFile();
      } else if (loaded.source === "v2" && loaded.rawV2 !== undefined) {
        await writeSettingsV2Backup(this.dataRoot, loaded.rawV2);
        await this.writeSettingsFile();
      } else if ((loaded.source === "v3" || loaded.source === "legacy-removed") && loaded.rawV3 !== undefined) {
        await writeSettingsV3Backup(this.dataRoot, loaded.rawV3);
        await this.writeSettingsFile();
      } else if (loaded.source === "missing" || loaded.source === "legacy-removed") {
        await this.writeSettingsFile();
      }
    } catch {
      // Never overwrite the original v1/v2/invalid file after a failed migration/write.
      this.settings = defaultSettingsFromEnv(this.dataRoot);
      this.v4Metadata = defaultSettingsV4Metadata();
      this.lastLoadError = "设置迁移或写入失败，已使用安全默认配置。";
      try {
        await this.ensureAgentSystemPromptFile();
      } catch {
        // Prompt creation failure remains non-fatal for settings load.
      }
      if (loaded.source === "v2") throw new Error("Settings v2 to v4 migration failed; the original settings file was preserved.");
      if (loaded.source === "v3" || loaded.source === "legacy-removed") {
        throw new Error("Settings v3 to v4 migration failed; the original settings file was preserved.");
      }
    }

    this.applyToEnv();
  }

  subscribeV4Changes(listener: SettingsV4ChangeListener): () => void {
    this.v4ChangeListeners.add(listener);
    return () => this.v4ChangeListeners.delete(listener);
  }

  getV4(): SettingsV4Snapshot {
    const settings = toSettingsV4(this.settings, this.v4Metadata);
    return {
      version: 4,
      revision: computeSettingsRevision(settings),
      settings,
    };
  }

  async updateNamespaceV4(input: SettingsV4UpdateInput): Promise<SettingsV4Snapshot> {
    return this.enqueueMutation(() => this.applyNamespaceV4(input));
  }

  private async applyNamespaceV4(input: SettingsV4UpdateInput): Promise<SettingsV4Snapshot> {
      const current = this.getV4();
      if (input.expectedRevision !== current.revision) {
        throw new SettingsRevisionConflictError(current);
      }
      const previousSettings = cloneJson(this.settings);
      const previousMetadata = cloneJson(this.v4Metadata);
      try {
        const next = applySettingsV4NamespacePatch(current.settings, input);
        const normalized = parseSettingsV4(next as unknown as Record<string, unknown>, this.dataRoot);
        if (!normalized) throw new Error("Settings v4 patch is invalid.");
        this.settings = normalized.settings;
        this.v4Metadata = normalized.v4Metadata;
        await this.writeSettingsFile([input.namespace]);
        this.applyToEnv();
        return this.getV4();
      } catch (error) {
        this.settings = previousSettings;
        this.v4Metadata = previousMetadata;
        throw error;
      }
  }

  getLastLoadError(): string | undefined {
    return this.lastLoadError;
  }

  getCredentialStorageView(): CredentialStorageView {
    return this.credentialStorageIssue
      ? { status: "unavailable", ...this.credentialStorageIssue }
      : { status: "ready" };
  }

  /** Renderer transition view: v2 data plus deprecated v1 selection fields. */
  get(): AppSettings {
    const v2 = this.getV2();
    const defaultModelId = legacyModelIdFromKey(v2.taskModels.defaultChatModel as ModelKey) ?? null;
    const exploreModelId = legacyModelIdFromKey(v2.taskModels.exploreModel as ModelKey) ?? null;
    return {
      version: 2,
      defaultModelId: isPublicModelId(defaultModelId) ? defaultModelId : null,
      providers: v2.providers,
      installedModels: v2.installedModels,
      customModels: v2.customModels,
      taskModels: v2.taskModels,
      searchProviders: v2.searchProviders,
      imageGeneration: v2.imageGeneration,
      imageInspection: v2.imageInspection,
      agent: { ...v2.agent, exploreModelId },
      skills: v2.skills,
      shortcuts: v2.shortcuts,
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
        hasApiKey: Boolean(this.getStoredKey(provider)),
        ...(provider === "openrouter" && { hasManagementKey: Boolean(this.getStoredKey("openrouter-management")) }),
        enabled: settings.enabled,
        baseUrl: settings.baseUrl,
        proxy: {
          enabled: settings.proxy.enabled,
          url: redactProxyUrl(settings.proxy.url),
        },
        lastConnection: { ...settings.lastConnection },
        installedModelCount: installed.length,
        enabledModelCount: enabled.length,
        defaultPricingMultiplier: settings.defaultPricingMultiplier,
        additionalCredentials: settings.additionalCredentials.map((credential) => ({
          ...credential,
          lastConnection: { ...credential.lastConnection },
          hasApiKey: Boolean(this.getStoredProviderCredential(provider, credential.id)),
        })),
      }];
    })) as AppSettingsV2["providers"];

    return {
      version: 2,
      providers,
      installedModels: cloneJson(this.settings.installedModels),
      customModels: cloneJson(this.settings.customModels),
      taskModels: { ...this.settings.taskModels },
      searchProviders: {
        zhipu: { hasApiKey: Boolean(this.getStoredKey("zhipu")) },
        tavily: { hasApiKey: Boolean(this.getStoredKey("tavily")) },
        tinyfish: { hasApiKey: Boolean(this.getStoredKey("tinyfish")) },
        exa: { hasApiKey: Boolean(this.getStoredKey("exa")) },
      },
      imageGeneration: this.getImageGenerationSettingsView(),
      imageInspection: { ...this.settings.imageInspection },
      agent: { ...this.settings.agent, disabledTools: [...this.settings.agent.disabledTools] },
      skills: { disabled: [...this.settings.skills.disabled] },
      shortcuts: cloneJson(this.settings.shortcuts),
    };
  }

  /** Main-only storage snapshot used by model services; never contains decrypted secrets. */
  getModelStorageState(): Pick<PersistedSettingsV3, "installedModels" | "customModels" | "taskModels"> {
    return cloneJson({
      installedModels: this.settings.installedModels,
      customModels: this.settings.customModels,
      taskModels: this.settings.taskModels,
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
        if (input.skills) {
          this.settings.skills = sanitizeSkills({ ...this.settings.skills, ...input.skills });
        }
        if (input.imageInspection) {
          this.settings.imageInspection = sanitizeImageInspectionSettings(input.imageInspection);
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
              provider,
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
        if (input.skills) this.settings.skills = sanitizeSkills({ ...this.settings.skills, ...input.skills });
        if (input.imageGeneration) {
          this.settings.imageGeneration = sanitizeImageGenerationSettings({ ...this.settings.imageGeneration, ...input.imageGeneration }, this.settings.imageGeneration);
        }
        if (input.imageInspection) {
          this.settings.imageInspection = sanitizeImageInspectionSettings({ ...this.settings.imageInspection, ...input.imageInspection });
        }
        if (input.shortcuts) {
          this.settings.shortcuts = sanitizeShortcuts({ ...this.settings.shortcuts, ...input.shortcuts, quickOpen: { ...this.settings.shortcuts.quickOpen, ...input.shortcuts.quickOpen } });
        }
        await this.writeSettingsFile();
        this.applyToEnv();
        return this.getV2();
      } catch (error) {
        this.settings = previous;
        throw error;
      }
    });
  }

  async updateQuickOpenShortcut(input: QuickOpenShortcutUpdateInput): Promise<AppSettings> {
    return this.enqueueMutation(async () => {
      const previous = cloneJson(this.settings);
      try {
        this.settings.shortcuts = {
          quickOpen: sanitizeQuickOpenShortcut({
            ...this.settings.shortcuts.quickOpen,
            ...input,
          }),
        };
        await this.writeSettingsFile();
        return this.get();
      } catch (error) {
        this.settings = previous;
        throw error;
      }
    });
  }

  async updateProviderConnection(input: ProviderConnectionMutationInput): Promise<AppSettings> {
    return this.enqueueMutation(async () => {
      const previousSettings = cloneJson(this.settings);
      const previousSecrets = cloneJson(this.secrets);
      let secretsWritten = false;
      try {
        const current = this.settings.providers[input.provider];
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
          this.assertCredentialStorageWritable();
          if (input.apiKey === null) {
            delete this.secrets[input.provider];
          } else {
            const trimmed = input.apiKey.trim();
            if (!trimmed) throw new ProviderSettingsError("API Key 不能为空。", "invalid_api_key");
            this.secrets[input.provider] = trimmed;
          }
        }

        if (input.provider === "openrouter" && input.managementKey !== undefined) {
          this.assertCredentialStorageWritable();
          if (input.managementKey === null) {
            delete this.secrets["openrouter-management"];
          } else {
            const trimmed = input.managementKey.trim();
            if (!trimmed) throw new ProviderSettingsError("Management Key 不能为空。", "invalid_api_key");
            this.secrets["openrouter-management"] = trimmed;
          }
        }

        this.settings.providers[input.provider] = next;
        if (input.apiKey !== undefined || (input.provider === "openrouter" && input.managementKey !== undefined)) {
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

  async removeProvider(provider: LlmProviderId): Promise<AppSettings> {
    return this.enqueueMutation(async () => {
      const previousSettings = cloneJson(this.settings);
      const previousSecrets = cloneJson(this.secrets);
      let secretsWritten = false;
      try {
        this.assertCredentialStorageWritable();
        delete this.secrets[provider];
        if (provider === "openrouter") delete this.secrets["openrouter-management"];
        for (const secretId of Object.keys(this.secrets.providerCredentials)) {
          if (secretId.startsWith(`${provider}:`)) delete this.secrets.providerCredentials[secretId];
        }
        this.settings.providers[provider] = defaultProviderSettings();

        await this.writeSecretsFile();
        secretsWritten = true;
        await this.writeSettingsFile();
        this.applyToEnv();
        return this.get();
      } catch (error) {
        this.settings = previousSettings;
        this.secrets = previousSecrets;
        if (secretsWritten) await this.restoreFilesBestEffort(previousSettings, previousSecrets);
        if (error instanceof ProviderSettingsError) throw error;
        throw new ProviderSettingsError("服务商移除失败。", "write_failed");
      }
    });
  }

  getProviderRuntimeConfig(provider: LlmProviderId): ProviderRuntimeConfig | ProviderRuntimeError {
    return this.getProviderRuntimeConfigForCredential(provider);
  }

  getProviderRuntimeConfigForCredential(
    provider: LlmProviderId,
    credentialId?: string,
    connectionId?: string,
  ): ProviderRuntimeConfig | ProviderRuntimeError {
    const isCustom = Boolean(connectionId && connectionId !== `${provider}:default`);
    const connection = isCustom ? this.getV4().settings.models.connections[connectionId!] : undefined;
    if (isCustom && (!connection || connection.providerId !== provider)) {
      return { ok: false, code: "credential_missing", message: "模型绑定的连接不存在或不匹配。" };
    }
    const settings = connection ?? this.settings.providers[provider];
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
      ? this.secrets.providerCredentials[`connection:${connectionId}`]
      : credentialId
      ? this.getStoredProviderCredential(provider, credentialId)
      : this.getStoredKey(provider);
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
      apiKey,
      baseUrl,
      pricingMultiplier: credential?.pricingMultiplier ?? settings.defaultPricingMultiplier ?? 1,
      ...(proxyUrl && { transport: { proxyUrl } }),
    };
  }

  async createCustomConnection(input: CustomConnectionInput): Promise<SettingsV4Snapshot> {
    return this.enqueueMutation(() => this.createCustomConnectionQueued(input));
  }

  private async createCustomConnectionQueued(input: CustomConnectionInput): Promise<SettingsV4Snapshot> {
    validateCustomConnection(input);
    const protocol = input.protocol ?? "openai-completions";
    const connectionId = input.connectionId?.trim() || `custom-${randomUUID()}`;
    if (!/^[a-zA-Z0-9._-]{3,80}$/.test(connectionId)) throw new ProviderSettingsError("连接标识无效。", "write_failed");
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const current = this.getV4();
    if (current.settings.models.connections[connectionId]) throw new ProviderSettingsError("连接标识已存在。", "write_failed");
    this.assertCredentialStorageWritable();
    this.secrets.providerCredentials[`connection:${connectionId}`] = input.apiKey.trim();
    try {
      await this.writeSecretsFile();
      return await this.applyNamespaceV4({
        namespace: "models",
        expectedRevision: current.revision,
        patch: {
          connections: {
            [connectionId]: {
              connectionId,
              providerId: input.providerId,
              protocol,
              displayName: input.displayName.trim() || connectionId,
              defaultModel: input.defaultModel?.trim() || null,
              ...(input.catalogId?.trim() ? { catalogId: input.catalogId.trim().slice(0, 80) } : {}),
              enabled: true,
              baseUrl,
              proxy: input.proxy ?? { enabled: false, url: null },
              lastConnection: { status: "untested" },
              defaultPricingMultiplier: 1,
              additionalCredentials: [],
            },
          },
          ...connectionModelPatch(input, connectionId, protocol, current.settings.models),
        },
      });
    } catch (error) {
      delete this.secrets.providerCredentials[`connection:${connectionId}`];
      await this.writeSecretsFile();
      throw error;
    }
  }

  async removeCustomConnection(connectionId: string): Promise<SettingsV4Snapshot> {
    return this.enqueueMutation(() => this.removeCustomConnectionQueued(connectionId));
  }

  private async removeCustomConnectionQueued(connectionId: string): Promise<SettingsV4Snapshot> {
    const current = this.getV4();
    if (!current.settings.models.connections[connectionId]) throw new ProviderSettingsError("连接不存在。", "write_failed");
    const result = await this.applyNamespaceV4({
      namespace: "models",
      expectedRevision: current.revision,
      patch: { connections: { [connectionId]: null } } as Partial<SettingsV4Models>,
    });
    delete this.secrets.providerCredentials[`connection:${connectionId}`];
    await this.writeSecretsFile();
    return result;
  }

  async updateCustomConnection(input: CustomConnectionInput & { connectionId: string; apiKey?: string }): Promise<SettingsV4Snapshot> {
    return this.enqueueMutation(() => this.updateCustomConnectionQueued(input));
  }

  private async updateCustomConnectionQueued(input: CustomConnectionInput & { connectionId: string; apiKey?: string }): Promise<SettingsV4Snapshot> {
    const current = this.getV4();
    const existing = current.settings.models.connections[input.connectionId];
    if (!existing) throw new ProviderSettingsError("连接不存在。", "write_failed");
    validateCustomConnection({ ...input, apiKey: "preserved", protocol: input.protocol ?? existing.protocol });
    if (input.providerId !== existing.providerId || (input.protocol && input.protocol !== (existing.protocol ?? "openai-completions"))) {
      throw new ProviderSettingsError("连接协议不可更改，请创建新的连接。", "write_failed");
    }
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const previousSecrets = cloneJson(this.secrets);
    try {
    if (input.apiKey?.trim()) {
      this.assertCredentialStorageWritable();
      this.secrets.providerCredentials[`connection:${input.connectionId}`] = input.apiKey.trim();
      await this.writeSecretsFile();
    }
    return await this.applyNamespaceV4({
      namespace: "models",
      expectedRevision: current.revision,
      patch: {
        connections: { [input.connectionId]: { ...existing, protocol: existing.protocol ?? "openai-completions", displayName: input.displayName.trim() || existing.displayName, defaultModel: input.defaultModel?.trim() || null, ...(input.catalogId?.trim() ? { catalogId: input.catalogId.trim().slice(0, 80) } : {}), baseUrl, proxy: input.proxy ?? existing.proxy, lastConnection: { status: "untested" } } },
        ...connectionModelPatch(input, input.connectionId, existing.protocol ?? "openai-completions", current.settings.models),
      },
    });
    } catch (error) {
      this.secrets = previousSecrets;
      if (input.apiKey?.trim()) await this.writeSecretsFile();
      throw error;
    }
  }

  getImageGenerationRuntimeConfig(): ImageGenerationRuntimeConfig | undefined {
    const apiKey = this.getStoredKey("image-generation");
    if (!apiKey) return undefined;
    return {
      apiKey,
      baseUrl: this.settings.imageGeneration.baseUrl,
      model: this.settings.imageGeneration.model,
    };
  }

  async updateImageGeneration(
    input: UpdateImageGenerationSettingsInput,
  ): Promise<ImageGenerationSettingsView> {
    return this.enqueueMutation(async () => {
      const previousSettings = cloneJson(this.settings);
      const previousSecrets = cloneJson(this.secrets);
      let secretsWritten = false;
      try {
        const baseUrl = normalizeImageGenerationBaseUrl(input.baseUrl);
        const model = normalizeImageGenerationModel(input.model);
        if (input.apiKey !== undefined) {
          this.assertCredentialStorageWritable();
          const trimmed = input.apiKey.trim();
          if (!trimmed) throw new ProviderSettingsError("API Key 不能为空。", "invalid_api_key");
          this.secrets["image-generation"] = trimmed;
          await this.writeSecretsFile();
          secretsWritten = true;
        }
        this.settings.imageGeneration = { baseUrl, model };
        await this.writeSettingsFile();
        this.applyToEnv();
        return this.getImageGenerationSettingsView();
      } catch (error) {
        this.settings = previousSettings;
        this.secrets = previousSecrets;
        if (secretsWritten) await this.restoreFilesBestEffort(previousSettings, previousSecrets);
        if (error instanceof ProviderSettingsError) throw error;
        throw new ProviderSettingsError("图片生成配置写入失败。", "write_failed");
      }
    });
  }

  async addProviderCredential(input: {
    provider: LlmProviderId;
    label: string;
    apiKey: string;
    pricingMultiplier?: number;
  }): Promise<AppSettings> {
    return this.enqueueMutation(async () => {
      const previousSettings = cloneJson(this.settings);
      const previousSecrets = cloneJson(this.secrets);
      let secretsWritten = false;
      try {
        this.assertCredentialStorageWritable();
        const apiKey = input.apiKey.trim();
        if (!apiKey) throw new ProviderSettingsError("API Key 不能为空。", "invalid_api_key");
        const id = this.createCredentialId();
        if (!isValidCredentialId(id)) throw new ProviderSettingsError("额外 API Key 标识无效。", "write_failed");
        if (this.settings.providers[input.provider].additionalCredentials.some((credential) => credential.id === id)) {
          throw new ProviderSettingsError("额外 API Key 标识冲突，请重试。", "write_failed");
        }
        this.settings.providers[input.provider].additionalCredentials.push({
          id,
          label: normalizeCredentialLabel(input.label),
          pricingMultiplier: normalizePricingMultiplier(input.pricingMultiplier ?? 1),
          lastConnection: { status: "untested" },
        });
        this.secrets.providerCredentials[providerCredentialSecretId(input.provider, id)] = apiKey;
        await this.writeSecretsFile();
        secretsWritten = true;
        await this.writeSettingsFile();
        return this.get();
      } catch (error) {
        this.settings = previousSettings;
        this.secrets = previousSecrets;
        if (secretsWritten) await this.restoreFilesBestEffort(previousSettings, previousSecrets);
        if (error instanceof ProviderSettingsError) throw error;
        throw new ProviderSettingsError("额外 API Key 写入失败。", "write_failed");
      }
    });
  }

  async updateProviderCredential(
    provider: LlmProviderId,
    credentialId: string,
    label: string,
    pricingMultiplier?: number,
  ): Promise<ProviderCredentialMutationResult> {
    return this.enqueueMutation(async () => {
      const previous = cloneJson(this.settings);
      const credential = this.settings.providers[provider].additionalCredentials.find((item) => item.id === credentialId);
      if (!credential) return { ok: false, code: "credential_not_found", message: "额外 API Key 不存在。" };
      try {
        credential.label = normalizeCredentialLabel(label);
        if (pricingMultiplier !== undefined) credential.pricingMultiplier = normalizePricingMultiplier(pricingMultiplier);
        await this.writeSettingsFile();
        return { ok: true };
      } catch {
        this.settings = previous;
        throw new ProviderSettingsError("额外 API Key 设置写入失败。", "write_failed");
      }
    });
  }

  async removeProviderCredential(
    provider: LlmProviderId,
    credentialId: string,
  ): Promise<ProviderCredentialMutationResult> {
    return this.enqueueMutation(async () => {
      const credentials = this.settings.providers[provider].additionalCredentials;
      if (!credentials.some((item) => item.id === credentialId)) {
        return { ok: false, code: "credential_not_found", message: "额外 API Key 不存在。" };
      }
      const references = Object.entries(this.settings.installedModels)
        .filter(([key, model]) => key.startsWith(`${provider}:`) && model?.credentialId === credentialId)
        .map(([key]) => key as ModelKey);
      if (
        this.settings.imageInspection.modelKey.startsWith(`${provider}:`) &&
        this.settings.imageInspection.credentialId === credentialId
      ) {
        references.push(this.settings.imageInspection.modelKey);
      }
      if (references.length > 0) {
        return { ok: false, code: "credential_in_use", message: "该 API Key 仍被模型使用。", references };
      }

      const previousSettings = cloneJson(this.settings);
      const previousSecrets = cloneJson(this.secrets);
      let secretsWritten = false;
      try {
        this.assertCredentialStorageWritable();
        this.settings.providers[provider].additionalCredentials = credentials.filter((item) => item.id !== credentialId);
        delete this.secrets.providerCredentials[providerCredentialSecretId(provider, credentialId)];
        await this.writeSecretsFile();
        secretsWritten = true;
        await this.writeSettingsFile();
        return { ok: true };
      } catch {
        this.settings = previousSettings;
        this.secrets = previousSecrets;
        if (secretsWritten) await this.restoreFilesBestEffort(previousSettings, previousSecrets);
        throw new ProviderSettingsError("额外 API Key 删除失败。", "write_failed");
      }
    });
  }

  async markProviderCredentialConnectionResult(
    provider: LlmProviderId,
    credentialId: string,
    result: ProviderConnectionProbeResult,
  ): Promise<ProviderCredentialMutationResult> {
    return this.enqueueMutation(async () => {
      const previous = cloneJson(this.settings);
      const credential = this.settings.providers[provider].additionalCredentials.find((item) => item.id === credentialId);
      if (!credential) return { ok: false, code: "credential_not_found", message: "额外 API Key 不存在。" };
      try {
        credential.lastConnection = {
          status: result.ok ? "available" : "unavailable",
          checkedAt: result.checkedAt,
          ...(result.errorKind && { errorKind: result.errorKind }),
          message: result.message.slice(0, 300),
        };
        await this.writeSettingsFile();
        return { ok: true };
      } catch {
        this.settings = previous;
        throw new ProviderSettingsError("额外 API Key 状态写入失败。", "write_failed");
      }
    });
  }

  getOpenRouterManagementRuntimeConfig(): ProviderRuntimeConfig | ProviderRuntimeError {
    const runtime = this.getProviderRuntimeConfig("openrouter");
    if ("code" in runtime) return runtime;
    const managementKey = this.getStoredKey("openrouter-management");
    if (!managementKey) {
      return { ok: false, code: "api_key_missing", message: "尚未配置 OpenRouter Management Key。" };
    }
    return { ...runtime, apiKey: managementKey };
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
    if (provider === "speech-minimax") return this.setSpeechKey(apiKey);
    if (provider === "deepseek" || provider === "kimi" || provider === "openrouter") {
      try {
        await this.updateProviderConnection({ provider, apiKey });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "API Key 保存失败。" };
      }
    }
    if (provider === "image-generation") {
      try {
        await this.updateImageGeneration({
          apiKey,
          baseUrl: this.settings.imageGeneration.baseUrl,
          model: this.settings.imageGeneration.model,
        });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "API Key 保存失败。" };
      }
    }
    return this.setSearchProviderKey(provider, apiKey);
  }

  async clearProviderKey(provider: SecretProviderId): Promise<{ ok: boolean }> {
    if (provider === "speech-minimax") return this.setSpeechKey(null);
    if (provider === "deepseek" || provider === "kimi" || provider === "openrouter") {
      try {
        await this.updateProviderConnection({ provider, apiKey: null });
        return { ok: true };
      } catch {
        return { ok: false };
      }
    }
    if (provider === "image-generation") {
      return this.enqueueMutation(async () => {
        const previous = { ...this.secrets };
        try {
          this.assertCredentialStorageWritable();
          delete this.secrets["image-generation"];
          await this.writeSecretsFile();
          this.applyToEnv();
          return { ok: true };
        } catch {
          this.secrets = previous;
          return { ok: false };
        }
      });
    }
    return this.clearSearchProviderKey(provider);
  }

  async getSearchUsage(): Promise<SearchUsageResult> {
    const key = this.getStoredKey("tavily");
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

  getSpeechSettings(): SpeechSettings { return { ...this.v4Metadata.speech }; }

  private async setSpeechKey(apiKey: string | null): Promise<{ ok: boolean; error?: string }> {
    return this.enqueueMutation(async () => {
      const previous = { ...this.secrets };
      try {
        this.assertCredentialStorageWritable();
        if (apiKey?.trim()) this.secrets["speech-minimax"] = apiKey.trim();
        else delete this.secrets["speech-minimax"];
        await this.writeSecretsFile();
      } catch {
        this.secrets = previous;
        return { ok: false, error: "语音 Key 保存失败，请检查凭据存储。" };
      }
      const notification = { revision: this.getV4().revision, changedNamespaces: ["media" as const] };
      for (const listener of this.v4ChangeListeners) { try { listener(notification); } catch { /* Storage already committed. */ } }
      return { ok: true };
    });
  }

  /** Main-only credential boundary. */
  getStoredKey(provider: PersistedSecretProviderId): string | undefined {
    return this.secrets[provider];
  }

  private getStoredProviderCredential(provider: LlmProviderId, credentialId: string): string | undefined {
    return this.secrets.providerCredentials[providerCredentialSecretId(provider, credentialId)];
  }

  private async setSearchProviderKey(
    provider: SearchProviderId,
    apiKey: string,
  ): Promise<{ ok: boolean; error?: string }> {
    return this.enqueueMutation(async () => {
      const previous = { ...this.secrets };
      try {
        this.assertCredentialStorageWritable();
        const trimmed = apiKey.trim();
        if (!trimmed) return { ok: false, error: "API Key 不能为空。" };
        this.secrets[provider] = trimmed;
        await this.writeSecretsFile();
        this.applyToEnv();
        return { ok: true };
      } catch (error) {
        this.secrets = previous;
        return {
          ok: false,
          error: error instanceof ProviderSettingsError ? error.message : "API Key 保存失败。",
        };
      }
    });
  }

  private async clearSearchProviderKey(provider: SearchProviderId): Promise<{ ok: boolean }> {
    return this.enqueueMutation(async () => {
      const previous = { ...this.secrets };
      try {
        this.assertCredentialStorageWritable();
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
    setOrDeleteEnv(envKey, this.getStoredKey(provider));
  }

  /** Desktop LLM credentials stay main-only; only search/tool preferences retain env compatibility. */
  private applyToEnv(): void {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.KIMI_API_KEY;
    for (const id of SEARCH_PROVIDER_IDS) this.applyProviderKey(id, SEARCH_PROVIDER_ENV_KEYS[id]);
    process.env.IMAGE_GENERATION_BASE_URL = this.settings.imageGeneration.baseUrl;
    process.env.IMAGE_GENERATION_MODEL = this.settings.imageGeneration.model;
    process.env.ACTSPACE_DISABLED_TOOLS = this.settings.agent.disabledTools.join(",");
    process.env.ACTSPACE_BASH_ALWAYS_ASK = this.settings.agent.bashAlwaysAsk ? "1" : "0";
    setOrDeleteEnv("LLM_TEMPERATURE", this.settings.agent.temperature === null ? undefined : String(this.settings.agent.temperature));
    setOrDeleteEnv("LLM_MAX_TOKENS", this.settings.agent.maxTokens === null ? undefined : String(this.settings.agent.maxTokens));
    this.reloadEnv();
  }

  private getImageGenerationSettingsView(): ImageGenerationSettingsView {
    return {
      hasApiKey: Boolean(this.getStoredKey("image-generation")),
      baseUrl: this.settings.imageGeneration.baseUrl,
      model: this.settings.imageGeneration.model,
    };
  }

  private async readSettingsFile(): Promise<ReadSettingsResult> {
    const filePath = join(this.dataRoot, SETTINGS_FILE);
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (isNotFoundError(error)) {
        const settings = defaultSettingsFromEnv(this.dataRoot);
        return { settings, v4Metadata: defaultSettingsV4Metadata(), source: "missing" };
      }
      return blockingSettings(this.dataRoot, "Settings file could not be read safely.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return blockingSettings(this.dataRoot, "Settings file contains invalid JSON.");
    }
    if (!isRecord(parsed)) {
      return blockingSettings(this.dataRoot, "Settings file must contain a JSON object.");
    }
    if (parsed.version === 1) {
      const migrated = migrateV1Settings(parsed, this.dataRoot, Boolean(this.getStoredKey("deepseek")));
      return { ...migrated, v4Metadata: metadataFromSettingsV3(migrated.settings), source: "v1", rawV1: raw };
    }
    if (parsed.version === 2) {
      if (!hasRequiredSettingsSections(parsed)) return blockingSettings(this.dataRoot, "Settings v2 is incomplete and cannot be migrated safely.");
      const settings = mergePersistedSettingsV3(parsed, this.dataRoot);
      return {
        settings,
        v4Metadata: metadataFromSettingsV3(settings),
        source: "v2",
        rawV2: raw,
      };
    }
    if (parsed.version === 3) {
      if (!hasRequiredSettingsSections(parsed)) return blockingSettings(this.dataRoot, "Settings v3 is incomplete and cannot be used safely.");
      const settings = mergePersistedSettingsV3(parsed, this.dataRoot);
      return {
        settings,
        v4Metadata: metadataFromSettingsV3(settings),
        source: hasRemovedDuckCodingSettings(parsed) ? "legacy-removed" : "v3",
        rawV3: raw,
      };
    }
    if (parsed.version === 4) {
      const migrated = parseSettingsV4(parsed, this.dataRoot);
      if (!migrated) return blockingSettings(this.dataRoot, "Settings v4 is incomplete or contains invalid fields.");
      return { ...migrated, source: "v4" };
    }
    return blockingSettings(this.dataRoot, "Settings file version is unsupported.");
  }

  private async readSecretsFile(): Promise<ReadSecretsResult> {
    const filePath = join(this.dataRoot, SECRETS_FILE);
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (isNotFoundError(error)) return { secrets: emptySecrets(), source: "missing" };
      return unavailableSecrets("read_failed", "凭据文件读取失败。为避免覆盖现有 Key，Actspace 已暂停凭据修改。");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return unavailableSecrets("invalid_format", "凭据文件格式无效。为避免覆盖现有 Key，Actspace 已暂停凭据修改。");
    }
    if (!isRecord(parsed)) {
      return unavailableSecrets("invalid_format", "凭据文件格式无效。为避免覆盖现有 Key，Actspace 已暂停凭据修改。");
    }

    if (parsed.version === 2) {
      const parsedSecrets = parseSecretsV2(parsed);
      if (!parsedSecrets) {
        return unavailableSecrets("invalid_format", "凭据文件字段无效。为避免覆盖现有 Key，Actspace 已暂停凭据修改。");
      }
      try {
        await chmod(filePath, 0o600);
      } catch {
        return unavailableSecrets("read_failed", "凭据文件权限无法收紧为仅当前用户可读写。Actspace 已暂停凭据修改。");
      }
      return { secrets: parsedSecrets.secrets, source: parsedSecrets.legacyProviderRemoved ? "legacy-removed" : "v2" };
    }

    if (parsed.version === 1) {
      const legacy = parseSecretsV1(parsed);
      if (!legacy) {
        return unavailableSecrets("invalid_format", "旧版凭据文件字段无效。为避免覆盖现有 Key，Actspace 已暂停凭据修改。");
      }
      const migrated = this.decryptLegacySecrets(legacy.secrets);
      if (!migrated) {
        return unavailableSecrets("migration_failed", "旧版凭据无法解密。请使用最后一次能读取这些 Key 的 Actspace 版本启动后再迁移。");
      }
      return { secrets: migrated, source: legacy.legacyProviderRemoved ? "legacy-removed" : "v1" };
    }

    return unavailableSecrets("invalid_format", "凭据文件版本不受支持。为避免覆盖现有 Key，Actspace 已暂停凭据修改。");
  }

  private async writeSettingsFile(changedNamespaces: SettingsV4Namespace[] = ALL_SETTINGS_V4_NAMESPACES): Promise<void> {
    const next = toSettingsV4(this.settings, this.v4Metadata);
    await this.writeJson(join(this.dataRoot, SETTINGS_FILE), next);
    const notification: SettingsV4ChangedNotification = {
      revision: computeSettingsRevision(next),
      changedNamespaces: [...new Set(changedNamespaces)],
    };
    for (const listener of this.v4ChangeListeners) {
      try {
        listener(notification);
      } catch {
        // A renderer listener must never make a settings mutation appear failed.
      }
    }
  }

  private async writeSecretsFile(): Promise<void> {
    this.assertCredentialStorageWritable();
    const filePath = join(this.dataRoot, SECRETS_FILE);
    await this.writeJson(filePath, this.secrets, { mode: 0o600 });
    await chmod(filePath, 0o600);
  }

  private async restoreFilesBestEffort(settings: PersistedSettingsV3, secrets: PersistedSecrets): Promise<void> {
    try {
      await this.writeJson(join(this.dataRoot, SETTINGS_FILE), toSettingsV4(settings, this.v4Metadata));
      const secretsPath = join(this.dataRoot, SECRETS_FILE);
      await this.writeJson(secretsPath, secrets, { mode: 0o600 });
      await chmod(secretsPath, 0o600);
    } catch {
      // Original operation still reports failure; recovery is best effort only.
    }
  }

  private decryptLegacySecrets(legacy: PersistedSecretsV1): PersistedSecrets | undefined {
    const entries = secretEntries(legacy);
    if (entries.length > 0 && !this.crypto.isAvailable()) return undefined;
    const migrated = emptySecrets();
    try {
      for (const [id, cipher] of entries) {
        const plain = this.crypto.decrypt(Buffer.from(cipher, "base64"));
        if (!plain) return undefined;
        if (isProviderCredentialSecretId(id)) migrated.providerCredentials[id] = plain;
        else migrated[id as PersistedSecretProviderId] = plain;
      }
      return migrated;
    } catch {
      return undefined;
    }
  }

  private assertCredentialStorageWritable(): void {
    if (!this.credentialStorageIssue) return;
    throw new ProviderSettingsError(this.credentialStorageIssue.message, "secret_storage_unavailable");
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

function emptySecrets(): PersistedSecrets {
  return { version: 2, providerCredentials: {} };
}

function unavailableSecrets(code: CredentialStorageIssueCode, message: string): ReadSecretsResult {
  return { secrets: emptySecrets(), source: "unavailable", issue: { code, message } };
}

function parseSecretsV1(value: Record<string, unknown>): { secrets: PersistedSecretsV1; legacyProviderRemoved: boolean } | undefined {
  const parsed = parseSecretFields(value, true);
  return parsed ? { secrets: { version: 1, ...parsed.secrets }, legacyProviderRemoved: parsed.legacyProviderRemoved } : undefined;
}

function parseSecretsV2(value: Record<string, unknown>): { secrets: PersistedSecrets; legacyProviderRemoved: boolean } | undefined {
  const parsed = parseSecretFields(value, false);
  return parsed ? { secrets: { version: 2, ...parsed.secrets }, legacyProviderRemoved: parsed.legacyProviderRemoved } : undefined;
}

type ParsedSecretFields = {
  secrets: Omit<PersistedSecrets, "version">;
  legacyProviderRemoved: boolean;
};

function parseSecretFields(
  value: Record<string, unknown>,
  allowMissingProviderCredentials: boolean,
): ParsedSecretFields | undefined {
  const allowedTopLevel = new Set<string>(["version", "providerCredentials", "duckcoding", ...ALL_SECRET_PROVIDER_IDS]);
  if (Object.keys(value).some((key) => !allowedTopLevel.has(key))) return undefined;
  if (!isRecord(value.providerCredentials) && !(allowMissingProviderCredentials && value.providerCredentials === undefined)) {
    return undefined;
  }

  let legacyProviderRemoved = false;
  if (value.duckcoding !== undefined) {
    if (typeof value.duckcoding !== "string" || value.duckcoding.length === 0) return undefined;
    legacyProviderRemoved = true;
  }
  const parsed: Omit<PersistedSecrets, "version"> = { providerCredentials: {} };
  for (const id of ALL_SECRET_PROVIDER_IDS) {
    const secret = value[id];
    if (secret === undefined) continue;
    if (typeof secret !== "string" || secret.length === 0) return undefined;
    parsed[id] = secret;
  }
  for (const [id, secret] of Object.entries(isRecord(value.providerCredentials) ? value.providerCredentials : {})) {
    if (id.startsWith("duckcoding:")) {
      if (!isValidCredentialId(id.slice("duckcoding:".length)) || typeof secret !== "string" || secret.length === 0) return undefined;
      legacyProviderRemoved = true;
      continue;
    }
    if (!isProviderCredentialSecretId(id) || typeof secret !== "string" || secret.length === 0) return undefined;
    parsed.providerCredentials[id] = secret;
  }
  return { secrets: parsed, legacyProviderRemoved };
}

function secretEntries(secrets: PersistedSecretsV1): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const id of ALL_SECRET_PROVIDER_IDS) {
    const secret = secrets[id];
    if (secret) entries.push([id, secret]);
  }
  entries.push(...Object.entries(secrets.providerCredentials));
  return entries;
}

function defaultProviderSettings(): ProviderConnectionSettings {
  return {
    enabled: true,
    baseUrl: null,
    proxy: { enabled: false, url: null },
    lastConnection: { status: "untested" },
    defaultPricingMultiplier: 1,
    additionalCredentials: [],
  };
}

function defaultInstalledModels(): Partial<Record<ModelKey, InstalledModelSettings>> {
  return Object.fromEntries(BUILTIN_MODEL_LIST.map((definition) => [
    definition.key,
    { enabled: true, addedAt: BUILTIN_MODEL_ADDED_AT },
  ])) as Partial<Record<ModelKey, InstalledModelSettings>>;
}

function defaultSettingsFromEnv(dataRoot: string): PersistedSettingsV3 {
  const env = {
    IMAGE_GENERATION_BASE_URL: process.env.IMAGE_GENERATION_BASE_URL,
    IMAGE_GENERATION_MODEL: process.env.IMAGE_GENERATION_MODEL,
    LLM_TEMPERATURE: Number(process.env.LLM_TEMPERATURE ?? LLM_TEMPERATURE_DEFAULT),
    LLM_MAX_TOKENS: Number(process.env.LLM_MAX_TOKENS ?? LLM_MAX_TOKENS_DEFAULT),
    ACTSPACE_DISABLED_TOOLS: (process.env.ACTSPACE_DISABLED_TOOLS ?? "").split(",").map((value) => value.trim()).filter(Boolean),
    ACTSPACE_BASH_ALWAYS_ASK: process.env.ACTSPACE_BASH_ALWAYS_ASK === "1",
  };
  const imageGeneration = safeImageGenerationDefaults(
    env.IMAGE_GENERATION_BASE_URL,
    env.IMAGE_GENERATION_MODEL,
  );
  return {
    version: 3,
    providers: Object.fromEntries(PROVIDER_IDS.map((id) => [id, defaultProviderSettings()])) as PersistedSettingsV3["providers"],
    installedModels: defaultInstalledModels(),
    customModels: {},
    taskModels: { defaultChatModel: null, utilityModel: null, exploreModel: null },
    imageGeneration,
    imageInspection: { modelKey: DEFAULT_IMAGE_INSPECTION_MODEL_KEY },
    agent: {
      systemPromptPath: defaultSystemPromptPath(dataRoot),
      temperature: env.LLM_TEMPERATURE !== LLM_TEMPERATURE_DEFAULT ? env.LLM_TEMPERATURE : null,
      maxTokens: env.LLM_MAX_TOKENS !== LLM_MAX_TOKENS_DEFAULT ? env.LLM_MAX_TOKENS : null,
      disabledTools: [...env.ACTSPACE_DISABLED_TOOLS],
      bashAlwaysAsk: env.ACTSPACE_BASH_ALWAYS_ASK,
    },
    skills: { disabled: [] },
    shortcuts: {
      quickOpen: {
        enabled: true,
        accelerator: DEFAULT_QUICK_OPEN_ACCELERATOR,
        target: { kind: "automatic" },
      },
    },
  };
}

function defaultSettingsV4Metadata(): SettingsV4Metadata {
  return {
    speech: { ...DEFAULT_SPEECH_SETTINGS },
    models: {
      connections: {},
      definitions: {},
      installed: {},
      taskBindings: { defaultChat: null, utility: null, explore: null },
    },
    general: {
      englishLearning: { lastSessionId: null },
      personalization: { displayName: "", responseStyle: "" },
      agentInstructions: { systemPromptPath: "" },
      taskDefaults: { temperature: null, maxOutputTokens: null, chatCompactionTriggerRatio: 0.8 },
      shortcuts: {
        quickOpen: {
          enabled: true,
          accelerator: DEFAULT_QUICK_OPEN_ACCELERATOR,
          target: { kind: "automatic" },
        },
      },
    },
    tools: {
      disabledTools: [],
      bash: { alwaysAsk: false },
      showFileChangeStats: true,
      searchProviders: Object.fromEntries(SEARCH_PROVIDER_IDS.map((id) => [id, { enabled: true }])),
    },
    subagents: { routes: {} },
    activity: {
      usage: {
        range: "30d",
        status: "all",
        modelFilter: "",
        showDetails: false,
        activeTab: "requests",
      },
    },
  };
}

function metadataFromSettingsV3(settings: PersistedSettingsV3): SettingsV4Metadata {
  const defaults = defaultSettingsV4Metadata();
  return {
    speech: { ...DEFAULT_SPEECH_SETTINGS },
    models: {
      connections: {},
      definitions: cloneJson(settings.customModels),
      installed: {},
      taskBindings: { defaultChat: settings.taskModels.defaultChatModel, utility: settings.taskModels.utilityModel, explore: settings.taskModels.exploreModel },
    },
    general: {
      ...defaults.general,
      agentInstructions: { systemPromptPath: settings.agent.systemPromptPath },
      taskDefaults: {
        temperature: settings.agent.temperature,
        maxOutputTokens: settings.agent.maxTokens,
        chatCompactionTriggerRatio: defaults.general.taskDefaults.chatCompactionTriggerRatio,
      },
      shortcuts: cloneJson(settings.shortcuts),
    },
    tools: {
      ...defaults.tools,
      disabledTools: [...settings.agent.disabledTools],
      bash: { alwaysAsk: settings.agent.bashAlwaysAsk },
    },
    subagents: {
      routes: settings.taskModels.exploreModel
        ? { explore: { enabled: true, model: settings.taskModels.exploreModel } }
        : {},
    },
    activity: defaults.activity,
  };
}

function metadataFromSettingsV4(settings: SettingsV4): SettingsV4Metadata {
  return {
    speech: sanitizeSpeechSettings(settings.media.speech),
    models: cloneJson(settings.models),
    general: cloneJson(settings.general),
    tools: cloneJson(settings.tools),
    subagents: cloneJson(settings.subagents),
    activity: cloneJson(settings.activity),
  };
}

function toSettingsV4(settings: PersistedSettingsV3, metadata: SettingsV4Metadata): SettingsV4 {
  const general = cloneJson(metadata.general);
  if (!general.agentInstructions.systemPromptPath) general.agentInstructions.systemPromptPath = settings.agent.systemPromptPath;
  if (general.taskDefaults.temperature === null && settings.agent.temperature !== null) general.taskDefaults.temperature = settings.agent.temperature;
  if (general.taskDefaults.maxOutputTokens === null && settings.agent.maxTokens !== null) general.taskDefaults.maxOutputTokens = settings.agent.maxTokens;
  const tools = cloneJson(metadata.tools);
  if (tools.disabledTools.length === 0 && settings.agent.disabledTools.length > 0) tools.disabledTools = [...settings.agent.disabledTools];
  if (!tools.bash.alwaysAsk && settings.agent.bashAlwaysAsk) tools.bash.alwaysAsk = true;
  const subagents = cloneJson(metadata.subagents);
  if (!subagents.routes.explore && settings.taskModels.exploreModel) {
    subagents.routes.explore = { enabled: true, model: settings.taskModels.exploreModel };
  }
  return {
    version: 4,
    general,
    models: {
      connections: { ...cloneJson(metadata.models.connections), ...Object.fromEntries(PROVIDER_IDS.map((providerId) => [
        `${providerId}:default`,
        {
          connectionId: `${providerId}:default`,
          providerId,
          ...cloneJson(settings.providers[providerId]),
        },
      ])) },
      definitions: cloneJson(settings.customModels),
      installed: Object.fromEntries(Object.entries(settings.installedModels).map(([modelKey, model]) => [
        modelKey,
        { connectionId: `${modelKey.split(":")[0]}:default`, ...cloneJson(model) },
      ])),
      taskBindings: {
        defaultChat: settings.taskModels.defaultChatModel,
        utility: settings.taskModels.utilityModel,
        explore: settings.taskModels.exploreModel,
      },
    },
    tools,
    media: {
      speech: cloneJson(metadata.speech),
      imageGeneration: cloneJson(settings.imageGeneration),
      imageInspection: cloneJson(settings.imageInspection),
    },
    skills: cloneJson(settings.skills),
    subagents,
    activity: cloneJson(metadata.activity),
  };
}

function legacySettingsFromV4(settings: SettingsV4, dataRoot: string): PersistedSettingsV3 {
  const seed = defaultSettingsFromEnv(dataRoot);
  const providers = Object.fromEntries(PROVIDER_IDS.map((providerId) => {
    const connection = settings.models.connections[`${providerId}:default`];
    return [providerId, connection ? sanitizeProviderSettings(connection, seed.providers[providerId], providerId) : seed.providers[providerId]];
  })) as PersistedSettingsV3["providers"];
  const installedModels = Object.fromEntries(Object.entries(settings.models.installed as Record<string, SettingsV4InstalledModelSettings>).map(([modelKey, model]) => [modelKey, {
    enabled: model.enabled,
    addedAt: model.addedAt,
    ...(model.connectionId ? { connectionId: model.connectionId } : {}),
    ...(model.customLabel !== undefined && { customLabel: model.customLabel }),
    ...(model.credentialId !== undefined && { credentialId: model.credentialId }),
  }])) as PersistedSettingsV3["installedModels"];
  const explore = settings.models.taskBindings.explore ?? settings.subagents.routes.explore?.model ?? null;
  const general = settings.general;
  return {
    version: 3,
    providers,
    installedModels,
    customModels: cloneJson(settings.models.definitions),
    taskModels: {
      defaultChatModel: settings.models.taskBindings.defaultChat,
      utilityModel: settings.models.taskBindings.utility,
      exploreModel: explore,
    },
    imageGeneration: sanitizeImageGenerationSettings(settings.media.imageGeneration, seed.imageGeneration),
    imageInspection: sanitizeImageInspectionSettings(settings.media.imageInspection),
    agent: sanitizeAgentV2({
      systemPromptPath: general.agentInstructions.systemPromptPath,
      temperature: general.taskDefaults.temperature,
      maxTokens: general.taskDefaults.maxOutputTokens,
      disabledTools: settings.tools.disabledTools,
      bashAlwaysAsk: settings.tools.bash.alwaysAsk,
    }, seed.agent),
    skills: sanitizeSkills(settings.skills),
    shortcuts: sanitizeShortcuts(general.shortcuts),
  };
}

function parseSettingsV4(raw: Record<string, unknown>, dataRoot: string): {
  settings: PersistedSettingsV3;
  v4Metadata: SettingsV4Metadata;
} | undefined {
  if (!isRecord(raw.general) || !isRecord(raw.models) || !isRecord(raw.tools) || !isRecord(raw.media) ||
    !isRecord(raw.skills) || !isRecord(raw.subagents) || !isRecord(raw.activity)) return undefined;
  const seed = defaultSettingsFromEnv(dataRoot);
  const general = isRecord(raw.general) ? raw.general : {};
  const personalization = isRecord(general.personalization) ? general.personalization : {};
  const instructions = isRecord(general.agentInstructions) ? general.agentInstructions : {};
  const taskDefaults = isRecord(general.taskDefaults) ? general.taskDefaults : {};
  const tools = isRecord(raw.tools) ? raw.tools : {};
  const bash = isRecord(tools.bash) ? tools.bash : {};
  const searchProviders = isRecord(tools.searchProviders) ? tools.searchProviders : {};
  const models = isRecord(raw.models) ? raw.models : {};
  const taskBindings = isRecord(models.taskBindings) ? models.taskBindings : {};
  const media = isRecord(raw.media) ? raw.media : {};
  const activity = isRecord(raw.activity) ? raw.activity : {};
  const usage = isRecord(activity.usage) ? activity.usage : {};
  const definitions = isRecord(models.definitions) ? models.definitions : {};
  const installed = (isRecord(models.installed) ? models.installed : {}) as Record<string, unknown>;
  const connections = (isRecord(models.connections) ? models.connections : {}) as Record<string, unknown>;
  const routes = (isRecord(raw.subagents) && isRecord(raw.subagents.routes) ? raw.subagents.routes : {}) as Record<string, unknown>;
  const settings: SettingsV4 = {
    version: 4,
    general: {
      englishLearning: { lastSessionId: isRecord(general.englishLearning) && typeof general.englishLearning.lastSessionId === "string" ? general.englishLearning.lastSessionId.slice(0, 200) : null },
      personalization: {
        displayName: typeof personalization.displayName === "string" ? personalization.displayName.slice(0, 60) : "",
        responseStyle: typeof personalization.responseStyle === "string" ? personalization.responseStyle.slice(0, 500) : "",
      },
      agentInstructions: {
        systemPromptPath: sanitizeSystemPromptPath(instructions.systemPromptPath, seed.agent.systemPromptPath),
      },
      taskDefaults: {
        temperature: sanitizeNullableNumber(taskDefaults.temperature, -0, 2),
        maxOutputTokens: sanitizeNullableInteger(taskDefaults.maxOutputTokens, 1, 1_000_000),
        chatCompactionTriggerRatio: sanitizeNumber(taskDefaults.chatCompactionTriggerRatio, 0.5, 0.95, 0.8),
      },
      shortcuts: sanitizeShortcuts(general.shortcuts),
    },
    models: {
      connections: Object.fromEntries(Object.entries(connections).flatMap(([id, value]) => {
        if (!isRecord(value) || typeof value.providerId !== "string" || !isProviderId(value.providerId)) return [];
        return [[id, {
          connectionId: id,
          providerId: value.providerId,
          protocol: isConnectionProtocol(value.protocol) ? value.protocol : "openai-completions",
          ...(typeof value.displayName === "string" ? { displayName: value.displayName.slice(0, 120) } : {}),
          ...(typeof value.defaultModel === "string" ? { defaultModel: value.defaultModel.slice(0, 200) } : {}),
          ...(typeof value.catalogId === "string" ? { catalogId: value.catalogId.slice(0, 80) } : {}),
          ...sanitizeProviderSettings(value, seed.providers[value.providerId], value.providerId),
        } satisfies SettingsV4["models"]["connections"][string]]];
      })),
      definitions: sanitizeCustomModels(definitions),
      installed: Object.fromEntries(Object.entries(installed).sort(([a], [b]) => modelKeyMigrationPriority(a) - modelKeyMigrationPriority(b)).flatMap(([modelKey, value]) => {
        const normalized = normalizeModelKey(modelKey);
        if (!normalized || !isRecord(value)) return [];
        const providerId = normalized.split(":")[0] as LlmProviderId;
        return [[normalized, {
          connectionId: typeof value.connectionId === "string" ? value.connectionId : `${providerId}:default`,
          ...sanitizeInstalledModel(value, seed.installedModels[normalized] ?? { enabled: false, addedAt: BUILTIN_MODEL_ADDED_AT }),
        } satisfies SettingsV4InstalledModelSettings]];
      })),
      taskBindings: {
        defaultChat: normalizeModelKeyOrNull(taskBindings.defaultChat),
        utility: normalizeModelKeyOrNull(taskBindings.utility),
        explore: normalizeModelKeyOrNull(taskBindings.explore),
      },
    },
    tools: {
      disabledTools: Array.isArray(tools.disabledTools) ? tools.disabledTools.filter((value): value is string => typeof value === "string").slice(0, 200) : [],
      bash: { alwaysAsk: bash.alwaysAsk === true },
      showFileChangeStats: tools.showFileChangeStats !== false,
      searchProviders: Object.fromEntries(SEARCH_PROVIDER_IDS.map((id) => {
        const provider = isRecord(searchProviders[id]) ? searchProviders[id] : {};
        return [id, { enabled: provider.enabled !== false }];
      })),
    },
    media: {
      speech: sanitizeSpeechSettings(media.speech),
      imageGeneration: sanitizeImageGenerationSettings(media.imageGeneration, seed.imageGeneration),
      imageInspection: sanitizeImageInspectionSettings(media.imageInspection),
    },
    skills: sanitizeSkills(raw.skills),
    subagents: {
      routes: Object.fromEntries(Object.entries(routes).flatMap(([id, value]) => {
        if (!isRecord(value)) return [];
        return [[id, {
          enabled: value.enabled !== false,
          model: normalizeModelKeyOrNull(value.model),
        } satisfies SettingsV4SubagentRoute]];
      })),
    },
    activity: {
      usage: sanitizeUsagePreferences(usage),
    },
  };
  return { settings: legacySettingsFromV4(settings, dataRoot), v4Metadata: metadataFromSettingsV4(settings) };
}

function sanitizeUsagePreferences(value: Record<string, unknown>): SettingsV4UsagePreferences {
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

function normalizeModelKeyOrNull(value: unknown): ModelKey | null {
  if (typeof value !== "string") return null;
  return normalizeModelKey(value);
}

function sanitizeNullableNumber(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function sanitizeNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return fallback;
  const rounded = Math.round(value * 20) / 20;
  return Math.abs(value - rounded) < Number.EPSILON * 10 ? rounded : fallback;
}

function sanitizeNullableInteger(value: unknown, min: number, max: number): number | null {
  const number = sanitizeNullableNumber(value, min, max);
  return number === null ? null : Math.floor(number);
}

function applySettingsV4NamespacePatch(settings: SettingsV4, input: SettingsV4UpdateInput): SettingsV4 {
  const next = cloneJson(settings);
  switch (input.namespace) {
    case "general":
      next.general = { ...next.general, ...input.patch, shortcuts: { ...next.general.shortcuts, ...(input.patch.shortcuts ?? {}) } };
      break;
    case "models":
      next.models = {
        ...next.models,
        ...input.patch,
        connections: applyRecordPatch(next.models.connections, input.patch.connections),
        definitions: { ...next.models.definitions, ...(input.patch.definitions ?? {}) },
        installed: { ...next.models.installed, ...(input.patch.installed ?? {}) },
        taskBindings: { ...next.models.taskBindings, ...(input.patch.taskBindings ?? {}) },
      };
      break;
    case "tools":
      next.tools = { ...next.tools, ...input.patch, bash: { ...next.tools.bash, ...(input.patch.bash ?? {}) }, searchProviders: { ...next.tools.searchProviders, ...(input.patch.searchProviders ?? {}) } };
      break;
    case "media":
      next.media = { ...next.media, ...input.patch, imageGeneration: { ...next.media.imageGeneration, ...(input.patch.imageGeneration ?? {}) }, imageInspection: { ...next.media.imageInspection, ...(input.patch.imageInspection ?? {}) } };
      break;
    case "skills":
      next.skills = { ...next.skills, ...input.patch };
      break;
    case "subagents":
      next.subagents = { ...next.subagents, ...input.patch, routes: { ...next.subagents.routes, ...(input.patch.routes ?? {}) } };
      break;
    case "activity":
      next.activity = { ...next.activity, ...input.patch, usage: { ...next.activity.usage, ...(input.patch.usage ?? {}) } };
      break;
  }
  return next;
}

function applyRecordPatch<T>(current: Record<string, T>, patch: Record<string, T> | undefined): Record<string, T> {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value === null) delete next[key];
    else next[key] = value as T;
  }
  return next;
}

function computeSettingsRevision(settings: SettingsV4): string {
  return createHash("sha256").update(JSON.stringify(settings)).digest("hex");
}

function safeImageGenerationDefaults(baseUrl: string, model: string): PersistedSettingsV3["imageGeneration"] {
  try {
    return {
      baseUrl: normalizeImageGenerationBaseUrl(baseUrl),
      model: normalizeImageGenerationModel(model),
    };
  } catch {
    return {
      baseUrl: DEFAULT_IMAGE_GENERATION_BASE_URL,
      model: DEFAULT_IMAGE_GENERATION_MODEL,
    };
  }
}

function migrateV1Settings(
  raw: Record<string, unknown>,
  dataRoot: string,
  hasDeepSeekKey: boolean,
): Omit<ReadSettingsResult, "source" | "rawV1" | "v4Metadata"> {
  const seed = defaultSettingsFromEnv(dataRoot);
  const agent = isRecord(raw.agent) ? raw.agent : {};
  const defaultModel = isModelId(raw.defaultModelId) ? LEGACY_MODEL_KEY_MAP[raw.defaultModelId] : null;
  const exploreModel = isModelId(agent.exploreModelId) ? LEGACY_MODEL_KEY_MAP[agent.exploreModelId] : null;
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
      skills: sanitizeSkills(isRecord(raw.skills) ? raw.skills : {}),
    },
  };
}

function mergePersistedSettingsV3(raw: Record<string, unknown>, dataRoot: string): PersistedSettingsV3 {
  const seed = defaultSettingsFromEnv(dataRoot);
  const providers = isRecord(raw.providers) ? raw.providers : {};
  for (const id of PROVIDER_IDS) {
    seed.providers[id] = sanitizeProviderSettings(
      isRecord(providers[id]) ? providers[id] : {},
      seed.providers[id],
      id,
    );
  }
  seed.installedModels = sanitizeInstalledModels(raw.installedModels, seed.installedModels);
  seed.customModels = sanitizeCustomModels(raw.customModels);
  seed.taskModels = sanitizeTaskModels(raw.taskModels);
  seed.imageGeneration = sanitizeImageGenerationSettings(raw.imageGeneration, seed.imageGeneration);
  seed.imageInspection = sanitizeImageInspectionSettings(raw.imageInspection);
  seed.agent = sanitizeAgentV2(isRecord(raw.agent) ? raw.agent : {}, seed.agent);
  seed.skills = sanitizeSkills(isRecord(raw.skills) ? raw.skills : {});
  seed.shortcuts = sanitizeShortcuts(raw.shortcuts);
  return seed;
}

function hasRemovedDuckCodingSettings(raw: Record<string, unknown>): boolean {
  const providers = isRecord(raw.providers) && Object.prototype.hasOwnProperty.call(raw.providers, "duckcoding");
  const modelKeys = [
    ...(isRecord(raw.installedModels) ? Object.keys(raw.installedModels) : []),
    ...(isRecord(raw.customModels) ? Object.keys(raw.customModels) : []),
  ];
  const taskModels = isRecord(raw.taskModels) ? Object.values(raw.taskModels) : [];
  return providers || modelKeys.some((key) => key.startsWith("duckcoding:")) ||
    taskModels.some((value) => typeof value === "string" && value.startsWith("duckcoding:"));
}

function sanitizeShortcuts(input: unknown): ShortcutsSettings {
  const value = isRecord(input) ? input : {};
  return {
    quickOpen: sanitizeQuickOpenShortcut(value.quickOpen),
  };
}

function sanitizeQuickOpenShortcut(input: unknown): ShortcutsSettings["quickOpen"] {
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

function sanitizeQuickOpenTarget(input: unknown): ShortcutsSettings["quickOpen"]["target"] {
  if (!isRecord(input)) return { kind: "automatic" };
  if (input.kind === "workspace" && typeof input.workspaceId === "string" && input.workspaceId.trim()) {
    return { kind: "workspace", workspaceId: input.workspaceId.trim().slice(0, 200) };
  }
  if (input.kind === "session" && typeof input.sessionId === "string" && input.sessionId.trim()) {
    return { kind: "session", sessionId: input.sessionId.trim().slice(0, 200) };
  }
  return { kind: "automatic" };
}

function sanitizeImageInspectionSettings(input: unknown): ImageInspectionSettings {
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

function hasRequiredSettingsSections(raw: Record<string, unknown>): boolean {
  return ["providers", "installedModels", "customModels", "taskModels", "imageGeneration", "agent", "skills"]
    .every((key) => isRecord(raw[key]));
}

function blockingSettings(dataRoot: string, message: string): ReadSettingsResult {
  return {
    settings: defaultSettingsFromEnv(dataRoot),
    v4Metadata: defaultSettingsV4Metadata(),
    source: "invalid",
    warning: message,
    blockingError: message,
  };
}

function sanitizeImageGenerationSettings(
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

function normalizeImageGenerationBaseUrl(value: string): string {
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

function normalizeImageGenerationModel(value: string): string {
  const model = value.trim();
  if (!model || model.length > 200 || /[\u0000-\u001f\u007f]/.test(model)) {
    throw new ProviderSettingsError("模型名称无效。", "invalid_model");
  }
  return model;
}

function sanitizeProviderSettings(
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

function migrateLegacyProviderBaseUrl(provider: LlmProviderId, baseUrl: string | null): string | null {
  // Preserve custom gateways; only the retired official DeepSeek Anthropic endpoint is migrated.
  return provider === "deepseek" && baseUrl === "https://api.deepseek.com/anthropic"
    ? null
    : baseUrl;
}

function sanitizeProviderCredentials(input: unknown): ProviderCredentialSettings[] {
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

function normalizeCredentialLabel(value: string): string {
  const label = value.trim();
  if (!label) throw new ProviderSettingsError("API Key 名称不能为空。", "invalid_api_key");
  return label.slice(0, 80);
}

function normalizePricingMultiplier(value: unknown, fallback?: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100) {
    return Math.round(value * 10_000) / 10_000;
  }
  if (fallback !== undefined) return fallback;
  throw new ProviderSettingsError("价格倍率必须是 0 到 100 之间的数字。", "write_failed");
}

function isValidCredentialId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

function providerCredentialSecretId(provider: LlmProviderId, credentialId: string): string {
  return `${provider}:${credentialId}`;
}

function isProviderCredentialSecretId(value: string): boolean {
  if (value.startsWith("connection:")) return /^[a-zA-Z0-9._-]{3,80}$/.test(value.slice("connection:".length));
  const separator = value.indexOf(":");
  if (separator <= 0 || value.indexOf(":", separator + 1) !== -1) return false;
  const provider = value.slice(0, separator);
  const credentialId = value.slice(separator + 1);
  return (PROVIDER_IDS as readonly string[]).includes(provider) && isValidCredentialId(credentialId);
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

function modelKeyMigrationPriority(key: string): number {
  if (key === "deepseek:deepseek-v4-pro" || key === "deepseek-v4-pro") return 0;
  return key === normalizeModelKey(key) ? 2 : 1;
}

function sanitizeInstalledModels(
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

function sanitizeInstalledModel(input: unknown, fallback: InstalledModelSettings): InstalledModelSettings {
  const value = isRecord(input) ? input : {};
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : fallback.enabled,
    addedAt: typeof value.addedAt === "string" && value.addedAt ? value.addedAt : fallback.addedAt,
    ...(typeof value.connectionId === "string" ? { connectionId: value.connectionId } : fallback.connectionId ? { connectionId: fallback.connectionId } : {}),
    ...(typeof value.customLabel === "string" && value.customLabel.trim() && { customLabel: value.customLabel.trim() }),
    ...(isValidCredentialId(value.credentialId) && { credentialId: value.credentialId }),
  };
}

function validateCustomConnection(input: CustomConnectionInput): void {
  if (input.modelReasoning !== undefined) validateCustomModelReasoning(input.modelReasoning);
  if (!isProviderId(input.providerId) || (input.protocol !== undefined && !isConnectionProtocol(input.protocol))) {
    throw new ProviderSettingsError("连接协议无效。", "write_failed");
  }
  if (!input.apiKey?.trim()) throw new ProviderSettingsError("请输入 API Key。", "write_failed");
  if (!input.defaultModel?.trim() || input.defaultModel.trim().length > 200) {
    throw new ProviderSettingsError("请输入有效的默认模型 ID（最多 200 字符）。", "write_failed");
  }
}

/** Separate keys for identical upstream model IDs on different connections. */
function connectionModelPatch(input: CustomConnectionInput, connectionId: string, protocol: ModelApi, models: SettingsV4Models): Pick<SettingsV4Models, "definitions" | "installed"> {
  const apiModel = input.defaultModel!.trim();
  const key: ModelKey = `${input.providerId}:connection/${encodeURIComponent(connectionId)}/${encodeURIComponent(apiModel)}`;
  const previous = models.definitions[key];
  return {
    definitions: { [key]: applyCustomModelReasoning({
      ...previous,
      key, provider: input.providerId, api: protocol, apiModel,
      label: `${input.displayName.trim() || connectionId} · ${apiModel}`,
      source: "custom" as const, contextWindow: previous?.contextWindow ?? null, maxTokens: previous?.maxTokens ?? null,
      thinkingDefault: previous?.thinkingDefault ?? false,
      capabilities: previous?.capabilities ?? { input: ["text"], toolUse: "declared", reasoning: false, thinkingToggle: false },
    }, input.modelReasoning ?? previous?.reasoningConfig ?? { mode: "auto" }) },
    installed: { [key]: { enabled: true, addedAt: new Date().toISOString(), ...models.installed[key], connectionId } },
  };
}

function sanitizeCustomModels(input: unknown): Partial<Record<ModelKey, ModelDefinition>> {
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

function isValidModelDefinition(value: unknown, key: ModelKey): value is ModelDefinition {
  if (!isRecord(value)) return false;
  const normalized = normalizeModelKey(value.key);
  return normalized === key && value.provider === key.slice(0, key.indexOf(":")) &&
    (value.api === "openai-completions" || value.api === "openai-responses" || value.api === "anthropic-messages") &&
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
  return typeof value === "string" && (isPublicModelId(value) || value === "deepseek-v4-pro");
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

async function writeJsonAtomic(filePath: string, value: unknown, options?: { mode?: number }): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", {
    encoding: "utf8",
    ...(options?.mode !== undefined && { mode: options.mode }),
  });
  if (options?.mode !== undefined) await chmod(tmp, options.mode);
  await rename(tmp, filePath);
  if (options?.mode !== undefined) await chmod(filePath, options.mode);
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

async function writeSettingsV2Backup(dataRoot: string, raw: string): Promise<void> {
  const digest = createHash("sha256").update(raw).digest("hex");
  await writeVerifiedBackup(join(dataRoot, SETTINGS_V2_BACKUP_FILE), raw);
  await writeVerifiedBackup(join(dataRoot, SETTINGS_V2_BACKUP_DIGEST_FILE), `${digest}\n`);
}

async function writeSettingsV3Backup(dataRoot: string, raw: string): Promise<void> {
  const digest = createHash("sha256").update(raw).digest("hex");
  await writeVerifiedBackup(join(dataRoot, SETTINGS_V3_BACKUP_FILE), raw);
  await writeVerifiedBackup(join(dataRoot, SETTINGS_V3_BACKUP_DIGEST_FILE), `${digest}\n`);
}

async function writeVerifiedBackup(filePath: string, value: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  try {
    const existing = await readFile(filePath, "utf8");
    if (existing !== value) throw new Error(`Existing backup does not match ${filePath}.`);
    return;
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
  try {
    await writeFile(filePath, value, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
    const existing = await readFile(filePath, "utf8");
    if (existing !== value) throw new Error(`Existing backup does not match ${filePath}.`);
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

function sanitizeSpeechSettings(value: unknown): SpeechSettings {
  const input = isRecord(value) ? value : {};
  return {
    ...DEFAULT_SPEECH_SETTINGS,
    model: isSpeechModel(input.model) ? input.model : DEFAULT_SPEECH_SETTINGS.model,
    voiceId: typeof input.voiceId === "string" && input.voiceId.trim() ? input.voiceId.trim().slice(0, 200) : DEFAULT_SPEECH_SETTINGS.voiceId,
    speed: typeof input.speed === "number" && Number.isFinite(input.speed) && input.speed >= 0.5 && input.speed <= 2 ? input.speed : 1,
  };
}
