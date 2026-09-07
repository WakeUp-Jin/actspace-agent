import { describe, expect, it } from "vitest";
import { normalizeModelCatalog } from "../model-catalog-normalize";
import { resolveModelPricing } from "../model-pricing";

describe("model catalog", () => {
  it("normalizes units and preserves null, negative sentinel and genuine zero", () => {
    const entries = normalizeModelCatalog("openrouter", { data: [{ id: "m", pricing: { prompt: "0.000002", completion: "0", input_cache_read: "-1" } }] });
    expect(entries[0]?.rates).toEqual({ input: 2, output: 0, cacheRead: null, cacheWrite: null });
    expect(() => normalizeModelCatalog("models.dev", {})).toThrow();
  });
  it("uses actual endpoint owner and applies a multiplier once", () => {
    const entries = [...normalizeModelCatalog("models.dev", { deepseek: { models: { m: { id: "m", cost: { input: 1, output: 2 } } } } }), ...normalizeModelCatalog("openrouter", { data: [{ id: "m", pricing: { prompt: "0.000005", completion: "0.000006" } }] })];
    const catalog = { schemaVersion: 1 as const, generatedAt: "2026-09-07T00:00:00Z", contentHash: "test", entries };
    const input = { providerId: "deepseek", apiModel: "m", modelKey: "deepseek:m", baseUrl: "https://openrouter.ai/api/v1", multiplier: 2 };
    expect(resolveModelPricing(catalog, input)?.rates.input).toBe(10);
    expect(resolveModelPricing(catalog, { ...input, baseUrl: "https://proxy.test" })).toBeNull();
    expect(resolveModelPricing(catalog, { ...input, configured: { currency: "CNY", inputCacheMissPerMillion: 4, inputCacheHitPerMillion: 1, outputPerMillion: 8 }, configuredAlreadyMultiplied: true })?.rates.input).toBe(4);
  });
  it("marks tiered prices unsupported rather than guessing a rate", () => {
    expect(normalizeModelCatalog("models.dev", { deepseek: { models: { m: { id: "m", cost: { input: 1, output: 2, tiers: [{ input: 3 }] } } } } })[0]?.unsupportedBilling).toBe(true);
  });
});

it("fixes official DeepSeek peak rates independently of the catalog and clock, and isolates other endpoints", () => {
  const catalog = { schemaVersion: 1 as const, generatedAt: "2026-09-07T00:00:00Z", contentHash: "empty", entries: [] };
  const input = { providerId: "deepseek", apiModel: "deepseek-v4-flash", modelKey: "deepseek:deepseek-v4-flash", baseUrl: "https://api.deepseek.com/v1" };
  const peak = resolveModelPricing(catalog, { ...input, now: "2026-09-07T02:00:00Z" });
  expect(peak).toMatchObject({ source: "deepseek-official", strategy: "fixed-peak", currency: "USD", rates: { input: 0.44, output: 1.32, cacheRead: 0.014, cacheWrite: null } });
  expect(resolveModelPricing(catalog, { ...input, now: "2026-09-07T20:00:00Z" })?.rates).toEqual(peak?.rates);
  expect(resolveModelPricing(catalog, { ...input, multiplier: 2 })?.rates.input).toBe(0.88);
  expect(resolveModelPricing(catalog, { ...input, baseUrl: "https://openrouter.ai/api/v1" })).toBeNull();
  expect(resolveModelPricing(catalog, { ...input, apiModel: "unknown" })).toBeNull();
});
