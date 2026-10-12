/** settings 旧版本迁移和 v4 解析：v1 / v2 / v3 → v4，v4 → 旧结构。冻结，最早支持 v1。 */
import { DEFAULT_SPEECH_SETTINGS } from "@actspace/shared";
import {
  LEGACY_MODEL_KEY_MAP,
  PROVIDER_IDS,
  SEARCH_PROVIDER_IDS,
  isProviderId,
  isConnectionProtocol,
  normalizeModelKey,
  type LlmProviderId,
  type SettingsV4,
  type SettingsV4InstalledModelSettings,
  type SettingsV4SubagentRoute,
} from "@actspace/shared";
import { BUILTIN_MODEL_ADDED_AT } from "./constants";
import { isCustomConnectionAuthMode, isResolvedAuth, resolvePromptCacheMode } from "./custom-connection";
import { defaultSettingsFromEnv, defaultSettingsV4Metadata } from "./defaults";
import {
  isModelId,
  modelKeyMigrationPriority,
  normalizeModelKeyOrNull,
  sanitizeAgentV2,
  sanitizeCustomModels,
  sanitizeImageGenerationSettings,
  sanitizeImageInspectionSettings,
  sanitizeInstalledModel,
  sanitizeInstalledModels,
  sanitizeNullableInteger,
  sanitizeNullableNumber,
  sanitizeNumber,
  sanitizeProviderSettings,
  sanitizeShortcuts,
  sanitizeSkills,
  sanitizeSpeechSettings,
  sanitizeSystemPromptPath,
  sanitizeTaskModels,
  sanitizeUsagePreferences,
} from "./sanitize";
import type { PersistedSettingsV3, ReadSettingsResult, SettingsV4Metadata } from "./types";
import { cloneJson, isRecord } from "./utils";

export function metadataFromSettingsV3(settings: PersistedSettingsV3): SettingsV4Metadata {
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

export function metadataFromSettingsV4(settings: SettingsV4): SettingsV4Metadata {
  return {
    speech: sanitizeSpeechSettings(settings.media.speech),
    models: cloneJson(settings.models),
    general: cloneJson(settings.general),
    tools: cloneJson(settings.tools),
    subagents: cloneJson(settings.subagents),
    activity: cloneJson(settings.activity),
  };
}

export function toSettingsV4(settings: PersistedSettingsV3, metadata: SettingsV4Metadata): SettingsV4 {
  const general = cloneJson(metadata.general);
  // Quick Open still mutates through the legacy facade. Persist the same
  // shortcut state returned to callers, rather than stale v4 metadata.
  general.shortcuts = cloneJson(settings.shortcuts);
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

export function legacySettingsFromV4(settings: SettingsV4, dataRoot: string): PersistedSettingsV3 {
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

export function parseSettingsV4(raw: Record<string, unknown>, dataRoot: string): {
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
      performanceMonitoring: general.performanceMonitoring === true,
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
          ...(value.defaultModel === null
            ? { defaultModel: null }
            : typeof value.defaultModel === "string"
              ? { defaultModel: value.defaultModel.slice(0, 200) }
              : {}),
          ...(typeof value.catalogId === "string" ? { catalogId: value.catalogId.slice(0, 80) } : {}),
          promptCacheMode: resolvePromptCacheMode(
            isConnectionProtocol(value.protocol) ? value.protocol : "openai-completions",
            value.promptCacheMode === "short" || value.promptCacheMode === "off" ? value.promptCacheMode : undefined,
          ),
          ...(isCustomConnectionAuthMode(value.authMode) ? { authMode: value.authMode } : {}),
          ...(value.authMode === "auto" && isResolvedAuth(value.resolvedAuth) ? { resolvedAuth: value.resolvedAuth } : {}),
          ...(value.billingMode === "reference" || value.billingMode === "token" || value.billingMode === "manual" ? { billingMode: value.billingMode } : {}),
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

export function migrateV1Settings(
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

export function mergePersistedSettingsV3(raw: Record<string, unknown>, dataRoot: string): PersistedSettingsV3 {
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

export function hasRemovedDuckCodingSettings(raw: Record<string, unknown>): boolean {
  const providers = isRecord(raw.providers) && Object.prototype.hasOwnProperty.call(raw.providers, "duckcoding");
  const modelKeys = [
    ...(isRecord(raw.installedModels) ? Object.keys(raw.installedModels) : []),
    ...(isRecord(raw.customModels) ? Object.keys(raw.customModels) : []),
  ];
  const taskModels = isRecord(raw.taskModels) ? Object.values(raw.taskModels) : [];
  return providers || modelKeys.some((key) => key.startsWith("duckcoding:")) ||
    taskModels.some((value) => typeof value === "string" && value.startsWith("duckcoding:"));
}

export function hasRequiredSettingsSections(raw: Record<string, unknown>): boolean {
  return ["providers", "installedModels", "customModels", "taskModels", "imageGeneration", "agent", "skills"]
    .every((key) => isRecord(raw[key]));
}
