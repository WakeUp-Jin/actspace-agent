import type { ModelApi } from "./model-config";

export type ProviderId = "deepseek" | "kimi" | "openrouter";

export interface ProviderSpec {
  id: ProviderId;
  label: string;
  defaultBaseUrl: string;
  supportedApis: readonly ModelApi[];
  supportsRemoteModelCatalog: boolean;
  supportsProxy: boolean;
}

export const PROVIDER_IDS = ["deepseek", "kimi", "openrouter"] as const satisfies readonly ProviderId[];

export const PROVIDER_REGISTRY: Record<ProviderId, ProviderSpec> = {
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    defaultBaseUrl: "https://api.deepseek.com/anthropic",
    supportedApis: ["anthropic-messages", "openai-completions"],
    supportsRemoteModelCatalog: false,
    supportsProxy: true,
  },
  kimi: {
    id: "kimi",
    label: "Kimi",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    supportedApis: ["openai-completions"],
    supportsRemoteModelCatalog: false,
    supportsProxy: true,
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    supportedApis: ["openai-completions"],
    supportsRemoteModelCatalog: true,
    supportsProxy: true,
  },
};

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && value in PROVIDER_REGISTRY;
}
