import {
  buildLLMConfigFromRuntime,
  type LLMConfig,
  type ProviderRuntimeConfig,
} from "@actspace/agent-core";
import {
  DEFAULT_MODEL_KEY,
  normalizeModelKey,
  resolveConfiguredModel,
  type ModelDefinition,
  type ModelKey,
  type ModelPurpose,
  type UsableModel,
  type UsableModelView,
} from "@actspace/shared";
import type { ModelStoreService } from "./model-store-service";
import type { ProviderRuntimeError, SettingsService } from "./settings-service";

export interface ResolvedRuntimeModel {
  key: ModelKey;
  definition: ModelDefinition;
  providerRuntime: ProviderRuntimeConfig;
  llmConfig: LLMConfig;
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
    disabledTools: string[];
    hasKimiKey: boolean;
    imageGeneration?: { apiKey: string; baseUrl: string; model: string };
  } {
    const settings = this.settings.getV2();
    const imageGeneration = this.settings.getImageGenerationRuntimeConfig();
    return {
      hasWebSearchKey: Object.values(settings.searchProviders).some((provider) => provider.hasApiKey),
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

  resolveKairosModel(): RuntimeModelResolution {
    const configured = this.settings.getModelStorageState().kairos.modelId;
    if (!configured) {
      return { ok: false, code: "model_unavailable", message: "Kairos 尚未选择可用模型。", reason: "not_configured" };
    }
    return this.resolve(configured, "kairos", "configured");
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
    const runtime = this.settings.getProviderRuntimeConfig(model.definition.provider);
    if ("code" in runtime) {
      return { ok: false, code: runtime.code, message: runtime.message, modelKey: model.key };
    }
    const agentSettings = this.settings.getV2().agent;
    return {
      ok: true,
      model: {
        key: model.key,
        definition: model.definition,
        providerRuntime: runtime,
        llmConfig: buildLLMConfigFromRuntime(model.definition, runtime, {
          ...(agentSettings.temperature !== null && { temperature: agentSettings.temperature }),
          ...(agentSettings.maxTokens !== null && { maxTokens: agentSettings.maxTokens }),
        }),
        source,
      },
    };
  }
}
