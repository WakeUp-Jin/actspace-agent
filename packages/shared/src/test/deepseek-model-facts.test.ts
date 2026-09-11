import { expect, it } from "vitest";
import { deepSeekModelDefinition, deepSeekPeakPricing } from "../deepseek-model-facts";
import { normalizeModelKey, resolveModelDefinition } from "../model-config";
import { resolveModelPricing } from "../model-pricing";

it.each(["deepseek-flash", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp"])("resolves %s to the same vision model without changing other providers", (id) => {
  expect(normalizeModelKey(id)).toBe("deepseek:deepseek-flash");
  expect(normalizeModelKey(`deepseek:${id}`)).toBe("deepseek:deepseek-flash");
  expect(normalizeModelKey(`openrouter:${id}`)).toBe(`openrouter:${id}`);
  expect(resolveModelDefinition(`deepseek:${id}`)).toMatchObject({ apiModel: "deepseek-flash", contextWindow: 1_000_000, maxTokens: 393_216, capabilities: { input: ["text", "image"], reasoningEfforts: ["low", "high", "max"], reasoningDefaultEffort: "high" } });
});

it("selects published release tariffs at the exact boundary, independent of peak hours", () => {
  expect(deepSeekPeakPricing("deepseek-v4-flash", "2026-09-10T03:59:59.999Z")?.outputPerMillion).toBe(1.32);
  expect(deepSeekPeakPricing("deepseek-v4-flash", "2026-09-10T04:00:00.000Z")?.outputPerMillion).toBe(1.2);
  expect(deepSeekPeakPricing("deepseek-flash", "2026-09-12T20:00:00Z")).toEqual(deepSeekPeakPricing("deepseek-flash", "2026-09-11T02:00:00Z"));
  expect(deepSeekModelDefinition("deepseek-v4-pro")).toBeUndefined();
  expect(normalizeModelKey("deepseek:deepseek-v4-pro")).toBe("deepseek:deepseek-flash");
  expect(deepSeekModelDefinition("future-model")).toBeUndefined();
});

it("freezes USD peak pricing and applies a connection multiplier exactly once", () => {
  const catalog = { schemaVersion: 1 as const, generatedAt: "2026-09-10T00:00:00Z", contentHash: "empty", entries: [] };
  const input = { providerId: "deepseek", modelKey: "deepseek:deepseek-flash", apiModel: "deepseek-flash", baseUrl: "https://api.deepseek.com", multiplier: 2, now: "2026-09-10T04:00:00Z" };
  const price = resolveModelPricing(catalog, input);
  expect(price).toMatchObject({ currency: "USD", strategy: "fixed-peak", source: "deepseek-official", rates: { input: 0.6, output: 2.4, cacheRead: 0.012 } });
  expect(resolveModelPricing(catalog, { ...input, baseUrl: "https://proxy.example" })).toBeNull();
  expect(resolveModelPricing(catalog, { ...input, baseUrl: "https://openrouter.ai/api/v1" })).toBeNull();
  const frozen = JSON.stringify(price);
  resolveModelPricing(catalog, { ...input, now: "2026-09-20T00:00:00Z" });
  expect(JSON.stringify(price)).toBe(frozen);
});
