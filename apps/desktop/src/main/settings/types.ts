/** settings 模块共用的类型和错误类：持久化结构（v1 secrets、v2 secrets、v3 settings）、读文件的中间结果、构造参数、对外的输入输出类型。 */
import type { SpeechSettings } from "@actspace/shared";
import type {
  AgentSettingsV2,
  CustomConnectionAuthMode,
  CustomConnectionBillingMode,
  CustomConnectionPromptCacheMode,
  CustomConnectionResolvedAuth,
  CredentialStorageIssueCode,
  InstalledModelSettings,
  ImageInspectionSettings,
  LlmProviderId,
  ModelDefinition,
  ModelApi,
  ModelKey,
  ProviderConnectionSettings,
  ProviderConnectionState,
  ProviderProxySettings,
  SearchProviderId,
  SettingsV4,
  SettingsV4ChangedNotification,
  SettingsV4ConnectionSettings,
  SettingsV4Snapshot,
  SkillsSettings,
  ShortcutsSettings,
  TaskModelSettings,
} from "@actspace/shared";

export type ProviderConnectionProbeResult = {
  readonly ok: boolean;
  readonly checkedAt: string;
  readonly errorKind?: ProviderConnectionState["errorKind"];
  readonly message?: string;
  readonly resolvedAuth?: CustomConnectionResolvedAuth;
};

export type ProviderRuntimeConfig = {
  readonly provider: LlmProviderId;
  readonly protocol?: ModelApi;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly pricingMultiplier: number;
  readonly promptCacheMode?: CustomConnectionPromptCacheMode;
  /** 只在自定义连接上出现；Anthropic 协议按它选认证头，其他协议固定 Bearer。 */
  readonly authScheme?: CustomConnectionResolvedAuth;
  readonly billingMode?: CustomConnectionBillingMode;
  readonly transport?: { readonly proxyUrl: string };
};
export type CustomConnectionRuntimeConfig = ProviderRuntimeConfig & {
  readonly connectionId: string;
  readonly protocol: ModelApi;
  readonly model: string;
  readonly authMode: CustomConnectionAuthMode;
  readonly resolvedAuth?: CustomConnectionResolvedAuth;
};

export interface SecretCrypto {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(cipher: Buffer): string;
}

export type AtomicJsonWriter = (filePath: string, value: unknown, options?: { mode?: number }) => Promise<void>;

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
  connections?: Partial<Record<string, SettingsV4ConnectionSettings | null>>;
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

export type OpenRouterManagementSecretId = "openrouter-management";
export type PersistedSecretProviderId = LlmProviderId | SearchProviderId | OpenRouterManagementSecretId | "image-generation" | "speech-minimax";
export type PersistedSecretsV1 = {
  version: 1;
  providerCredentials: Record<string, string>;
} & Partial<Record<PersistedSecretProviderId, string>>;

export type PersistedSecrets = {
  version: 2;
  providerCredentials: Record<string, string>;
} & Partial<Record<PersistedSecretProviderId, string>>;

export interface CredentialStorageIssue {
  code: CredentialStorageIssueCode;
  message: string;
}

export interface ReadSecretsResult {
  secrets: PersistedSecrets;
  source: "missing" | "v1" | "v2" | "legacy-removed" | "unavailable";
  issue?: CredentialStorageIssue;
}

export interface ReadSettingsResult {
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

export type SettingsV4Metadata = Pick<SettingsV4, "general" | "tools" | "subagents" | "activity" | "models"> & { speech: SpeechSettings };

export type SettingsV4ChangeListener = (notification: SettingsV4ChangedNotification) => void;

export interface ImageGenerationRuntimeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}
