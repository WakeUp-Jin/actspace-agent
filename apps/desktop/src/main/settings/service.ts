/** SettingsService：持有 SettingsStore，公开方法都转调 facades/ 下的函数，对外 API 和拆分前相同。 */
import type {
  AgentSystemPromptFile,
  AppSettings,
  AppSettingsV2,
  CredentialStorageView,
  ImageGenerationSettingsView,
  LlmProviderId,
  QuickOpenShortcutUpdateInput,
  SearchUsageResult,
  SecretProviderId,
  SettingsUpdateInput,
  SettingsV2UpdateInput,
  SettingsV4Models,
  SettingsV4Snapshot,
  SettingsV4UpdateInput,
  SpeechSettings,
  UpdateImageGenerationSettingsInput,
} from "@actspace/shared";
import { SettingsStore } from "./store";
import type {
  ImageGenerationRuntimeConfig,
  ModelStorageMutationInput,
  PersistedSecretProviderId,
  PersistedSettingsV3,
  ProviderConnectionMutationInput,
  ProviderRuntimeConfig,
  ProviderRuntimeError,
  SettingsServiceOptions,
  SettingsV4ChangeListener,
} from "./types";
import * as general from "./facades/general";
import * as media from "./facades/media";
import * as modelConnections from "./facades/model-connections";
import * as providers from "./facades/providers";
import * as search from "./facades/search";

export class SettingsService {
  private readonly store: SettingsStore;

  constructor(options: SettingsServiceOptions) {
    this.store = new SettingsStore(options);
  }

  load(): Promise<void> {
    return this.store.load();
  }

  subscribeV4Changes(listener: SettingsV4ChangeListener): () => void {
    return this.store.subscribeV4Changes(listener);
  }

  getV4(): SettingsV4Snapshot {
    return this.store.getV4();
  }

  updateNamespaceV4(input: SettingsV4UpdateInput): Promise<SettingsV4Snapshot> {
    return general.updateNamespaceV4(this.store, input);
  }

  getLastLoadError(): string | undefined {
    return general.getLastLoadError(this.store);
  }

  getCredentialStorageView(): CredentialStorageView {
    return general.getCredentialStorageView(this.store);
  }

  /** Renderer transition view: v2 data plus deprecated v1 selection fields. */
  get(): AppSettings {
    return general.get(this.store);
  }

  /** Main-only pure v2 view. */
  getV2(): AppSettingsV2 {
    return general.getV2(this.store);
  }

  /** Main-only storage snapshot used by model services; never contains decrypted secrets. */
  getModelStorageState(): Pick<PersistedSettingsV3, "installedModels" | "customModels" | "taskModels" | "modelOverrides"> {
    return general.getModelStorageState(this.store);
  }

  updateModelStorage(input: ModelStorageMutationInput): Promise<void> {
    return general.updateModelStorage(this.store, input);
  }

  update(input: SettingsUpdateInput): Promise<AppSettings> {
    return general.update(this.store, input);
  }

  updateV2(input: SettingsV2UpdateInput): Promise<AppSettingsV2> {
    return general.updateV2(this.store, input);
  }

  updateQuickOpenShortcut(input: QuickOpenShortcutUpdateInput): Promise<AppSettings> {
    return general.updateQuickOpenShortcut(this.store, input);
  }

  updateProviderConnection(input: ProviderConnectionMutationInput): Promise<AppSettings> {
    return providers.updateProviderConnection(this.store, input);
  }

  getConnectionRuntimeConfig(provider: LlmProviderId, connectionId?: string): ProviderRuntimeConfig | ProviderRuntimeError {
    return providers.getConnectionRuntimeConfig(this.store, provider, connectionId);
  }

  /** 设置 › 模型 的连接写入：Key 与 models 补丁一起提交。 */
  applyModelsChange(build: (models: SettingsV4Models) => Partial<SettingsV4Models>, secret?: modelConnections.ConnectionSecretChange): Promise<void> {
    return modelConnections.applyModelsChange(this.store, build, secret);
  }

  hasConnectionKey(connectionId: string, providerId: LlmProviderId): boolean {
    return modelConnections.hasConnectionKey(this.store, connectionId, providerId);
  }

  hasOpenRouterManagementKey(): boolean {
    return modelConnections.hasManagementKey(this.store);
  }

  getImageGenerationRuntimeConfig(): ImageGenerationRuntimeConfig | undefined {
    return media.getImageGenerationRuntimeConfig(this.store);
  }

  updateImageGeneration(
    input: UpdateImageGenerationSettingsInput,
  ): Promise<ImageGenerationSettingsView> {
    return media.updateImageGeneration(this.store, input);
  }

  getOpenRouterManagementRuntimeConfig(): ProviderRuntimeConfig | ProviderRuntimeError {
    return providers.getOpenRouterManagementRuntimeConfig(this.store);
  }

  readAgentSystemPrompt(): Promise<AgentSystemPromptFile> {
    return general.readAgentSystemPrompt(this.store);
  }

  writeAgentSystemPrompt(content: string): Promise<AgentSystemPromptFile> {
    return general.writeAgentSystemPrompt(this.store, content);
  }

  /** Compatibility API for the current key modal; all LLM providers share the v2 connection path. */
  setProviderKey(provider: SecretProviderId, apiKey: string): Promise<{ ok: boolean; error?: string }> {
    return providers.setProviderKey(this.store, provider, apiKey);
  }

  clearProviderKey(provider: SecretProviderId): Promise<{ ok: boolean }> {
    return providers.clearProviderKey(this.store, provider);
  }

  getSearchUsage(): Promise<SearchUsageResult> {
    return search.getSearchUsage(this.store);
  }

  getSpeechSettings(): SpeechSettings {
    return media.getSpeechSettings(this.store);
  }

  /** Main-only credential boundary. */
  getStoredKey(provider: PersistedSecretProviderId): string | undefined {
    return this.store.getStoredKey(provider);
  }
}
