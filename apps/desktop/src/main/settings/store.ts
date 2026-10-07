/** settings 的内存状态和落盘：读写 settings.json / secrets.json、legacy 迁移、写入失败时的回滚、串行队列、变更通知，以及写 env 的入口。 */
import { chmod, readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  LlmProviderId,
  SettingsV4,
  SettingsV4ChangedNotification,
  SettingsV4Namespace,
  SettingsV4Snapshot,
} from "@actspace/shared";
import { writeBackupOnce, writeJsonAtomic, writeSettingsV2Backup, writeSettingsV3Backup } from "./atomic-io";
import { ALL_SETTINGS_V4_NAMESPACES, SECRETS_FILE, SETTINGS_FILE, SETTINGS_V1_BACKUP_FILE } from "./constants";
import { blockingSettings, defaultSettingsFromEnv, defaultSettingsV4Metadata } from "./defaults";
import { applyToEnv as applySettingsToEnv } from "./env";
import {
  hasRemovedDuckCodingSettings,
  hasRequiredSettingsSections,
  mergePersistedSettingsV3,
  metadataFromSettingsV3,
  migrateV1Settings,
  parseSettingsV4,
  toSettingsV4,
} from "./migrations";
import {
  emptySecrets,
  isProviderCredentialSecretId,
  parseSecretsV1,
  parseSecretsV2,
  providerCredentialSecretId,
  secretEntries,
  unavailableSecrets,
} from "./secrets-file";
import { ensureSystemPromptFile } from "./system-prompt-file";
import {
  type AtomicJsonWriter,
  type CredentialStorageIssue,
  type PersistedSecretProviderId,
  type PersistedSecrets,
  type PersistedSecretsV1,
  type PersistedSettingsV3,
  ProviderSettingsError,
  type ReadSecretsResult,
  type ReadSettingsResult,
  type SecretCrypto,
  type SettingsServiceOptions,
  type SettingsV4ChangeListener,
  type SettingsV4Metadata,
} from "./types";
import { isNotFoundError, isRecord } from "./utils";

export function computeSettingsRevision(settings: SettingsV4): string {
  return createHash("sha256").update(JSON.stringify(settings)).digest("hex");
}

export class SettingsStore {
  readonly dataRoot: string;
  readonly crypto: SecretCrypto;
  readonly reloadEnv: () => void;
  readonly writeJson: AtomicJsonWriter;
  readonly createCredentialId: () => string;

  settings: PersistedSettingsV3;
  v4Metadata: SettingsV4Metadata;
  secrets: PersistedSecrets = emptySecrets();
  credentialStorageIssue?: CredentialStorageIssue;
  private mutationTail: Promise<void> = Promise.resolve();
  lastLoadError?: string;
  readonly v4ChangeListeners = new Set<SettingsV4ChangeListener>();

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

  /** Main-only credential boundary. */
  getStoredKey(provider: PersistedSecretProviderId): string | undefined {
    return this.secrets[provider];
  }

  getStoredProviderCredential(provider: LlmProviderId, credentialId: string): string | undefined {
    return this.secrets.providerCredentials[providerCredentialSecretId(provider, credentialId)];
  }

  /** 写 env 的唯一入口；调用点和拆分前相同。 */
  applyToEnv(): void {
    applySettingsToEnv(this.settings, this.secrets, this.reloadEnv);
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

  async writeSettingsFile(changedNamespaces: SettingsV4Namespace[] = ALL_SETTINGS_V4_NAMESPACES): Promise<void> {
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

  async writeSecretsFile(): Promise<void> {
    this.assertCredentialStorageWritable();
    const filePath = join(this.dataRoot, SECRETS_FILE);
    await this.writeJson(filePath, this.secrets, { mode: 0o600 });
    await chmod(filePath, 0o600);
  }

  async restoreFilesBestEffort(settings: PersistedSettingsV3, secrets: PersistedSecrets): Promise<void> {
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

  assertCredentialStorageWritable(): void {
    if (!this.credentialStorageIssue) return;
    throw new ProviderSettingsError(this.credentialStorageIssue.message, "secret_storage_unavailable");
  }

  async ensureAgentSystemPromptFile(legacySystemPrompt?: string): Promise<void> {
    await ensureSystemPromptFile(this.settings.agent.systemPromptPath, legacySystemPrompt);
  }

  enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.mutationTail.then(operation, operation);
    this.mutationTail = run.then(() => undefined, () => undefined);
    return run;
  }
}
