/** secrets.json 的解析和凭据 secret id 格式：纯函数，不读写文件。 */
import { PROVIDER_IDS, type CredentialStorageIssueCode } from "@actspace/shared";
import { ALL_SECRET_PROVIDER_IDS } from "./constants";
import type { PersistedSecrets, PersistedSecretsV1, ReadSecretsResult } from "./types";
import { isRecord } from "./utils";

export function emptySecrets(): PersistedSecrets {
  return { version: 2, providerCredentials: {} };
}

export function unavailableSecrets(code: CredentialStorageIssueCode, message: string): ReadSecretsResult {
  return { secrets: emptySecrets(), source: "unavailable", issue: { code, message } };
}

export function parseSecretsV1(value: Record<string, unknown>): { secrets: PersistedSecretsV1; legacyProviderRemoved: boolean } | undefined {
  const parsed = parseSecretFields(value, true);
  return parsed ? { secrets: { version: 1, ...parsed.secrets }, legacyProviderRemoved: parsed.legacyProviderRemoved } : undefined;
}

export function parseSecretsV2(value: Record<string, unknown>): { secrets: PersistedSecrets; legacyProviderRemoved: boolean } | undefined {
  const parsed = parseSecretFields(value, false);
  return parsed ? { secrets: { version: 2, ...parsed.secrets }, legacyProviderRemoved: parsed.legacyProviderRemoved } : undefined;
}

export type ParsedSecretFields = {
  secrets: Omit<PersistedSecrets, "version">;
  legacyProviderRemoved: boolean;
};

export function parseSecretFields(
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
    if (typeof secret !== "string" || secret.length === 0) return undefined;
    if (isRemovedExtraKeyId(id)) continue;
    if (!isProviderCredentialSecretId(id)) return undefined;
    parsed.providerCredentials[id] = secret;
  }
  return { secrets: parsed, legacyProviderRemoved };
}

export function secretEntries(secrets: PersistedSecretsV1): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const id of ALL_SECRET_PROVIDER_IDS) {
    const secret = secrets[id];
    if (secret) entries.push([id, secret]);
  }
  entries.push(...Object.entries(secrets.providerCredentials));
  return entries;
}

export function isValidCredentialId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

/** 连接 Key 的 secret id：`connection:<连接标识>`。 */
export function isProviderCredentialSecretId(value: string): boolean {
  return value.startsWith("connection:") && /^[a-zA-Z0-9._-]{3,80}$/.test(value.slice("connection:".length));
}

/** 多 Key 已删除：旧的 `<provider>:<credentialId>` 额外 Key 读取时静默丢弃。 */
function isRemovedExtraKeyId(value: string): boolean {
  const separator = value.indexOf(":");
  if (separator <= 0 || value.indexOf(":", separator + 1) !== -1) return false;
  return (PROVIDER_IDS as readonly string[]).includes(value.slice(0, separator)) && isValidCredentialId(value.slice(separator + 1));
}
