/** 通用设置：v4 namespace patch、旧接口 update / updateV2、快捷打开、模型存储、给 renderer 的设置视图、加载和凭据存储状态、system prompt 读写。 */
import {
  type AgentSystemPromptFile,
  type AppSettings,
  type AppSettingsV2,
  BUILTIN_MODEL_LIST,
  type CredentialStorageView,
  isPublicModelId,
  LEGACY_MODEL_KEY_MAP,
  legacyModelIdFromKey,
  type ModelKey,
  normalizeModelKey,
  PROVIDER_IDS,
  type QuickOpenShortcutUpdateInput,
  type SettingsUpdateInput,
  type SettingsV2UpdateInput,
  type SettingsV4,
  type SettingsV4Models,
  type SettingsV4Snapshot,
  type SettingsV4UpdateInput,
} from "@actspace/shared";
import { parseSettingsV4 } from "../migrations";
import {
  isValidModelDefinition,
  redactProxyUrl,
  sanitizeAgentV2,
  sanitizeImageGenerationSettings,
  sanitizeImageInspectionSettings,
  sanitizeInstalledModel,
  sanitizeProviderSettings,
  sanitizeQuickOpenShortcut,
  sanitizeShortcuts,
  sanitizeSkills,
  sanitizeTaskModels,
} from "../sanitize";
import type { SettingsStore } from "../store";
import { readSystemPromptFile, writeSystemPromptFile } from "../system-prompt-file";
import { type ModelStorageMutationInput, type PersistedSettingsV3, SettingsRevisionConflictError } from "../types";
import { cloneJson, isDefined } from "../utils";
import * as media from "./media";

export async function updateNamespaceV4(store: SettingsStore, input: SettingsV4UpdateInput): Promise<SettingsV4Snapshot> {
  return store.enqueueMutation(() => applyNamespaceV4(store, input));
}

export async function applyNamespaceV4(store: SettingsStore, input: SettingsV4UpdateInput): Promise<SettingsV4Snapshot> {
    const current = store.getV4();
    if (input.expectedRevision !== current.revision) {
      throw new SettingsRevisionConflictError(current);
    }
    const previousSettings = cloneJson(store.settings);
    const previousMetadata = cloneJson(store.v4Metadata);
    try {
      const next = applySettingsV4NamespacePatch(current.settings, input);
      const normalized = parseSettingsV4(next as unknown as Record<string, unknown>, store.dataRoot);
      if (!normalized) throw new Error("Settings v4 patch is invalid.");
      store.settings = normalized.settings;
      store.v4Metadata = normalized.v4Metadata;
      await store.writeSettingsFile([input.namespace]);
      store.applyToEnv();
      return store.getV4();
    } catch (error) {
      store.settings = previousSettings;
      store.v4Metadata = previousMetadata;
      throw error;
    }
}

export function getLastLoadError(store: SettingsStore): string | undefined {
  return store.lastLoadError;
}

export function getCredentialStorageView(store: SettingsStore): CredentialStorageView {
  return store.credentialStorageIssue
    ? { status: "unavailable", ...store.credentialStorageIssue }
    : { status: "ready" };
}

/** Renderer transition view: v2 data plus deprecated v1 selection fields. */
export function get(store: SettingsStore): AppSettings {
  const v2 = getV2(store);
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
export function getV2(store: SettingsStore): AppSettingsV2 {
  const definitions = [...BUILTIN_MODEL_LIST, ...Object.values(store.settings.customModels).filter(isDefined)];
  const providers = Object.fromEntries(PROVIDER_IDS.map((provider) => {
    const providerModels = definitions.filter((definition) => definition.provider === provider);
    const installed = providerModels.filter((definition) => Boolean(store.settings.installedModels[definition.key]));
    const enabled = installed.filter((definition) => store.settings.installedModels[definition.key]?.enabled);
    const settings = store.settings.providers[provider];
    return [provider, {
      hasApiKey: Boolean(store.getStoredKey(provider)),
      ...(provider === "openrouter" && { hasManagementKey: Boolean(store.getStoredKey("openrouter-management")) }),
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
        hasApiKey: Boolean(store.getStoredProviderCredential(provider, credential.id)),
      })),
    }];
  })) as AppSettingsV2["providers"];

  return {
    version: 2,
    providers,
    installedModels: cloneJson(store.settings.installedModels),
    customModels: cloneJson(store.settings.customModels),
    taskModels: { ...store.settings.taskModels },
    searchProviders: {
      deepseek: { hasApiKey: Boolean(store.getStoredKey("deepseek")) },
      zhipu: { hasApiKey: Boolean(store.getStoredKey("zhipu")) },
      tavily: { hasApiKey: Boolean(store.getStoredKey("tavily")) },
      tinyfish: { hasApiKey: Boolean(store.getStoredKey("tinyfish")) },
      exa: { hasApiKey: Boolean(store.getStoredKey("exa")) },
    },
    imageGeneration: media.getImageGenerationSettingsView(store),
    imageInspection: { ...store.settings.imageInspection },
    agent: { ...store.settings.agent, disabledTools: [...store.settings.agent.disabledTools] },
    skills: { disabled: [...store.settings.skills.disabled] },
    shortcuts: cloneJson(store.settings.shortcuts),
  };
}

/** Main-only storage snapshot used by model services; never contains decrypted secrets. */
export function getModelStorageState(store: SettingsStore): Pick<PersistedSettingsV3, "installedModels" | "customModels" | "taskModels"> {
  return cloneJson({
    installedModels: store.settings.installedModels,
    customModels: store.settings.customModels,
    taskModels: store.settings.taskModels,
  });
}

export async function updateModelStorage(store: SettingsStore, input: ModelStorageMutationInput): Promise<void> {
  await store.enqueueMutation(async () => {
    const previous = cloneJson(store.settings);
    try {
      for (const [rawKey, value] of Object.entries(input.installedModels ?? {})) {
        const key = normalizeModelKey(rawKey);
        if (!key) continue;
        if (value === null) delete store.settings.installedModels[key];
        else store.settings.installedModels[key] = sanitizeInstalledModel(value, value);
      }
      for (const [rawKey, value] of Object.entries(input.customModels ?? {})) {
        const key = normalizeModelKey(rawKey);
        if (!key) continue;
        if (value === null) delete store.settings.customModels[key];
        else if (isValidModelDefinition(value, key)) store.settings.customModels[key] = cloneJson(value);
      }
      if (input.connections) {
        const current = store.getV4();
        await applyNamespaceV4(store, { namespace: "models", expectedRevision: current.revision, patch: { connections: input.connections } as Partial<SettingsV4Models> });
        return;
      }
      await store.writeSettingsFile();
    } catch (error) {
      store.settings = previous;
      throw error;
    }
  });
}

export async function update(store: SettingsStore, input: SettingsUpdateInput): Promise<AppSettings> {
  return store.enqueueMutation(async () => {
    const previous = cloneJson(store.settings);
    try {
      if (input.defaultModelId !== undefined) {
        store.settings.taskModels.defaultChatModel = isPublicModelId(input.defaultModelId)
          ? LEGACY_MODEL_KEY_MAP[input.defaultModelId]
          : null;
      }
      if (input.agent) {
        store.settings.agent = sanitizeAgentV2({ ...store.settings.agent, ...input.agent }, store.settings.agent);
        if (input.agent.exploreModelId !== undefined) {
          store.settings.taskModels.exploreModel = input.agent.exploreModelId && isPublicModelId(input.agent.exploreModelId)
            ? LEGACY_MODEL_KEY_MAP[input.agent.exploreModelId]
            : null;
        }
        await store.ensureAgentSystemPromptFile();
      }
      if (input.skills) {
        store.settings.skills = sanitizeSkills({ ...store.settings.skills, ...input.skills });
      }
      if (input.imageInspection) {
        store.settings.imageInspection = sanitizeImageInspectionSettings(input.imageInspection);
      }
      await store.writeSettingsFile();
      store.applyToEnv();
      return get(store);
    } catch (error) {
      store.settings = previous;
      throw error;
    }
  });
}

export async function updateV2(store: SettingsStore, input: SettingsV2UpdateInput): Promise<AppSettingsV2> {
  return store.enqueueMutation(async () => {
    const previous = cloneJson(store.settings);
    try {
      if (input.providers) {
        for (const provider of PROVIDER_IDS) {
          const patch = input.providers[provider];
          if (!patch) continue;
          store.settings.providers[provider] = sanitizeProviderSettings(
            { ...store.settings.providers[provider], ...patch, proxy: { ...store.settings.providers[provider].proxy, ...patch.proxy } },
            store.settings.providers[provider],
            provider,
          );
        }
      }
      if (input.installedModels) {
        for (const [rawKey, patch] of Object.entries(input.installedModels)) {
          const key = normalizeModelKey(rawKey);
          if (!key || !patch) continue;
          const current = store.settings.installedModels[key];
          if (!current) continue;
          store.settings.installedModels[key] = sanitizeInstalledModel({ ...current, ...patch }, current);
        }
      }
      if (input.customModels) {
        for (const [rawKey, definition] of Object.entries(input.customModels)) {
          const key = normalizeModelKey(rawKey);
          if (!key) continue;
          if (definition === null) delete store.settings.customModels[key];
          else if (isValidModelDefinition(definition, key)) store.settings.customModels[key] = cloneJson(definition);
        }
      }
      if (input.taskModels) {
        store.settings.taskModels = sanitizeTaskModels({ ...store.settings.taskModels, ...input.taskModels });
      }
      if (input.agent) {
        store.settings.agent = sanitizeAgentV2({ ...store.settings.agent, ...input.agent }, store.settings.agent);
      }
      if (input.skills) store.settings.skills = sanitizeSkills({ ...store.settings.skills, ...input.skills });
      if (input.imageGeneration) {
        store.settings.imageGeneration = sanitizeImageGenerationSettings({ ...store.settings.imageGeneration, ...input.imageGeneration }, store.settings.imageGeneration);
      }
      if (input.imageInspection) {
        store.settings.imageInspection = sanitizeImageInspectionSettings({ ...store.settings.imageInspection, ...input.imageInspection });
      }
      if (input.shortcuts) {
        store.settings.shortcuts = sanitizeShortcuts({ ...store.settings.shortcuts, ...input.shortcuts, quickOpen: { ...store.settings.shortcuts.quickOpen, ...input.shortcuts.quickOpen } });
      }
      await store.writeSettingsFile();
      store.applyToEnv();
      return getV2(store);
    } catch (error) {
      store.settings = previous;
      throw error;
    }
  });
}

export async function updateQuickOpenShortcut(store: SettingsStore, input: QuickOpenShortcutUpdateInput): Promise<AppSettings> {
  return store.enqueueMutation(async () => {
    const previous = cloneJson(store.settings);
    try {
      store.settings.shortcuts = {
        quickOpen: sanitizeQuickOpenShortcut({
          ...store.settings.shortcuts.quickOpen,
          ...input,
        }),
      };
      await store.writeSettingsFile();
      return get(store);
    } catch (error) {
      store.settings = previous;
      throw error;
    }
  });
}

export async function readAgentSystemPrompt(store: SettingsStore): Promise<AgentSystemPromptFile> {
  await store.ensureAgentSystemPromptFile();
  return readSystemPromptFile(store.settings.agent.systemPromptPath);
}

export async function writeAgentSystemPrompt(store: SettingsStore, content: string): Promise<AgentSystemPromptFile> {
  await store.ensureAgentSystemPromptFile();
  const nextContent = await writeSystemPromptFile(store.settings.agent.systemPromptPath, content);
  return { path: store.settings.agent.systemPromptPath, content: nextContent };
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
