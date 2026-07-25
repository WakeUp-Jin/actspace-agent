import type { LlmProviderId as ProviderId } from "@actspace/shared";
import type { StreamOptions } from "./types";

export function providerDisplayName(provider: ProviderId | string): string {
  if (provider === "deepseek") return "DeepSeek";
  if (provider === "kimi") return "Kimi";
  if (provider === "openrouter") return "OpenRouter";
  return provider;
}

export function providerDefaultHeaders(provider: ProviderId | string): Record<string, string> {
  if (provider === "openrouter") {
    return { "X-OpenRouter-Title": "Actspace" };
  }
  return {};
}

/** Apply only provider-specific request extensions; protocol conversion stays in the service. */
export function applyOpenAIProviderRequestParams<T extends Record<string, unknown>>(
  provider: ProviderId | string,
  requestParams: T,
  options?: StreamOptions,
): T {
  if (provider === "kimi" && options?.thinkingEnabled === true) {
    return { ...requestParams, thinking: { type: "enabled" } };
  }
  return requestParams;
}
