/** settings 的常量：文件名、默认值、namespace 和 secret id 列表、搜索 key 对应的 env 名。 */
import { PROVIDER_IDS, SEARCH_PROVIDER_IDS, type SettingsV4Namespace } from "@actspace/shared";
import type { PersistedSecretProviderId } from "./types";

export const MAIN_AGENT_SYSTEM_PROMPT = "You are ActSpace's main agent. Follow the active tool and safety policies.";

export const LLM_TEMPERATURE_DEFAULT = 0;
export const LLM_MAX_TOKENS_DEFAULT = 8192;
export const AGENT_SYSTEM_PROMPT_MAX_CHARS = 20_000;
export const PROMPTS_DIR = "prompts";
export const MAIN_AGENT_PROMPT_FILE = "main-agent.md";
export const SETTINGS_FILE = "settings.json";
export const SETTINGS_V1_BACKUP_FILE = "settings.v1.backup.json";
export const SETTINGS_V2_BACKUP_FILE = "settings.v2.backup.json";
export const SETTINGS_V2_BACKUP_DIGEST_FILE = "settings.v2.backup.sha256";
export const SETTINGS_V3_BACKUP_FILE = "settings.v3.backup.json";
export const SETTINGS_V3_BACKUP_DIGEST_FILE = "settings.v3.backup.sha256";
export const SECRETS_FILE = "secrets.json";
export const BUILTIN_MODEL_ADDED_AT = "2026-07-24T00:00:00.000Z";

export const ALL_SETTINGS_V4_NAMESPACES: SettingsV4Namespace[] = [
  "general",
  "models",
  "tools",
  "media",
  "skills",
  "subagents",
  "activity",
];

export const ALL_SECRET_PROVIDER_IDS: readonly PersistedSecretProviderId[] = [
  ...PROVIDER_IDS,
  ...SEARCH_PROVIDER_IDS.filter((id) => id !== "deepseek"),
  "openrouter-management",
  "image-generation",
  "speech-minimax",
];

export const SEARCH_PROVIDER_ENV_KEYS = {
  zhipu: "ZHIPU_API_KEY",
  tavily: "TAVILY_API_KEY",
  tinyfish: "TINYFISH_API_KEY",
  exa: "EXA_API_KEY",
} as const;
