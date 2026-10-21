import { describe, expect, it } from "vitest";
import { BUILTIN_MODEL_CATALOG } from "../generated/model-catalog.generated";
import { resolveModelPricing } from "../model-pricing";
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

describe("runtime pricing snapshot", () => {
  it("wraps the already-multiplied configured price as is", () => {
    const price = resolveModelPricing(BUILTIN_MODEL_CATALOG, { ...relay, multiplier: 0.3, configured: manual });
    expect(price).toMatchObject({ source: "configured", providerId: "openrouter", multiplier: 0.3, rates: { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 } });
  });

  it("leaves relay models without a configured price unpriced", () => {
    expect(resolveModelPricing(BUILTIN_MODEL_CATALOG, { ...relay, multiplier: 1 })).toBeNull();
  });

  it("falls back to the endpoint owner's catalog price times the multiplier", () => {
    const price = resolveModelPricing(BUILTIN_MODEL_CATALOG, { ...relay, baseUrl: "https://api.anthropic.com", multiplier: 0.5 });
    expect(price).toMatchObject({ providerId: "anthropic", source: "models.dev", multiplier: 0.5 });
    expect(price?.rates.input).toBeCloseTo(1);
  });

  it("lets a hand-entered price beat the DeepSeek peak estimate", () => {
    const input = { providerId: "deepseek", apiModel: "deepseek-flash", modelKey: "deepseek:deepseek-flash", baseUrl: "https://api.deepseek.com", now: relay.now };
    expect(resolveModelPricing(BUILTIN_MODEL_CATALOG, { ...input, configured: manual })?.strategy).toBe("fixed-peak");
    expect(resolveModelPricing(BUILTIN_MODEL_CATALOG, { ...input, configured: manual, configuredByUser: true })).toMatchObject({ source: "configured", rates: { input: 4 } });
  });

  it("carries the unsupported-billing flag for configured prices", () => {
    expect(resolveModelPricing(BUILTIN_MODEL_CATALOG, { ...relay, configured: manual, unsupportedBilling: true })?.unsupportedBilling).toBe(true);
  });
});
