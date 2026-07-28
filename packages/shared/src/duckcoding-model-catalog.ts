import type {
  ModelApi,
  ModelCapabilities,
  ModelPricing,
  ModelReasoningEffort,
} from "./model-config";

export type DuckCodingModelFamily = "codex" | "grok";

export interface DuckCodingCatalogModel {
  id: string;
  provider: "duckcoding";
  family: DuckCodingModelFamily;
  label: string;
  api: ModelApi;
  apiModel: string;
  contextWindow: number;
  maxTokens: number | null;
  thinkingDefault: boolean;
  capabilities: ModelCapabilities;
  requestModelByReasoningEffort?: Partial<Record<ModelReasoningEffort, string>>;
  pricing?: ModelPricing;
}

const DUCKCODING_CODEX_EFFORTS: ModelReasoningEffort[] = ["low", "medium", "high", "xhigh", "ultra"];
const DUCKCODING_CODEX_PRICING: Record<"sol" | "terra" | "luna", ModelPricing> = {
  sol: {
    currency: "USD",
    inputCacheHitPerMillion: 0.5,
    inputCacheMissPerMillion: 5,
    inputCacheWritePerMillion: 6.25,
    outputPerMillion: 30,
  },
  terra: {
    currency: "USD",
    inputCacheHitPerMillion: 0.25,
    inputCacheMissPerMillion: 2.5,
    inputCacheWritePerMillion: 3.125,
    outputPerMillion: 15,
  },
  luna: {
    currency: "USD",
    inputCacheHitPerMillion: 0.1,
    inputCacheMissPerMillion: 1,
    inputCacheWritePerMillion: 1.25,
    outputPerMillion: 6,
  },
};

function createDuckCodingCodexModel(slug: "sol" | "terra" | "luna", label: string): DuckCodingCatalogModel {
  const apiModel = `gpt-5.6-${slug}`;
  return {
    id: `codex:${apiModel}`,
    provider: "duckcoding",
    family: "codex",
    label,
    api: "openai-responses",
    apiModel,
    contextWindow: 255_000,
    maxTokens: null,
    thinkingDefault: true,
    capabilities: {
      input: ["text"],
      toolUse: "declared",
      reasoning: true,
      thinkingToggle: false,
      reasoningMandatory: true,
      reasoningEfforts: [...DUCKCODING_CODEX_EFFORTS],
      reasoningDefaultEffort: "medium",
    },
    requestModelByReasoningEffort: {
      low: `${apiModel}-low`,
      medium: apiModel,
      high: `${apiModel}-high`,
      xhigh: `${apiModel}-xhigh`,
      ultra: `${apiModel}-ultra`,
    },
    pricing: { ...DUCKCODING_CODEX_PRICING[slug] },
  };
}

/**
 * DuckCoding routes converted coding models by exact `model` strings.
 * Keep request names explicit: do not infer provider prefixes or effort suffixes at runtime.
 */
export const DUCKCODING_MODEL_CATALOG = [
  createDuckCodingCodexModel("sol", "5.6 Sol"),
  createDuckCodingCodexModel("terra", "5.6 Terra"),
  createDuckCodingCodexModel("luna", "5.6 Luna"),
  {
    id: "grok:grok-4.5",
    provider: "duckcoding",
    family: "grok",
    label: "Grok 4.5",
    api: "openai-completions",
    apiModel: "grok-4.5",
    contextWindow: 255_000,
    maxTokens: null,
    thinkingDefault: true,
    capabilities: {
      input: ["text"],
      toolUse: "declared",
      reasoning: true,
      thinkingToggle: false,
      reasoningMandatory: true,
    },
  },
] satisfies readonly DuckCodingCatalogModel[];

export function findDuckCodingCatalogModel(id: string): DuckCodingCatalogModel | undefined {
  return DUCKCODING_MODEL_CATALOG.find((model) => model.id === id);
}

export function findDuckCodingCatalogModelByApiModel(apiModel: string): DuckCodingCatalogModel | undefined {
  return DUCKCODING_MODEL_CATALOG.find((model) => model.apiModel === apiModel);
}
