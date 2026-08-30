import {
  DEFAULT_MODEL_KEY,
  normalizeModelKey,
  resolveConfiguredModel,
  resolveImageInspectionModel as resolveImageInspectionModelDefinition,
  type ModelDefinition,
  type ModelKey,
  type ModelPricing,
  type ModelPurpose,
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
  readonly transport?: { readonly proxyUrl: string };
};
type LegacyLlmConfig = {
  readonly model: string;
  readonly apiKey: string;
  readonly baseUrl: string;
};

export interface ResolvedRuntimeModel {
  key: ModelKey;
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
  ) {}

  listUsableModels(purpose: ModelPurpose): UsableModelView[] {
    return this.models.listUsableModels(purpose);
  }

  getToolEnvironment(): {
    hasWebSearchKey: boolean;
    searchCredentials: Partial<Record<"zhipu" | "tavily" | "tinyfish" | "exa", string>>;
    disabledTools: string[];
    hasKimiKey: boolean;
    imageGeneration?: { apiKey: string; baseUrl: string; model: string };
  } {
    const settings = this.settings.getV2();
    const imageGeneration = this.settings.getImageGenerationRuntimeConfig();
    return {
      hasWebSearchKey: Object.values(settings.searchProviders).some((provider) => provider.hasApiKey),
      searchCredentials: Object.fromEntries(
        (["zhipu", "tavily", "tinyfish", "exa"] as const).flatMap((provider) => {
          const key = this.settings.getStoredKey(provider);
          return key ? [[provider, key] as const] : [];
        }),
      ),
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

  resolveExploreModel(main: ResolvedRuntimeModel): RuntimeModelResolution {
    const configured = this.settings.getModelStorageState().taskModels.exploreModel;
    if (configured) {
      const resolution = this.resolve(configured, "explore", "configured");
      if ("model" in resolution) return resolution;
      return { ok: true, model: { ...main, source: "fallback", fallbackReason: `explore_to_main:${resolution.reason ?? resolution.code}` } };
    }
    return { ok: true, model: { ...main, source: "fallback", fallbackReason: "explore_to_main:not_configured" } };
  }

  resolveImageInspectionModel(): RuntimeModelResolution {
    const configured = this.settings.getV2().imageInspection;
    const definition = resolveImageInspectionModelDefinition(configured.modelKey);
    const runtime = this.settings.getProviderRuntimeConfigForCredential(
      definition.provider,
      configured.credentialId,
    );
    if ("code" in runtime) {
      return { ok: false, code: runtime.code, message: runtime.message, modelKey: definition.key };
    }
    const pricedDefinition = applyPricingMultiplier(definition, runtime.pricingMultiplier ?? 1);
    return {
      ok: true,
      model: {
        key: pricedDefinition.key,
        definition: pricedDefinition,
        providerRuntime: runtime,
        llmConfig: toLegacyLlmConfig(pricedDefinition.apiModel, runtime),
        source: "configured",
      },
    };
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
    const runtime = this.settings.getProviderRuntimeConfigForCredential(
      model.definition.provider,
      model.installed.credentialId,
    );
    if ("code" in runtime) {
      return { ok: false, code: runtime.code, message: runtime.message, modelKey: model.key };
    }
    const definition = applyPricingMultiplier(model.definition, runtime.pricingMultiplier ?? 1);
    return {
      ok: true,
      model: {
        key: model.key,
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

function applyPricingMultiplier(definition: ModelDefinition, multiplier: number): ModelDefinition {
  if (!definition.pricing || multiplier === 1) return definition;
  return { ...definition, pricing: multiplyPricing(definition.pricing, multiplier) };
}

function multiplyPricing(pricing: ModelPricing, multiplier: number): ModelPricing {
  const multiply = (value: number): number => Number((value * multiplier).toFixed(8));
  return {
    currency: pricing.currency,
    inputCacheHitPerMillion: multiply(pricing.inputCacheHitPerMillion),
    inputCacheMissPerMillion: multiply(pricing.inputCacheMissPerMillion),
    ...(pricing.inputCacheWritePerMillion !== undefined && {
      inputCacheWritePerMillion: multiply(pricing.inputCacheWritePerMillion),
    }),
    outputPerMillion: multiply(pricing.outputPerMillion),
    ...(pricing.reasoningPerMillion !== undefined && {
      reasoningPerMillion: multiply(pricing.reasoningPerMillion),
    }),
  };
}
