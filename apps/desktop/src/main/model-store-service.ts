import {
  BUILTIN_MODEL_LIST,
  deepSeekModelDefinition,
  CURATED_OPENROUTER_MODEL_LIST,
  listUsableModels,
  resolveConfiguredModel,
  type InstalledModelSettings,
  type InstalledModelView,
  type ModelKey,
  type ModelPurpose,
  type ModelSnapshot,
  type UsableModelView,
  applyEffectiveToDefinition,
  providerFactsOf,
  resolveEffectiveModel,
  templateForConnection,
  type ModelCatalogSnapshot,
} from "@actspace/shared";
import { BUILTIN_MODEL_CATALOG } from "@actspace/shared/model-catalog-data";
import type { SettingsService } from "./settings-service";

const PURPOSES: readonly ModelPurpose[] = ["chat", "utility", "explore", "vision"];

export interface ModelStoreServiceOptions {
  settings: SettingsService;
  /** 模型目录快照（会联网刷新）；缺省用内置快照。 */
  catalog?: () => ModelCatalogSnapshot;
  now?: () => Date;
}

export class ModelStoreService {
  private readonly settings: SettingsService;
  private readonly now: () => Date;
  readonly catalog: () => ModelCatalogSnapshot;

  constructor(options: ModelStoreServiceOptions) {
    this.settings = options.settings;
    this.catalog = options.catalog ?? (() => BUILTIN_MODEL_CATALOG);
    this.now = options.now ?? (() => new Date());
  }

  getModelSnapshot(): ModelSnapshot {
    const view = this.settings.getV2();
    const stored = this.settings.getModelStorageState();
    const connections = this.settings.getV4().settings.models.connections;
    const catalog = this.catalog();
    // 每个字段的有效值在这里算一次（用户 > 服务商 > 目录），运行时、对话框、设置页都读这一份。
    const definitions = Object.fromEntries(
      [...BUILTIN_MODEL_LIST, ...CURATED_OPENROUTER_MODEL_LIST, ...Object.values(stored.customModels).filter(isDefined)]
        .map((original) => {
          const definition = original.provider === "deepseek" && original.source === "builtin" ? deepSeekModelDefinition(original.apiModel, this.now().toISOString()) ?? original : original;
          const connectionId = stored.installedModels[definition.key]?.connectionId ?? `${definition.provider}:default`;
          const connection = connections[connectionId];
          const protocol = connection && connectionId !== `${definition.provider}:default` ? connection.protocol ?? "openai-completions" : definition.api;
          const template = templateForConnection(connection ?? { connectionId, providerId: definition.provider });
          const effective = resolveEffectiveModel({
            apiModel: definition.apiModel,
            protocol,
            catalog,
            catalogProvider: template.catalogProvider,
            providerFacts: providerFactsOf(definition),
            overrides: stored.modelOverrides[definition.key],
            multiplier: connection?.defaultPricingMultiplier ?? 1,
          });
          return [definition.key, clone(applyEffectiveToDefinition(definition, effective, protocol))];
        }),
    ) as ModelSnapshot["definitions"];
    return {
      connections: Object.fromEntries(Object.values(connections).filter((connection) => connection.connectionId !== `${connection.providerId}:default`).map((connection) => [connection.connectionId, {
        providerId: connection.providerId,
        displayName: connection.displayName,
        enabled: connection.enabled,
        hasApiKey: !("code" in this.settings.getConnectionRuntimeConfig(connection.providerId, connection.connectionId)),
        lastConnection: connection.lastConnection,
      }])),
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
    const snapshot = this.getModelSnapshot();
    return listUsableModels(snapshot, purpose).map(({ key, definition, installed }) => ({
      key,
      label: definition.label,
      provider: definition.provider,
      apiModel: definition.apiModel,
      ...(installed.connectionId && installed.connectionId !== `${definition.provider}:default`
        ? {
            connectionId: installed.connectionId,
            connectionLabel: snapshot.connections?.[installed.connectionId]?.displayName ?? installed.connectionId,
          }
        : {}),
      contextWindow: definition.contextWindow,
      thinkingDefault: definition.thinkingDefault,
      capabilities: clone(definition.capabilities),
      ...(definition.pricing && { pricing: clone(definition.pricing) }),
    }));
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

}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
