import {
  BUILTIN_MODEL_LIST,
  CURATED_OPENROUTER_MODEL_LIST,
  listUsableModels,
  resolveConfiguredModel,
  type CatalogModelView,
  type InstalledModelSettings,
  type InstalledModelView,
  type ModelDefinition,
  type ModelKey,
  type ModelPurpose,
  type ModelSnapshot,
  type LlmProviderId,
  type UsableModelView,
} from "@actspace/shared";
import type { SettingsService } from "./settings-service";

const PURPOSES: readonly ModelPurpose[] = ["chat", "utility", "explore", "kairos", "vision"];

export type ModelStoreResult =
  | { ok: true; model?: InstalledModelView }
  | { ok: false; code: "invalid_provider" | "model_not_found" | "model_not_installed" | "model_not_removable" | "model_in_use"; message: string; references?: string[] };

export interface ModelStoreServiceOptions {
  settings: SettingsService;
  findCatalogModel?: (apiModel: string) => CatalogModelView | undefined;
  now?: () => Date;
}

export class ModelStoreService {
  private readonly settings: SettingsService;
  private readonly findCatalogModel: (apiModel: string) => CatalogModelView | undefined;
  private readonly now: () => Date;

  constructor(options: ModelStoreServiceOptions) {
    this.settings = options.settings;
    this.findCatalogModel = options.findCatalogModel ?? (() => undefined);
    this.now = options.now ?? (() => new Date());
  }

  getModelSnapshot(): ModelSnapshot {
    const view = this.settings.getV2();
    const stored = this.settings.getModelStorageState();
    const definitions = Object.fromEntries(
      [...BUILTIN_MODEL_LIST, ...CURATED_OPENROUTER_MODEL_LIST, ...Object.values(stored.customModels).filter(isDefined)]
        .map((definition) => [definition.key, clone(definition)]),
    ) as ModelSnapshot["definitions"];
    return {
      providers: Object.fromEntries(Object.entries(view.providers).map(([provider, state]) => [provider, {
        enabled: state.enabled ?? true,
        hasApiKey: state.hasApiKey,
        lastConnection: state.lastConnection ?? { status: "untested" },
      }])) as ModelSnapshot["providers"],
      definitions,
      installedModels: clone(stored.installedModels),
    };
  }

  listInstalledModels(): InstalledModelView[] {
    const snapshot = this.getModelSnapshot();
    return Object.entries(snapshot.installedModels)
      .map(([rawKey, settings]) => {
        const key = rawKey as ModelKey;
        const definition = snapshot.definitions[key];
        if (!definition || !settings) return undefined;
        const unavailableReasons: InstalledModelView["unavailableReasons"] = {};
        for (const purpose of PURPOSES) {
          const resolution = resolveConfiguredModel(snapshot, key, purpose);
          if ("reason" in resolution) unavailableReasons[purpose] = resolution.reason;
        }
        return { definition: clone(definition), settings: clone(settings), unavailableReasons };
      })
      .filter(isDefined)
      .sort((left, right) => left.definition.label.localeCompare(right.definition.label));
  }

  listUsableModels(purpose: ModelPurpose): UsableModelView[] {
    return listUsableModels(this.getModelSnapshot(), purpose).map(({ key, definition }) => ({
      key,
      label: definition.label,
      provider: definition.provider,
      apiModel: definition.apiModel,
      contextWindow: definition.contextWindow,
      thinkingDefault: definition.thinkingDefault,
      capabilities: clone(definition.capabilities),
      ...(definition.pricing && { pricing: clone(definition.pricing) }),
    }));
  }

  isCatalogModelAdded(apiModel: string): boolean {
    const snapshot = this.getModelSnapshot();
    const key = `openrouter:${apiModel}` as ModelKey;
    return Boolean(snapshot.installedModels[key]);
  }

  async ensureCuratedModelsInstalled(): Promise<void> {
    const stored = this.settings.getModelStorageState();
    const additions: Partial<Record<ModelKey, InstalledModelSettings>> = {};
    for (const definition of CURATED_OPENROUTER_MODEL_LIST) {
      if (!stored.installedModels[definition.key]) {
        additions[definition.key] = { enabled: true, addedAt: this.now().toISOString() };
      }
    }
    if (Object.keys(additions).length > 0) await this.settings.updateModelStorage({ installedModels: additions });
  }

  async addCatalogModel(provider: LlmProviderId, apiModel: string): Promise<ModelStoreResult> {
    if (provider !== "openrouter") {
      return { ok: false, code: "invalid_provider", message: "首版只支持从 OpenRouter 目录添加模型。" };
    }
    const catalog = this.findCatalogModel(apiModel);
    if (!catalog) return { ok: false, code: "model_not_found", message: "目录中未找到该模型，请重新加载。" };
    const key = `openrouter:${catalog.apiModel}` as ModelKey;
    const stored = this.settings.getModelStorageState();
    const installed = stored.installedModels[key] ?? { enabled: true, addedAt: this.now().toISOString() };
    const definition = catalogToDefinition(catalog, this.now().toISOString());
    await this.settings.updateModelStorage({
      installedModels: { [key]: installed },
      customModels: { [key]: definition },
    });
    return { ok: true, model: this.listInstalledModels().find((item) => item.definition.key === key) };
  }

  async setModelEnabled(modelKey: ModelKey, enabled: boolean): Promise<ModelStoreResult> {
    const stored = this.settings.getModelStorageState();
    const current = stored.installedModels[modelKey];
    if (!current) return { ok: false, code: "model_not_installed", message: "模型尚未添加。" };
    await this.settings.updateModelStorage({ installedModels: { [modelKey]: { ...current, enabled } } });
    return { ok: true, model: this.listInstalledModels().find((item) => item.definition.key === modelKey) };
  }

  async removeModel(modelKey: ModelKey): Promise<ModelStoreResult> {
    const snapshot = this.getModelSnapshot();
    const definition = snapshot.definitions[modelKey];
    if (!definition) return { ok: false, code: "model_not_found", message: "模型不存在。" };
    if (definition.source === "builtin" || definition.source === "curated") {
      return { ok: false, code: "model_not_removable", message: "内置或精选模型只能停用，不能删除。" };
    }
    if (!snapshot.installedModels[modelKey]) {
      return { ok: false, code: "model_not_installed", message: "模型尚未添加。" };
    }
    const references = this.findReferences(modelKey);
    if (references.length > 0) {
      return { ok: false, code: "model_in_use", message: "模型仍被任务配置引用。", references };
    }
    await this.settings.updateModelStorage({
      installedModels: { [modelKey]: null },
      customModels: { [modelKey]: null },
    });
    return { ok: true };
  }

  private findReferences(modelKey: ModelKey): string[] {
    const stored = this.settings.getModelStorageState();
    const references: string[] = [];
    if (stored.taskModels.defaultChatModel === modelKey) references.push("defaultChatModel");
    if (stored.taskModels.utilityModel === modelKey) references.push("utilityModel");
    if (stored.taskModels.exploreModel === modelKey) references.push("exploreModel");
    if (stored.kairos.modelId === modelKey) references.push("kairosModel");
    return references;
  }
}

function catalogToDefinition(model: CatalogModelView, catalogUpdatedAt: string): ModelDefinition {
  return {
    key: `openrouter:${model.apiModel}`,
    provider: "openrouter",
    api: "openai-completions",
    apiModel: model.apiModel,
    label: model.name,
    source: "provider-catalog",
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    thinkingDefault: model.reasoning,
    capabilities: {
      input: [...model.input],
      toolUse: model.toolUse,
      reasoning: model.reasoning,
      thinkingToggle: model.reasoning,
    },
    ...(model.pricing && { pricing: clone(model.pricing) }),
    catalogUpdatedAt,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
