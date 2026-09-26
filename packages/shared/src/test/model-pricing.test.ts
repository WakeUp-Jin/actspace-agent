import { describe, expect, it } from "vitest";
import { BUILTIN_MODEL_CATALOG } from "../generated/model-catalog.generated";
import { billingReferenceProvider, resolveModelPricing } from "../model-pricing";
import type { ModelPricing } from "../model-config";

const relay = {
  providerId: "openrouter",
  apiModel: "claude-sonnet-5",
  modelKey: "openrouter:connection/relay/claude-sonnet-5",
  baseUrl: "https://relay.example",
  connectionId: "relay",
  now: "2026-09-26T00:00:00.000Z",
};
const manual: ModelPricing = { currency: "USD", inputCacheMissPerMillion: 4, outputPerMillion: 20, inputCacheHitPerMillion: 0.4, inputCacheWritePerMillion: 5 };

describe("custom connection billing modes", () => {
  it("prices a relay model at the official rate times the connection multiplier", () => {
    const price = resolveModelPricing(BUILTIN_MODEL_CATALOG, { ...relay, multiplier: 0.3, billingMode: "reference", referenceProviderId: billingReferenceProvider("anthropic-messages") });
    expect(price).toMatchObject({ providerId: "anthropic", multiplier: 0.3, source: "models.dev" });
    expect(price?.rates.input).toBeCloseTo(0.6);
    expect(price?.rates.output).toBeCloseTo(3);
    expect(price?.rates.cacheRead).toBeCloseTo(0.06);
    expect(price?.rates.cacheWrite).toBeCloseTo(0.75);
  });

  it("counts tokens only in token mode", () => {
    expect(resolveModelPricing(BUILTIN_MODEL_CATALOG, { ...relay, multiplier: 0.3, billingMode: "token", referenceProviderId: "anthropic", configured: manual })).toBeNull();
  });

  it("uses a model's own manual price in reference mode without the multiplier", () => {
    const price = resolveModelPricing(BUILTIN_MODEL_CATALOG, { ...relay, multiplier: 0.3, billingMode: "reference", referenceProviderId: "anthropic", configured: manual, configuredAlreadyMultiplied: true });
    expect(price).toMatchObject({ source: "configured", multiplier: 1, rates: { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 } });
  });

  it("keeps legacy relay connections unpriced unless a manual price exists", () => {
    expect(resolveModelPricing(BUILTIN_MODEL_CATALOG, { ...relay, multiplier: 1 })).toBeNull();
    expect(resolveModelPricing(BUILTIN_MODEL_CATALOG, { ...relay, multiplier: 1, configured: manual, configuredAlreadyMultiplied: true })?.rates.input).toBe(4);
  });

  it("maps protocols to the vendor catalog used for reference prices", () => {
    expect(billingReferenceProvider("anthropic-messages")).toBe("anthropic");
    expect(billingReferenceProvider("openai-completions")).toBe("openai");
    expect(billingReferenceProvider("openai-responses")).toBe("openai");
  });
});
