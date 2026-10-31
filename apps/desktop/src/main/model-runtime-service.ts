import { BUILTIN_MODEL_CATALOG } from "@actspace/shared/model-catalog-data";
import { resolveModelPricing, type ModelCatalogSnapshot } from "@actspace/shared";
import { customConnectionPricingInput, type DesktopRuntimeV2ResolvedModel } from "./runtime-v2/model-port";
import {
  DEFAULT_MODEL_KEY,
  listUsableModels,
  normalizeModelKey,
  resolveConfiguredModel,
  type ModelDefinition,
  type ModelKey,
  type ModelPurpose,
  type PurposeId,
  type ThinkingLevel,
  type UsableModel,
  type UsableModelView,
} from "@actspace/shared";
import type { ModelStoreService } from "./model-store-service";
import type { ProviderRuntimeError, SettingsService } from "./settings-service";

type ProviderRuntimeConfig = {
  readonly provider: string;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly pricingMultiplier?: number;
  readonly promptCacheMode?: import("@actspace/shared").CustomConnectionPromptCacheMode;
  readonly authScheme?: import("@actspace/shared").CustomConnectionResolvedAuth;
  readonly transport?: { readonly proxyUrl: string };
};
type LegacyLlmConfig = {
  readonly model: string;
  readonly apiKey: string;
  readonly baseUrl: string;
};

export interface ResolvedRuntimeModel {
  key: ModelKey;
  connectionId?: string;
  definition: ModelDefinition;
  providerRuntime: ProviderRuntimeConfig;
  llmConfig: LegacyLlmConfig;
  source: "requested" | "configured" | "default" | "fallback";
  fallbackReason?: string;
}

export type RuntimeModelResolution =
  | { ok: true; model: ResolvedRuntimeModel }
  | { ok: false; code: "model_unavailable" | ProviderRuntimeError["code"]; message: string; modelKey?: ModelKey; reason?: string };

export class ModelRuntimeService {
  constructor(
    private readonly settings: SettingsService,
    private readonly models: ModelStoreService,
    private readonly catalog: () => ModelCatalogSnapshot = () => BUILTIN_MODEL_CATALOG,
  ) {}

  resolvePricing(model: DesktopRuntimeV2ResolvedModel, apiModel: string) {
    return resolveModelPricing(this.catalog(), customConnectionPricingInput(model, apiModel));
  }

  listUsableModels(purpose: ModelPurpose): UsableModelView[] {
    return this.models.listUsableModels(purpose);
  }

  getToolEnvironment(): {
    hasWebSearchKey: boolean;
    deepseekFetchApiKey?: string;
    searchCredentials: Partial<Record<"zhipu" | "tavily" | "tinyfish" | "exa" | "deepseek", string>>;
    disabledTools: string[];
    hasKimiKey: boolean;
    imageGeneration?: { apiKey: string; baseUrl: string; model: string };
  } {
    const settings = this.settings.getV2();
    const imageGeneration = this.settings.getImageGenerationRuntimeConfig();
    const tools = this.settings.getV4().settings.tools;
    const deepseekKey = this.settings.getStoredKey("deepseek");
    const searchCredentials = tools.disabledTools.includes("web_search") ? {} : Object.fromEntries(
      (["zhipu", "tavily", "tinyfish", "exa", "deepseek"] as const).flatMap((provider) => {
        const enabled = tools.searchProviders[provider]?.enabled ?? (provider !== "deepseek");
        const key = enabled ? this.settings.getStoredKey(provider) : undefined;
        return key ? [[provider, key] as const] : [];
      }),
    );
    return {
      hasWebSearchKey: Object.keys(searchCredentials).length > 0,
      searchCredentials,
      ...(tools.deepseekFetchEnabled === true && deepseekKey ? { deepseekFetchApiKey: deepseekKey } : {}),
      disabledTools: [...settings.agent.disabledTools],
      hasKimiKey: settings.providers.kimi.hasApiKey,
      ...(imageGeneration && { imageGeneration }),
    };
  }

  resolveMainModel(requested?: string | null): RuntimeModelResolution {
    const taskModels = this.settings.getModelStorageState().taskModels;
    const requestedKey = requested === null || requested === undefined ? undefined : normalizeModelKey(requested);
    if (requested !== null && requested !== undefined && !requestedKey) {
      return { ok: false, code: "model_unavailable", message: "请求的模型标识无效。" };
    }
    const key = requestedKey ?? taskModels.defaultChatModel ?? DEFAULT_MODEL_KEY;
    return this.resolve(key, "chat", requestedKey ? "requested" : taskModels.defaultChatModel ? "configured" : "default");
  }

  resolveUtilityModel(main: ResolvedRuntimeModel): RuntimeModelResolution {
    const configured = this.settings.getModelStorageState().taskModels.utilityModel;
    if (configured) {
      const resolution = this.resolve(configured, "utility", "configured");
      if ("model" in resolution) return resolution;
      return { ok: true, model: { ...main, source: "fallback", fallbackReason: `utility_to_main:${resolution.reason ?? resolution.code}` } };
    }
    return { ok: true, model: { ...main, source: "fallback", fallbackReason: "utility_to_main:not_configured" } };
  }

  resolveAutoReviewModel(requestedMain?: string | null): RuntimeModelResolution {
    const configured = this.settings.getModelStorageState().taskModels.autoReviewModel;
    return configured ? this.resolve(configured, "utility", "configured") : this.resolveMainModel(requestedMain);
  }

  resolveUtilityTaskModel(requestedMain?: string | null): RuntimeModelResolution {
    const configured = this.settings.getModelStorageState().taskModels.utilityModel;
    if (configured) {
      const utility = this.resolve(configured, "utility", "configured");
      if (utility.ok) return utility;
    }
    const main = this.resolveMainModel(requestedMain);
    return main.ok ? this.resolveUtilityModel(main.model) : main;
  }

  resolveExploreModel(main: ResolvedRuntimeModel): RuntimeModelResolution {
    const configured = this.settings.getModelStorageState().taskModels.exploreModel;
    if (configured) {
      const resolution = this.resolve(configured, "explore", "configured");
      if ("model" in resolution) return resolution;
      return { ok: true, model: { ...main, source: "fallback", fallbackReason: `explore_to_main:${resolution.reason ?? resolution.code}` } };
    }
    return { ok: true, model: { ...main, source: "fallback", fallbackReason: "explore_to_main:not_configured" } };
  }

  /** 子 Agent 探索：用途表里设了就用，否则跟随会话模型。 */
  resolveExploreTaskModel(requestedMain?: string | null): RuntimeModelResolution {
    const main = this.resolveMainModel(requestedMain);
    return main.ok ? this.resolveExploreModel(main.model) : main;
  }

  /** 看图：用途表里的模型 → 会话默认模型（能看图时）→ 第一个能看图的可用模型。 */
  resolveImageInspectionModel(): RuntimeModelResolution {
    const taskModels = this.settings.getModelStorageState().taskModels;
    if (taskModels.visionModel) return this.resolve(taskModels.visionModel, "vision", "configured");
    const snapshot = this.models.getModelSnapshot();
    const chat = resolveConfiguredModel(snapshot, taskModels.defaultChatModel ?? DEFAULT_MODEL_KEY, "vision");
    if (chat.ok) return this.fromUsable(chat.model, "fallback");
    const first = listUsableModels(snapshot, "vision")[0];
    if (first) return this.fromUsable(first, "fallback");
    return { ok: false, code: "model_unavailable", message: "没有可用的看图模型，请在设置 › 模型的用途里选一个能看图的模型。" };
  }

  /** 用途表里的思考档位；null = 用模型默认档位。会话默认的档位由对话框决定，这里不读。 */
  purposeThinking(purpose: Exclude<PurposeId, "chat">): ThinkingLevel | null {
    return this.settings.getModelStorageState().taskModels.thinking?.[purpose] ?? null;
  }

  private resolve(key: ModelKey, purpose: ModelPurpose, source: ResolvedRuntimeModel["source"]): RuntimeModelResolution {
    const resolution = resolveConfiguredModel(this.models.getModelSnapshot(), key, purpose);
    if (!resolution.ok) {
      const reason = "reason" in resolution ? resolution.reason : "model_missing";
      return { ok: false, code: "model_unavailable", message: `模型当前不可用：${reason}。`, modelKey: key, reason };
    }
    return this.fromUsable(resolution.model, source);
  }

  private fromUsable(model: UsableModel, source: ResolvedRuntimeModel["source"]): RuntimeModelResolution {
    const runtime = this.settings.getConnectionRuntimeConfig(model.definition.provider, model.installed.connectionId);
    if ("code" in runtime) {
      return { ok: false, code: runtime.code, message: runtime.message, modelKey: model.key };
    }
    // 快照里的价格已经按倍率算好（手填价不乘），这里不再处理价格。
    const definition = runtime.protocol ? { ...model.definition, api: runtime.protocol } : model.definition;
    return {
      ok: true,
      model: {
        key: model.key,
        ...(model.installed.connectionId ? { connectionId: model.installed.connectionId } : {}),
        definition,
        providerRuntime: runtime,
        llmConfig: toLegacyLlmConfig(definition.apiModel, runtime),
        source,
      },
    };
  }
}

function toLegacyLlmConfig(model: string, runtime: ProviderRuntimeConfig): LegacyLlmConfig {
  return { model, apiKey: runtime.apiKey, baseUrl: runtime.baseUrl };
}
