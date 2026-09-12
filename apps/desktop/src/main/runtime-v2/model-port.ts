import type { ModelApi } from "@actspace/shared";

export type DesktopRuntimeV2ResolvedModel = {
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
  };
  readonly providerRuntime: {
    readonly apiKey?: string;
    readonly baseUrl?: string;
    readonly transport?: { readonly proxyUrl?: string };
    readonly pricingMultiplier?: number;
  };
};

export type DesktopRuntimeV2ModelResolution =
  | { readonly ok: true; readonly model: DesktopRuntimeV2ResolvedModel }
  | { readonly ok: false; readonly message: string };

export interface DesktopRuntimeV2ModelPort {
  resolveUtilityTaskModel?(requestedMain?: string | null): DesktopRuntimeV2ModelResolution;
  resolvePricing?(model: DesktopRuntimeV2ResolvedModel, apiModel: string): import("@actspace/shared").ModelPricingSnapshot | null;
  resolveMainModel(requested?: string | null): DesktopRuntimeV2ModelResolution;
  resolveImageInspectionModel(): DesktopRuntimeV2ModelResolution;
  getToolEnvironment(): {
    readonly searchCredentials: Partial<Record<"zhipu" | "tavily" | "tinyfish" | "exa", string>>;
    readonly imageGeneration?: { readonly apiKey: string; readonly baseUrl: string; readonly model: string };
  };
}
