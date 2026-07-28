import type { ProviderId } from "./provider-config";

export type LegacyModelId =
  | "deepseek-v4-flash"
  | "deepseek-v4-pro"
  | "kimi-k2.6"
  | "kimi-k2.7-code";

/** @deprecated 新配置使用 provider-qualified ModelKey；该别名只保留现有消费者兼容。 */
export type ModelId = LegacyModelId;
export type ModelKey = `${ProviderId}:${string}`;
export type ModelSelectionId = ModelKey | LegacyModelId;

export type ModelApi = "openai-completions" | "openai-responses" | "anthropic-messages";
export type ModelProvider = Extract<ProviderId, "deepseek" | "kimi">;
export type ModelInputKind = "text" | "image";
export type ModelVisibility = "public" | "internal";
export type ModelSource = "builtin" | "curated" | "provider-catalog" | "custom";
export type ModelToolUseCapability = "verified" | "declared" | "unsupported" | "unknown";
export const MODEL_REASONING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"] as const;
export type ModelReasoningEffort = (typeof MODEL_REASONING_EFFORTS)[number];

export type ModelPricing = {
  currency: "USD" | "CNY";
  inputCacheHitPerMillion: number;
  inputCacheMissPerMillion: number;
  inputCacheWritePerMillion?: number;
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

export interface ModelCapabilities {
  input: ModelInputKind[];
  toolUse: ModelToolUseCapability;
  reasoning: boolean;
  thinkingToggle: boolean;
  /** undefined = provider catalog does not expose effort control; null = all normalized efforts are accepted. */
  reasoningEfforts?: ModelReasoningEffort[] | null;
  reasoningDefaultEffort?: ModelReasoningEffort;
  reasoningMandatory?: boolean;
}

export interface ModelDefinition {
  key: ModelKey;
  provider: ProviderId;
  api: ModelApi;
  apiModel: string;
  label: string;
  source: ModelSource;
  contextWindow: number | null;
  maxTokens: number | null;
  thinkingDefault: boolean;
  capabilities: ModelCapabilities;
  /** Optional provider-specific model names used when reasoning effort is encoded in `model`. */
  requestModelByReasoningEffort?: Partial<Record<ModelReasoningEffort, string>>;
  /** Provider-local catalog grouping such as `codex` or `grok`. */
  family?: string;
  pricing?: ModelPricing;
  catalogUpdatedAt?: string;
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
    input: ["text"],
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
    input: ["text"],
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
    input: ["text", "image"],
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

export const LEGACY_MODEL_KEY_MAP: Record<LegacyModelId, ModelKey> = {
  "deepseek-v4-flash": "deepseek:deepseek-v4-flash",
  "deepseek-v4-pro": "deepseek:deepseek-v4-pro",
  "kimi-k2.6": "kimi:kimi-k2.6",
  "kimi-k2.7-code": "kimi:kimi-k2.7-code",
};

export const DEFAULT_MODEL_KEY: ModelKey = LEGACY_MODEL_KEY_MAP[DEFAULT_MODEL_ID];

export const BUILTIN_MODEL_REGISTRY: Partial<Record<ModelKey, ModelDefinition>> = Object.fromEntries(
  ALL_MODEL_LIST.map((spec) => [
    LEGACY_MODEL_KEY_MAP[spec.id],
    {
      key: LEGACY_MODEL_KEY_MAP[spec.id],
      provider: spec.provider,
      api: spec.api,
      apiModel: spec.apiModel,
      label: spec.label,
      source: "builtin" as const,
      contextWindow: spec.contextWindow,
      maxTokens: spec.maxTokens,
      thinkingDefault: spec.thinkingDefault,
      capabilities: {
        input: [...spec.input],
        toolUse: "verified" as const,
        reasoning: spec.reasoning,
        thinkingToggle: spec.supportsThinkingToggle,
      },
      ...(spec.pricing && { pricing: { ...spec.pricing } }),
    } satisfies ModelDefinition,
  ]),
) as Partial<Record<ModelKey, ModelDefinition>>;

export const BUILTIN_MODEL_LIST: ModelDefinition[] = Object.values(BUILTIN_MODEL_REGISTRY).filter(
  (definition): definition is ModelDefinition => Boolean(definition),
);

/**
 * OpenRouter defaults are deliberately small. Catalog metadata was checked against
 * https://openrouter.ai/api/v1/models on 2026-07-24; tool support remains `declared`
 * until a credentialed actspace tool-call smoke promotes a model to `verified`.
 */
export const CURATED_OPENROUTER_MODEL_LIST: ModelDefinition[] = [
  {
    key: "openrouter:google/gemini-3.5-flash-lite",
    provider: "openrouter",
    api: "openai-completions",
    apiModel: "google/gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash Lite",
    source: "curated",
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    thinkingDefault: true,
    capabilities: {
      input: ["text", "image"],
      toolUse: "declared",
      reasoning: true,
      thinkingToggle: true,
      reasoningEfforts: ["minimal", "low", "medium", "high"],
      reasoningDefaultEffort: "medium",
    },
    pricing: {
      currency: "USD",
      inputCacheHitPerMillion: 0.03,
      inputCacheMissPerMillion: 0.3,
      outputPerMillion: 2.5,
    },
    catalogUpdatedAt: "2026-07-24T00:00:00.000Z",
  },
  {
    key: "openrouter:kwaipilot/kat-coder-air-v2.5",
    provider: "openrouter",
    api: "openai-completions",
    apiModel: "kwaipilot/kat-coder-air-v2.5",
    label: "KAT-Coder-Air V2.5",
    source: "curated",
    contextWindow: 256_000,
    maxTokens: 80_000,
    thinkingDefault: false,
    capabilities: { input: ["text"], toolUse: "declared", reasoning: false, thinkingToggle: false },
    pricing: {
      currency: "USD",
      inputCacheHitPerMillion: 0.03,
      inputCacheMissPerMillion: 0.15,
      outputPerMillion: 0.6,
    },
    catalogUpdatedAt: "2026-07-24T00:00:00.000Z",
  },
  {
    key: "openrouter:google/gemini-3.6-flash",
    provider: "openrouter",
    api: "openai-completions",
    apiModel: "google/gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    source: "curated",
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    thinkingDefault: true,
    capabilities: {
      input: ["text", "image"],
      toolUse: "declared",
      reasoning: true,
      thinkingToggle: true,
      reasoningEfforts: ["minimal", "low", "medium", "high"],
      reasoningDefaultEffort: "medium",
    },
    pricing: {
      currency: "USD",
      inputCacheHitPerMillion: 0.15,
      inputCacheMissPerMillion: 1.5,
      outputPerMillion: 7.5,
    },
    catalogUpdatedAt: "2026-07-24T00:00:00.000Z",
  },
];

export const CURATED_OPENROUTER_MODEL_REGISTRY: Partial<Record<ModelKey, ModelDefinition>> =
  Object.fromEntries(CURATED_OPENROUTER_MODEL_LIST.map((definition) => [definition.key, definition]));

export function normalizeModelKey(value: unknown): ModelKey | undefined {
  if (typeof value !== "string") return undefined;
  if (value in LEGACY_MODEL_KEY_MAP) return LEGACY_MODEL_KEY_MAP[value as LegacyModelId];
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) return undefined;
  const provider = value.slice(0, separatorIndex);
  if (provider !== "deepseek" && provider !== "kimi" && provider !== "openrouter" && provider !== "duckcoding") return undefined;
  return value as ModelKey;
}

export function legacyModelIdFromKey(modelKey: ModelKey): LegacyModelId | undefined {
  return (Object.entries(LEGACY_MODEL_KEY_MAP) as Array<[LegacyModelId, ModelKey]>).find(
    ([, key]) => key === modelKey,
  )?.[0];
}

export function resolveModelDefinition(modelId: ModelSelectionId): ModelDefinition | undefined {
  const key = normalizeModelKey(modelId);
  return key ? BUILTIN_MODEL_REGISTRY[key] : undefined;
}

export function resolveModelDefinitionByApiModel(
  apiModel: string,
  provider?: ProviderId,
): ModelDefinition | undefined {
  return BUILTIN_MODEL_LIST.find(
    (definition) => definition.apiModel === apiModel && (!provider || definition.provider === provider),
  );
}

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
