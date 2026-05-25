import type { LlmUsageCost, ModelPricing } from "@actspace/shared";

export type UsageCostInput = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
};

export function calculateUsageCost(
  usage: UsageCostInput,
  pricing?: ModelPricing,
): LlmUsageCost {
  if (!pricing) {
    return {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
      currency: "USD",
    };
  }

  const cacheHitTokens = usage.cacheHitTokens ?? 0;
  const cacheMissTokens = usage.cacheMissTokens ?? Math.max(usage.inputTokens - cacheHitTokens, 0);
  const outputTokens = usage.outputTokens;
  const reasoningTokens = usage.reasoningTokens ?? 0;

  const input = (cacheMissTokens / 1_000_000) * pricing.inputCacheMissPerMillion;
  const cacheRead = (cacheHitTokens / 1_000_000) * pricing.inputCacheHitPerMillion;
  const output = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  const reasoning = pricing.reasoningPerMillion
    ? (reasoningTokens / 1_000_000) * pricing.reasoningPerMillion
    : 0;

  const total = input + cacheRead + output + reasoning;

  return {
    input,
    output: output + reasoning,
    cacheRead,
    cacheWrite: 0,
    total,
    currency: pricing.currency,
  };
}
