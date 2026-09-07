import type { ModelPricingSnapshot } from "@actspace/shared";
import type { LlmUsage } from "./usage.js";

/** inputTokens is uncached input; reasoningTokens is already included in output. */
export function calculateUsageCost(usage: LlmUsage, pricing: ModelPricingSnapshot | null): LlmUsage {
  if (usage.costProvenance?.basis === "provider-reported" && usage.cost !== null && Number.isFinite(usage.cost) && usage.cost >= 0 && (usage.costCurrency === "USD" || usage.costCurrency === "CNY")) {
    return { ...usage, costProvenance: { ...usage.costProvenance, pricingSnapshot: pricing } };
  }
  const unknown = (reason: string): LlmUsage => ({ ...usage, cost: null, costCurrency: null, costProvenance: { version: 1, basis: "unknown", reason, pricingSnapshot: pricing } });
  if (!pricing) return unknown("model-price-unavailable");
  if (pricing.unsupportedBilling) return unknown("unsupported-billing-rule");
  if (usage.inputTokens === null || usage.outputTokens === null) return unknown("usage-unavailable");
  const buckets = [[usage.inputTokens, pricing.rates.input], [usage.outputTokens, pricing.rates.output], [usage.cacheReadTokens ?? 0, pricing.rates.cacheRead], [usage.cacheWriteTokens ?? 0, pricing.rates.cacheWrite]];
  let amount = 0;
  for (const [tokens, rate] of buckets) {
    if (tokens === null || !Number.isFinite(tokens) || tokens < 0) return unknown("invalid-usage");
    if (tokens === 0) continue;
    if (rate === null || !Number.isFinite(rate) || rate < 0) return unknown("token-price-unavailable");
    amount += tokens * rate / 1_000_000;
  }
  if (!Number.isFinite(amount)) return unknown("invalid-cost");
  return { ...usage, cost: amount, costCurrency: pricing.currency, costProvenance: { version: 1, basis: "estimated", reason: null, pricingSnapshot: pricing } };
}
