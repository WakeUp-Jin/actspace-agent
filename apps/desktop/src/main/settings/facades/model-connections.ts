/** 设置 › 模型 的连接写入：Key 和 models 补丁在同一次排队写入里完成，失败时一起回滚。 */
import type { LlmProviderId, SettingsV4Models } from "@actspace/shared";
import type { SettingsStore } from "../store";
import { ProviderSettingsError } from "../types";
import { cloneJson } from "../utils";
import * as general from "./general";

export type ConnectionSecretChange = {
  readonly connectionId: string;
  readonly providerId: LlmProviderId;
  /** null = 删除这个连接的 Key（内置连接同时删掉 OpenRouter 管理 Key）。 */
  readonly apiKey?: string | null;
  /** 只有 OpenRouter 内置连接：null = 删除。 */
  readonly managementKey?: string | null;
};

const isDefaultConnection = (connectionId: string, providerId: LlmProviderId) => connectionId === `${providerId}:default`;

export function hasConnectionKey(store: SettingsStore, connectionId: string, providerId: LlmProviderId): boolean {
  return Boolean(isDefaultConnection(connectionId, providerId) ? store.getStoredKey(providerId) : store.secrets.providerCredentials[`connection:${connectionId}`]);
}

export function hasManagementKey(store: SettingsStore): boolean {
  return Boolean(store.getStoredKey("openrouter-management"));
}

/** build 拿到当前的 models，返回要合并的补丁；connections 里的 null 表示删除。 */
export async function applyModelsChange(
  store: SettingsStore,
  build: (models: SettingsV4Models) => Partial<SettingsV4Models>,
  secret?: ConnectionSecretChange,
): Promise<void> {
  await store.enqueueMutation(async () => {
    const previousSecrets = cloneJson(store.secrets);
    let secretsWritten = false;
    try {
      if (secret && (secret.apiKey !== undefined || secret.managementKey !== undefined)) {
        store.assertCredentialStorageWritable();
        const isDefault = isDefaultConnection(secret.connectionId, secret.providerId);
        if (secret.apiKey !== undefined) {
          const value = secret.apiKey?.trim();
          if (secret.apiKey !== null && !value) throw new ProviderSettingsError("请输入 API Key。", "invalid_api_key");
          if (isDefault) {
            if (value) store.secrets[secret.providerId] = value;
            else delete store.secrets[secret.providerId];
            if (!value && secret.providerId === "openrouter") delete store.secrets["openrouter-management"];
          } else if (value) store.secrets.providerCredentials[`connection:${secret.connectionId}`] = value;
          else delete store.secrets.providerCredentials[`connection:${secret.connectionId}`];
        }
        if (secret.managementKey !== undefined && isDefault && secret.providerId === "openrouter") {
          const value = secret.managementKey?.trim();
          if (value) store.secrets["openrouter-management"] = value;
          else delete store.secrets["openrouter-management"];
        }
        await store.writeSecretsFile();
        secretsWritten = true;
      }
      const current = store.getV4();
      await general.applyNamespaceV4(store, {
        namespace: "models",
        expectedRevision: current.revision,
        patch: build(cloneJson(current.settings.models)),
      });
    } catch (error) {
      if (secretsWritten) {
        store.secrets = previousSecrets;
        await store.writeSecretsFile().catch(() => undefined);
      }
      throw error;
    }
  });
}
