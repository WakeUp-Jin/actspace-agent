export type ModelId = "deepseek-v4-flash" | "deepseek-v4-pro" | "kimi-k2.6";

export type ModelPricing = {
  currency: "USD" | "CNY";
  inputCacheHitPerMillion: number;
  inputCacheMissPerMillion: number;
  outputPerMillion: number;
  reasoningPerMillion?: number;
};

export interface ModelSpec {
  id: ModelId;
  label: string;
  provider: "deepseek" | "kimi";
  apiModel: string;
  thinkingDefault: boolean;
  supportsThinkingToggle: boolean;
  contextWindow: number;
  pricing?: ModelPricing;
}

export const MODEL_REGISTRY: Record<ModelId, ModelSpec> = {
  "deepseek-v4-flash": {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    provider: "deepseek",
    apiModel: "deepseek-v4-flash",
    thinkingDefault: true,
    supportsThinkingToggle: true,
    contextWindow: 1_000_000,
    // DeepSeek 国产模型按人民币计价；单价为 CNY/百万 token（由旧 USD 单价按 ≈7.2 一次性换算而来，
    // 仅作示意，接真实项目时改成 DeepSeek 官网公布的 CNY 价目即可）。
    pricing: {
      currency: "CNY",
      inputCacheHitPerMillion: 0.02016,
      inputCacheMissPerMillion: 1.008,
      outputPerMillion: 2.016,
    },
  },
  "deepseek-v4-pro": {
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    provider: "deepseek",
    apiModel: "deepseek-v4-pro",
    thinkingDefault: true,
    supportsThinkingToggle: true,
    contextWindow: 1_000_000,
    pricing: {
      currency: "CNY",
      inputCacheHitPerMillion: 0.0261,
      inputCacheMissPerMillion: 3.132,
      outputPerMillion: 6.264,
    },
  },
  "kimi-k2.6": {
    id: "kimi-k2.6",
    label: "Kimi K2.6",
    provider: "kimi",
    apiModel: "kimi-k2.6",
    thinkingDefault: false,
    supportsThinkingToggle: true,
    contextWindow: 256_000,
  },
};

export const MODEL_LIST: ModelSpec[] = Object.values(MODEL_REGISTRY);

export const DEFAULT_MODEL_ID: ModelId = "deepseek-v4-pro";

export function resolveModelSpec(modelId?: ModelId): ModelSpec {
  if (modelId && modelId in MODEL_REGISTRY) return MODEL_REGISTRY[modelId];
  return MODEL_REGISTRY[DEFAULT_MODEL_ID];
}

export function resolveModelSpecByApiModel(apiModel: string, provider?: ModelSpec["provider"]): ModelSpec | undefined {
  return MODEL_LIST.find((spec) => spec.apiModel === apiModel && (!provider || spec.provider === provider));
}
