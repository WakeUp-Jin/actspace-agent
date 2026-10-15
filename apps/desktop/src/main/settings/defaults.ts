/** settings 的默认值：没有 settings 文件或文件不能用时的内存结构，部分字段从 env 读取。 */
import { DEFAULT_SPEECH_SETTINGS } from "@actspace/shared";
import { join } from "node:path";
import {
  BUILTIN_MODEL_LIST,
  DEFAULT_IMAGE_GENERATION_BASE_URL,
  DEFAULT_IMAGE_GENERATION_MODEL,
  DEFAULT_IMAGE_INSPECTION_MODEL_KEY,
  DEFAULT_QUICK_OPEN_ACCELERATOR,
  PROVIDER_IDS,
  SEARCH_PROVIDER_IDS,
  type InstalledModelSettings,
  type ModelKey,
  type ProviderConnectionSettings,
} from "@actspace/shared";
import {
  BUILTIN_MODEL_ADDED_AT,
  LLM_MAX_TOKENS_DEFAULT,
  LLM_TEMPERATURE_DEFAULT,
  MAIN_AGENT_PROMPT_FILE,
  PROMPTS_DIR,
} from "./constants";
import { normalizeImageGenerationBaseUrl, normalizeImageGenerationModel } from "./sanitize";
import type { PersistedSettingsV3, ReadSettingsResult, SettingsV4Metadata } from "./types";

export function defaultProviderSettings(): ProviderConnectionSettings {
  return {
    enabled: true,
    baseUrl: null,
    proxy: { enabled: false, url: null },
    lastConnection: { status: "untested" },
    defaultPricingMultiplier: 1,
    additionalCredentials: [],
  };
}

export function defaultInstalledModels(): Partial<Record<ModelKey, InstalledModelSettings>> {
  return Object.fromEntries(BUILTIN_MODEL_LIST.map((definition) => [
    definition.key,
    { enabled: true, addedAt: BUILTIN_MODEL_ADDED_AT },
  ])) as Partial<Record<ModelKey, InstalledModelSettings>>;
}

export function defaultSettingsFromEnv(dataRoot: string): PersistedSettingsV3 {
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

export function defaultSettingsV4Metadata(): SettingsV4Metadata {
  return {
    speech: { ...DEFAULT_SPEECH_SETTINGS },
    models: {
      connections: {},
      definitions: {},
      installed: {},
      taskBindings: { defaultChat: null, utility: null, explore: null },
    },
    general: {
      performanceMonitoring: false,
      showTurnCodeChanges: true,
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

export function safeImageGenerationDefaults(baseUrl: string, model: string): PersistedSettingsV3["imageGeneration"] {
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

export function blockingSettings(dataRoot: string, message: string): ReadSettingsResult {
  return {
    settings: defaultSettingsFromEnv(dataRoot),
    v4Metadata: defaultSettingsV4Metadata(),
    source: "invalid",
    warning: message,
    blockingError: message,
  };
}

export function defaultSystemPromptPath(dataRoot: string): string {
  return join(dataRoot, PROMPTS_DIR, MAIN_AGENT_PROMPT_FILE);
}
