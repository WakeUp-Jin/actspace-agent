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

export interface ProviderCatalogDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly logoKey: ProviderLogoKey;
  readonly category: ProviderCategory;
  readonly auth: { readonly kind: ProviderAuthKind };
  /** Legacy storage namespace; protocol independently selects the wire adapter. */
  readonly runtimeProviderId?: ProviderId;
  readonly protocol: ModelApi;
  readonly defaultBaseUrl?: string;
  readonly defaultModel?: string;
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

/** User-approved add-connection catalog. Retired presets never delete saved connections. */
export const PROVIDER_CATALOG: readonly ProviderCatalogDefinition[] = [
  { id: "minimax", label: "MiniMax", description: "MiniMax 官方 API", logoKey: "minimax", category: "direct", auth: { kind: "api-key" }, protocol: "openai-completions", defaultBaseUrl: "https://api.minimax.io/v1", defaultModel: "MiniMax-M2.7" },
  { id: "openai", label: "OpenAI", description: "OpenAI 官方 API", logoKey: "openai", category: "direct", auth: { kind: "api-key" }, protocol: "openai-responses", defaultBaseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" },
  { id: "anthropic", label: "Anthropic", description: "Anthropic 官方 API", logoKey: "anthropic", category: "direct", auth: { kind: "api-key" }, protocol: "anthropic-messages", defaultBaseUrl: "https://api.anthropic.com" },
  { id: "zai", label: "Z.AI", description: "智谱官方接入，GLM 系列模型", logoKey: "zai", category: "direct", auth: { kind: "api-key" }, protocol: "openai-completions", defaultBaseUrl: "https://api.z.ai/api/paas/v4", defaultModel: "glm-4.5" },
  { id: "xiaomi", label: "Xiaomi", description: "小米官方接入，MiMo 系列模型", logoKey: "xiaomi", category: "direct", auth: { kind: "api-key" }, protocol: "openai-completions", defaultBaseUrl: "https://api.xiaomimimo.com/v1" },
  { id: "volcengine-coding-plan", label: "火山方舟 Coding Plan", description: "火山方舟 Coding Plan 专用 Key 接入", logoKey: "volcengine", category: "coding", auth: { kind: "api-key" }, protocol: "openai-completions", defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3" },
  { id: "openai-compatible", label: "自定义服务（OpenAI Chat）", description: "兼容 Chat Completions 的中转服务或自部署网关", logoKey: "openai", category: "custom", auth: { kind: "api-key" }, protocol: "openai-completions" },
  { id: "openai-responses-compatible", label: "自定义服务（OpenAI Responses）", description: "兼容 Responses API 的中转服务或自部署网关", logoKey: "openai", category: "custom", auth: { kind: "api-key" }, protocol: "openai-responses" },
  { id: "anthropic-compatible", label: "自定义服务（Anthropic）", description: "兼容 Messages API 的中转服务或自部署网关", logoKey: "anthropic", category: "custom", auth: { kind: "api-key" }, protocol: "anthropic-messages" },
];

export const PROVIDER_CATALOG_ORDER = ["kimi", "deepseek", "minimax", "openai", "anthropic", "zai", "xiaomi", "volcengine-coding-plan", "openrouter", "openai-compatible", "openai-responses-compatible", "anthropic-compatible"] as const;
export function isConnectionProtocol(value: unknown): value is ModelApi {
  return value === "openai-completions" || value === "openai-responses" || value === "anthropic-messages";
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && value in PROVIDER_REGISTRY;
}
