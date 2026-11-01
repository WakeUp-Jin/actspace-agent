import type { ModelApi } from "./model-config";
import type { ProviderId, ProviderLogoKey } from "./provider-config";

/**
 * 模型四层里的第二层：服务商模板。一张数据表，DeepSeek / Kimi / OpenRouter 也只是其中三行。
 * 连接上的 catalogId 就是模板 id；已退役或隐藏的模板仍用来给旧连接找名称和图标。
 */
export type ProviderTemplateGroup = "official" | "aggregator" | "custom";
export type ProviderBalanceKind = "deepseek" | "kimi" | "openrouter";

export interface ProviderTemplate {
  readonly id: string;
  readonly label: string;
  readonly group: ProviderTemplateGroup;
  readonly logoKey: ProviderLogoKey;
  /** 缺省表示由用户选择（自定义中转）。 */
  readonly protocol?: ModelApi;
  readonly defaultBaseUrl?: string;
  /** 模型目录里对应的 provider：/models ∩ 目录、/models 失败时的回退列表、同名条目的优先级都靠它。 */
  readonly catalogProvider?: string;
  readonly balance?: ProviderBalanceKind;
  /** 旧存储里的内置 provider 连接（`<id>:default`）。 */
  readonly legacyProviderId?: ProviderId;
  readonly description?: string;
  readonly hidden?: boolean;
}

export const PROVIDER_TEMPLATES: readonly ProviderTemplate[] = [
  { id: "anthropic", label: "Anthropic", group: "official", logoKey: "anthropic", protocol: "anthropic-messages", defaultBaseUrl: "https://api.anthropic.com", catalogProvider: "anthropic" },
  { id: "openai", label: "OpenAI", group: "official", logoKey: "openai", protocol: "openai-responses", defaultBaseUrl: "https://api.openai.com/v1", catalogProvider: "openai" },
  { id: "deepseek", label: "DeepSeek", group: "official", logoKey: "deepseek", protocol: "openai-completions", defaultBaseUrl: "https://api.deepseek.com", catalogProvider: "deepseek", balance: "deepseek", legacyProviderId: "deepseek" },
  { id: "kimi", label: "Kimi", group: "official", logoKey: "moonshot", protocol: "openai-completions", defaultBaseUrl: "https://api.moonshot.cn/v1", catalogProvider: "moonshotai-cn", balance: "kimi", legacyProviderId: "kimi" },
  { id: "zai", label: "智谱 Z.AI", group: "official", logoKey: "zai", protocol: "openai-completions", defaultBaseUrl: "https://api.z.ai/api/paas/v4", catalogProvider: "zhipuai" },
  { id: "minimax", label: "MiniMax", group: "official", logoKey: "minimax", protocol: "openai-completions", defaultBaseUrl: "https://api.minimax.io/v1", catalogProvider: "minimax" },
  { id: "volcengine-coding-plan", label: "火山方舟 Coding Plan", group: "official", logoKey: "volcengine", protocol: "openai-completions", defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3" },
  { id: "xiaomi", label: "小米 MiMo", group: "official", logoKey: "xiaomi", protocol: "openai-completions", defaultBaseUrl: "https://api.xiaomimimo.com/v1" },
  { id: "openrouter", label: "OpenRouter", group: "aggregator", logoKey: "openrouter", protocol: "openai-completions", defaultBaseUrl: "https://openrouter.ai/api/v1", catalogProvider: "openrouter", balance: "openrouter", legacyProviderId: "openrouter" },
  { id: "custom", label: "自定义中转", group: "custom", logoKey: "generic", description: "任意兼容 Anthropic / OpenAI 协议的服务" },
  // 旧版「自定义服务」按协议拆成的三个入口：不再出现在添加列表里，旧连接按自定义中转显示。
  { id: "openai-compatible", label: "自定义中转", group: "custom", logoKey: "generic", protocol: "openai-completions", hidden: true },
  { id: "openai-responses-compatible", label: "自定义中转", group: "custom", logoKey: "generic", protocol: "openai-responses", hidden: true },
  { id: "anthropic-compatible", label: "自定义中转", group: "custom", logoKey: "generic", protocol: "anthropic-messages", hidden: true },
];

export const CUSTOM_TEMPLATE_ID = "custom";
export const PROVIDER_TEMPLATE_GROUP_LABELS: Record<ProviderTemplateGroup, string> = { official: "官方", aggregator: "聚合平台", custom: "自定义" };
export const PROTOCOL_LABELS: Record<ModelApi, string> = {
  "anthropic-messages": "Anthropic Messages",
  "openai-completions": "OpenAI Chat",
  "openai-responses": "OpenAI Responses",
};

export function findProviderTemplate(id: string | undefined | null): ProviderTemplate | undefined {
  return id ? PROVIDER_TEMPLATES.find((template) => template.id === id) : undefined;
}

/** 自定义中转：用户自己选协议、填地址；页面上显示为「自定义中转」。 */
export function isRelayTemplate(template: ProviderTemplate | undefined): boolean {
  return !template || template.group === "custom";
}

/** 没有模板 id 的旧连接，按内置 provider 或「自定义中转」归类。 */
export function templateForConnection(input: { catalogId?: string | null; connectionId: string; providerId: string }): ProviderTemplate {
  const byId = findProviderTemplate(input.catalogId);
  if (byId) return byId;
  if (input.connectionId === `${input.providerId}:default`) {
    const legacy = PROVIDER_TEMPLATES.find((template) => template.legacyProviderId === input.providerId);
    if (legacy) return legacy;
  }
  return findProviderTemplate(CUSTOM_TEMPLATE_ID)!;
}
