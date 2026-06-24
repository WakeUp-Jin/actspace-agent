export type ModelId = "deepseek-v4-flash" | "deepseek-v4-pro" | "kimi-k2.6" | "kimi-k2.7-code";

export type ModelApi = "openai-completions" | "anthropic-messages";
export type ModelProvider = "deepseek" | "kimi";
export type ModelInputKind = "text" | "image";
export type ModelVisibility = "public" | "internal";

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
  /** API protocol family. It selects the LLM service / message conversion path. */
  api: ModelApi;
  /** Provider brand / endpoint owner. It selects credentials and default base URL. */
  provider: ModelProvider;
  apiModel: string;
  defaultBaseUrl: string;
  thinkingDefault: boolean;
  supportsThinkingToggle: boolean;
  reasoning: boolean;
  input: ModelInputKind[];
  contextWindow: number;
  maxTokens: number;
  visibility: ModelVisibility;
  pricing?: ModelPricing;
}

export const MODEL_REGISTRY: Record<ModelId, ModelSpec> = {
  "deepseek-v4-flash": {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    api: "anthropic-messages",
    provider: "deepseek",
    apiModel: "deepseek-v4-flash",
    defaultBaseUrl: "https://api.deepseek.com/anthropic",
    thinkingDefault: true,
    supportsThinkingToggle: true,
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1_000_000,
    maxTokens: 8192,
    visibility: "public",
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
    api: "anthropic-messages",
    provider: "deepseek",
    apiModel: "deepseek-v4-pro",
    defaultBaseUrl: "https://api.deepseek.com/anthropic",
    thinkingDefault: true,
    supportsThinkingToggle: true,
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1_000_000,
    maxTokens: 8192,
    visibility: "public",
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
    api: "openai-completions",
    provider: "kimi",
    apiModel: "kimi-k2.6",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    thinkingDefault: false,
    supportsThinkingToggle: true,
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 256_000,
    maxTokens: 8192,
    visibility: "public",
    // Kimi（Moonshot）按人民币计价；单价为 CNY/百万 token（由公开 USD 单价 $0.95/$4.00、
    // 缓存命中约 $0.13 按 ≈7.2 一次性换算而来，仅作示意，接真实项目时改成 Moonshot 官网公布的
    // CNY 价目即可）。
    pricing: {
      currency: "CNY",
      inputCacheHitPerMillion: 0.936,
      inputCacheMissPerMillion: 6.84,
      outputPerMillion: 28.8,
    },
  },
  "kimi-k2.7-code": {
    id: "kimi-k2.7-code",
    label: "Kimi K2.7 Code",
    api: "openai-completions",
    provider: "kimi",
    apiModel: "kimi-k2.7-code",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    thinkingDefault: false,
    supportsThinkingToggle: true,
    reasoning: false,
    input: ["text"],
    contextWindow: 1_000_000,
    maxTokens: 262_144,
    visibility: "public",
    pricing: {
      currency: "CNY",
      inputCacheHitPerMillion: 1.3,
      inputCacheMissPerMillion: 6.5,
      outputPerMillion: 27,
    },
  },
};

export const ALL_MODEL_LIST: ModelSpec[] = Object.values(MODEL_REGISTRY);

/** Public user-facing models. Internal helper models, such as Kimi, stay in MODEL_REGISTRY. */
export const MODEL_LIST: ModelSpec[] = ALL_MODEL_LIST.filter((spec) => spec.visibility === "public");

export const DEFAULT_MODEL_ID: ModelId = "deepseek-v4-pro";

export function resolveModelSpec(modelId?: ModelId): ModelSpec {
  if (modelId && modelId in MODEL_REGISTRY) return MODEL_REGISTRY[modelId];
  return MODEL_REGISTRY[DEFAULT_MODEL_ID];
}

export function isPublicModelId(value: unknown): value is ModelId {
  return typeof value === "string" &&
    value in MODEL_REGISTRY &&
    MODEL_REGISTRY[value as ModelId].visibility === "public";
}

export function resolveModelSpecByApiModel(apiModel: string, provider?: ModelSpec["provider"]): ModelSpec | undefined {
  return ALL_MODEL_LIST.find((spec) => spec.apiModel === apiModel && (!provider || spec.provider === provider));
}
