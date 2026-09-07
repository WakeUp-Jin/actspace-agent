import { describe, expect, it } from "vitest";
import type { ModelPricingSnapshot } from "@actspace/shared";
import { calculateUsageCost } from "../usage-cost.js";
import { EMPTY_LLM_USAGE } from "../usage.js";

const pricing: ModelPricingSnapshot = { providerId: "fixture", connectionId: null, modelKey: "fixture:m", apiModel: "m", currency: "USD", rates: { input: 2, output: 8, cacheRead: 0.2, cacheWrite: 3 }, multiplier: 1, source: "configured", contentHash: "fixture", fetchedAt: "2026-09-07T00:00:00Z", capturedAt: "2026-09-07T00:00:00Z", unsupportedBilling: false };
describe("usage cost", () => {
  it("calculates disjoint input buckets without charging reasoning twice", () => {
    const result = calculateUsageCost({ ...EMPTY_LLM_USAGE, inputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, cacheWriteTokens: 100, reasoningTokens: 400, source: "provider-reported", cost: 0 }, pricing);
    expect(result.cost).toBeCloseTo(0.0067, 10);
    expect(result.costProvenance?.basis).toBe("estimated");
    expect(result.source).toBe("provider-reported");
  });
  it("distinguishes missing rates, actual free models and zero-token buckets", () => {
    const usage = { ...EMPTY_LLM_USAGE, inputTokens: 10, outputTokens: 2 };
    expect(calculateUsageCost(usage, null).cost).toBeNull();
    expect(calculateUsageCost(usage, { ...pricing, rates: { ...pricing.rates, input: null } }).cost).toBeNull();
    expect(calculateUsageCost(usage, { ...pricing, rates: { input: 0, output: 0, cacheRead: null, cacheWrite: null } }).cost).toBe(0);
    expect(calculateUsageCost({ ...usage, cacheReadTokens: 1 }, { ...pricing, rates: { ...pricing.rates, cacheRead: null } }).cost).toBeNull();
  });
  it("rejects unsupported billing, missing usage and invalid counts", () => {
    expect(calculateUsageCost(EMPTY_LLM_USAGE, pricing).cost).toBeNull();
    expect(calculateUsageCost({ ...EMPTY_LLM_USAGE, inputTokens: -1, outputTokens: 1 }, pricing).cost).toBeNull();
    expect(calculateUsageCost({ ...EMPTY_LLM_USAGE, inputTokens: 1, outputTokens: 1 }, { ...pricing, unsupportedBilling: true }).cost).toBeNull();
  });
});

it.each([0, 0.123])("preserves explicitly reported money (%s) even without token data or a price", (cost) => {
  const usage = { ...EMPTY_LLM_USAGE, cost, costCurrency: "USD", costProvenance: { version: 1 as const, basis: "provider-reported" as const, reason: null, pricingSnapshot: null } };
  expect(calculateUsageCost(usage, null)).toMatchObject({ cost, costCurrency: "USD", costProvenance: { basis: "provider-reported" } });
  expect(calculateUsageCost(usage, pricing).cost).toBe(cost);
  expect(calculateUsageCost({ ...usage, cost: -1 }, null).cost).toBeNull();
});
