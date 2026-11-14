import { usableModelSummary, type ModelApi, type ModelsHostPort, type resolveModelPricing } from "@actspace/shared";

export type DesktopRuntimeResolvedModel = {
  readonly key: string;
  readonly connectionId?: string;
  readonly pricingSnapshot?: import("@actspace/shared").ModelPricingSnapshot | null;
  readonly definition: {
    readonly source?: import("@actspace/shared").ModelSource;
    readonly pricing?: import("@actspace/shared").ModelPricing;
    readonly api: ModelApi;
    readonly provider: string;
    readonly apiModel: string;
    readonly contextWindow: number | null;
    readonly maxTokens?: number | null;
    readonly thinkingDefault?: boolean;
    readonly requestModelByReasoningEffort?: Partial<Record<import("@actspace/shared").ModelReasoningEffort, string>>;
    readonly capabilities?: import("@actspace/shared").ModelCapabilities;
    readonly effective?: Pick<import("@actspace/shared").EffectiveModel, "sources" | "ratesUnsupported">;
  };
  readonly providerRuntime: {
    readonly apiKey?: string;
    readonly baseUrl?: string;
    readonly transport?: { readonly proxyUrl?: string };
    readonly pricingMultiplier?: number;
    readonly promptCacheMode?: import("@actspace/shared").CustomConnectionPromptCacheMode;
    readonly authScheme?: import("@actspace/shared").CustomConnectionResolvedAuth;
  };
};

export type DesktopRuntimeModelResolution =
  | { readonly ok: true; readonly model: DesktopRuntimeResolvedModel }
  | { readonly ok: false; readonly message: string };

export interface DesktopRuntimeModelPort {
  resolveAutoReviewModel?(requestedMain?: string | null): DesktopRuntimeModelResolution;
  resolveUtilityTaskModel?(requestedMain?: string | null): DesktopRuntimeModelResolution;
  /** 用途表里的思考档位；null = 模型默认。 */
  purposeThinking?(purpose: "utility" | "autoReview" | "vision"): import("@actspace/shared").ThinkingLevel | null;
  resolvePricing?(model: DesktopRuntimeResolvedModel, apiModel: string): import("@actspace/shared").ModelPricingSnapshot | null;
  resolveMainModel(requested?: string | null): DesktopRuntimeModelResolution;
  /** 设置 › 模型 里能用的模型（`ModelStoreService.listUsableModels`）。 */
  listUsableModels?(purpose: "chat"): readonly import("@actspace/shared").UsableModelView[];
  /** 设置里的子智能体默认模型（ModelKey）；null = 跟随父会话。 */
  subagentDefaultModel?(): string | null;
  resolveImageInspectionModel(): DesktopRuntimeModelResolution;
  getToolEnvironment(): {
    readonly deepseekFetchApiKey?: string;
    readonly searchCredentials: Partial<Record<"zhipu" | "tavily" | "tinyfish" | "exa" | "deepseek", string>>;
    readonly imageGeneration?: { readonly apiKey: string; readonly baseUrl: string; readonly model: string };
  };
}

/** 运行时和 legacy 兜底共用的计价参数。definition.pricing 是快照里算好的最终价（参考价已乘倍率）。 */
export function customConnectionPricingInput(model: DesktopRuntimeResolvedModel, apiModel: string): Parameters<typeof resolveModelPricing>[1] {
  return {
    providerId: model.definition.provider,
    apiModel,
    modelKey: model.key,
    baseUrl: model.providerRuntime.baseUrl ?? "",
    connectionId: model.connectionId,
    multiplier: model.providerRuntime.pricingMultiplier,
    configured: apiModel === model.definition.apiModel ? model.definition.pricing : undefined,
    configuredByUser: model.definition.effective?.sources.rates === "user",
    unsupportedBilling: model.definition.effective?.ratesUnsupported === true,
  };
}

/**
 * `actspace.host.models` for Desktop: the models usable for chat right now.
 * `subagentDefaultModel` reads the 子智能体默认模型 setting on every call (null = follow the parent session).
 */
export function createDesktopModelsHostPort(models: Pick<DesktopRuntimeModelPort, "listUsableModels" | "subagentDefaultModel">): ModelsHostPort {
  return Object.freeze({
    listUsableModels: () => Object.freeze((models.listUsableModels?.("chat") ?? []).map(usableModelSummary)),
    subagentDefaultModel: () => models.subagentDefaultModel?.() ?? null,
  });
}

