import type { ModelApi } from "./model-config";

export type ProviderId = "deepseek" | "kimi" | "openrouter";

export type ProviderLogoKey =
  | "deepseek" | "moonshot" | "openrouter" | "openai" | "anthropic" | "copilot" | "grok"
  | "opencode" | "minimax" | "zai" | "mistral" | "groq" | "cohere" | "huggingface"
  | "alibaba" | "tencent" | "volcengine" | "siliconcloud" | "localai" | "lmstudio"
  | "fireworks" | "together" | "nvidia" | "vercel" | "cloudflare" | "deepinfra"
  | "stepfun" | "xiaomi" | "zenmux" | "generic";
export type ProviderCategory = "direct" | "compatible" | "coding" | "custom";
export type ProviderAuthKind = "api-key";

export interface ProviderFieldDefinition {
  readonly key: "apiKey" | "managementKey" | "baseUrl" | "proxy";
  readonly label: string;
  readonly required: boolean;
  readonly advanced?: boolean;
}

export interface ProviderDefinition {
  readonly id: ProviderId;
  readonly label: string;
  readonly description: string;
  readonly logoKey: ProviderLogoKey;
  readonly category: ProviderCategory;
  readonly auth: { readonly kind: ProviderAuthKind };
  readonly fields: readonly ProviderFieldDefinition[];
  readonly supportsModelDiscovery: boolean;
  readonly supportsBalance: boolean;
}

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
    defaultBaseUrl: "https://api.deepseek.com",
    supportedApis: ["openai-completions"],
    supportsRemoteModelCatalog: true,
    supportsProxy: true,
  },
  kimi: {
    id: "kimi",
    label: "Moonshot",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    supportedApis: ["openai-completions"],
    supportsRemoteModelCatalog: true,
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

export const PROVIDER_DEFINITIONS: readonly ProviderDefinition[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "DeepSeek 官方 API",
    logoKey: "deepseek",
    category: "direct",
    auth: { kind: "api-key" },
    fields: [
      { key: "apiKey", label: "API Key", required: true },
      { key: "baseUrl", label: "Base URL", required: false, advanced: true },
      { key: "proxy", label: "代理", required: false, advanced: true },
    ],
    supportsModelDiscovery: true,
    supportsBalance: true,
  },
  {
    id: "kimi",
    label: "Moonshot",
    description: "Moonshot 官方 API",
    logoKey: "moonshot",
    category: "direct",
    auth: { kind: "api-key" },
    fields: [
      { key: "apiKey", label: "API Key", required: true },
      { key: "baseUrl", label: "Base URL", required: false, advanced: true },
      { key: "proxy", label: "代理", required: false, advanced: true },
    ],
    supportsModelDiscovery: true,
    supportsBalance: true,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "聚合模型目录与 OpenAI 兼容接口",
    logoKey: "openrouter",
    category: "compatible",
    auth: { kind: "api-key" },
    fields: [
      { key: "apiKey", label: "API Key", required: true },
      { key: "managementKey", label: "Management Key", required: false, advanced: true },
      { key: "baseUrl", label: "Base URL", required: false, advanced: true },
      { key: "proxy", label: "代理", required: false, advanced: true },
    ],
    supportsModelDiscovery: true,
    supportsBalance: true,
  },
];

export function isConnectionProtocol(value: unknown): value is ModelApi {
  return value === "openai-completions" || value === "openai-responses" || value === "anthropic-messages";
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && value in PROVIDER_REGISTRY;
}
