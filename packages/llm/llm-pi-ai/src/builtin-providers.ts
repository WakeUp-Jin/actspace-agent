import type { PiAiWireRoute } from "./pi-ai-stream.js";

/**
 * Base URL → pi-ai built-in provider id, for the three wire protocols ActSpace serves.
 * Generated from `builtinProviders()` of the pinned pi-ai version; a test recomputes it.
 * Addresses shared by several built-ins or containing placeholders are left out.
 */
export const BUILTIN_PROVIDER_BY_BASE_URL: Readonly<Record<string, string>> = Object.freeze({
  "https://ai-gateway.vercel.sh": "vercel-ai-gateway",
  "https://api.ant-ling.com/v1": "ant-ling",
  "https://api.anthropic.com": "anthropic",
  "https://api.cerebras.ai/v1": "cerebras",
  "https://api.deepseek.com": "deepseek",
  "https://api.fireworks.ai/inference": "fireworks",
  "https://api.fireworks.ai/inference/v1": "fireworks",
  "https://api.groq.com/openai/v1": "groq",
  "https://api.individual.githubcopilot.com": "github-copilot",
  "https://api.kimi.com/coding/v1": "kimi-coding",
  "https://api.meta.ai/v1": "meta",
  "https://api.minimax.io/anthropic": "minimax",
  "https://api.minimaxi.com/anthropic": "minimax-cn",
  "https://api.moonshot.ai/v1": "moonshotai",
  "https://api.moonshot.cn/v1": "moonshotai-cn",
  "https://api.openai.com/v1": "openai",
  "https://api.together.ai/v1": "together",
  "https://api.x.ai/v1": "xai",
  "https://api.xiaomimimo.com/v1": "xiaomi",
  "https://api.z.ai/api/coding/paas/v4": "zai",
  "https://inference.baseten.co/v1": "baseten",
  "https://integrate.api.nvidia.com/v1": "nvidia",
  "https://open.bigmodel.cn/api/coding/paas/v4": "zai-coding-cn",
  "https://opencode.ai/inference/anthropic": "opencode",
  "https://opencode.ai/inference/go/anthropic": "opencode-go",
  "https://opencode.ai/inference/go/openai/v1": "opencode-go",
  "https://opencode.ai/inference/openai/v1": "opencode",
  "https://openrouter.ai/api": "openrouter",
  "https://openrouter.ai/api/v1": "openrouter",
  "https://router.huggingface.co/v1": "huggingface",
  "https://token-plan-ams.xiaomimimo.com/v1": "xiaomi-token-plan-ams",
  "https://token-plan-cn.xiaomimimo.com/v1": "xiaomi-token-plan-cn",
  "https://token-plan-sgp.xiaomimimo.com/v1": "xiaomi-token-plan-sgp",
  "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1": "qwen-token-plan-cn",
});

/** Comparable form of a Base URL: parsed, without a trailing slash. Invalid input returns null. */
export function normalizeBuiltinBaseUrl(baseUrl: string): string | null {
  try { return new URL(baseUrl.trim()).toString().replace(/\/$/, ""); } catch { return null; }
}

/** The built-in provider whose model address equals this Base URL exactly, if any. */
export function builtinProviderForBaseUrl(baseUrl: string): string | undefined {
  const normalized = normalizeBuiltinBaseUrl(baseUrl);
  return normalized === null ? undefined : BUILTIN_PROVIDER_BY_BASE_URL[normalized];
}

/** pi-ai built-in model fields ActSpace reads. Other fields are passed through untouched. */
export type PiAiBuiltinModel = {
  readonly id: string;
  readonly api: string;
  readonly baseUrl: string;
  readonly provider: string;
  readonly type?: string;
  readonly reasoning?: boolean;
  readonly input?: readonly string[];
  readonly contextWindow?: number;
  readonly maxTokens?: number;
  readonly [key: string]: unknown;
};

/** pi-ai built-in provider members ActSpace delegates to. */
export type PiAiBuiltinProvider = {
  readonly id: string;
  readonly name: string;
  readonly baseUrl?: string;
  getModels(): readonly PiAiBuiltinModel[];
  stream(model: unknown, context: unknown, options: unknown): unknown;
  streamSimple(model: unknown, context: unknown, options: unknown): unknown;
};

export type PiAiBuiltinLoader = (providerId: string) => Promise<PiAiBuiltinProvider>;

const loaded = new Map<string, Promise<PiAiBuiltinProvider>>();

/** Imports only `@earendil-works/pi-ai/providers/<id>` and keeps one instance per provider. */
export function loadBuiltinProvider(providerId: string): Promise<PiAiBuiltinProvider> {
  let pending = loaded.get(providerId);
  if (pending === undefined) {
    pending = importBuiltinProvider(providerId);
    loaded.set(providerId, pending);
    pending.catch(() => loaded.delete(providerId));
  }
  return pending;
}

async function importBuiltinProvider(providerId: string): Promise<PiAiBuiltinProvider> {
  const specifier: string = `@earendil-works/pi-ai/providers/${providerId}`;
  const module = await import(specifier) as Record<string, unknown>;
  const factory = Object.entries(module).find(([name, value]) => name.endsWith("Provider") && typeof value === "function")?.[1] as (() => PiAiBuiltinProvider) | undefined;
  if (factory === undefined) throw new Error(`pi-ai built-in provider ${providerId} has no provider factory.`);
  const provider = factory();
  if (provider.id !== providerId) throw new Error(`pi-ai built-in provider module ${providerId} returned ${provider.id}.`);
  return provider;
}

/** Chat model of the built-in provider with this id on one of ActSpace's wire protocols. */
export function builtinChatModel(provider: PiAiBuiltinProvider, modelId: string): (PiAiBuiltinModel & { readonly api: PiAiWireRoute }) | undefined {
  const model = provider.getModels().find((entry) => entry.id === modelId && (entry.type ?? "chat") === "chat");
  return model !== undefined && isWireRoute(model.api) ? model as PiAiBuiltinModel & { readonly api: PiAiWireRoute } : undefined;
}

function isWireRoute(api: string): api is PiAiWireRoute {
  return api === "openai-completions" || api === "openai-responses" || api === "anthropic-messages";
}
