import { describe, expect, it } from "vitest";
import type { ModelCatalogEntry } from "../model-catalog";
import { matchCatalogModel } from "../model-catalog-match";
import { capabilitiesToThinking, pricingToRates, resolveEffectiveModel, thinkingToCapabilities } from "../model-layers";
import { normalizeThinking, thinkingProfileFor } from "../model-thinking-profiles";
import { normalizeProviderModelFacts } from "../provider-model-facts";
import { templateForConnection } from "../provider-templates";

const entry = (over: Partial<ModelCatalogEntry> & Pick<ModelCatalogEntry, "apiModel" | "sourceProviderId">): ModelCatalogEntry => ({
  source: "models.dev", name: over.apiModel, currency: "USD", unsupportedBilling: false,
  rates: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  contextWindow: 200_000, maxOutput: 64_000, input: ["text", "image", "pdf"], reasoning: true, ...over,
});
const catalog = {
  entries: [
    entry({ sourceProviderId: "anthropic", apiModel: "claude-sonnet-5", name: "Claude Sonnet 5 (latest)" }),
    entry({ sourceProviderId: "openrouter", source: "openrouter", apiModel: "anthropic/claude-sonnet-5", name: "Anthropic: Claude Sonnet 5", rates: { input: 9, output: 9, cacheRead: null, cacheWrite: null } }),
    entry({ sourceProviderId: "openrouter", source: "openrouter", apiModel: "anthropic/claude-opus-4.5", name: "Claude Opus 4.5" }),
    entry({ sourceProviderId: "openai", apiModel: "gpt-4.1", reasoning: false, input: ["text"], rates: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: null } }),
  ],
};

describe("matchCatalogModel", () => {
  it("prefers the template's catalog provider, then official rows over OpenRouter", () => {
    expect(matchCatalogModel(catalog, "claude-sonnet-5")?.entry.sourceProviderId).toBe("anthropic");
    expect(matchCatalogModel(catalog, "anthropic/claude-sonnet-5", "openrouter")?.entry.sourceProviderId).toBe("openrouter");
  });

  it("strips vendor prefixes and treats dots and dashes alike", () => {
    expect(matchCatalogModel(catalog, "claude-opus-4-5")).toMatchObject({ exact: true, entry: { apiModel: "anthropic/claude-opus-4.5" } });
    expect(matchCatalogModel(catalog, "some-relay/claude-sonnet-5")).toMatchObject({ exact: true, entry: { apiModel: "claude-sonnet-5" } });
  });

  it("only suggests a dated variant and never treats it as exact", () => {
    expect(matchCatalogModel(catalog, "claude-sonnet-5-20261001")).toMatchObject({ exact: false, entry: { apiModel: "claude-sonnet-5" } });
    expect(matchCatalogModel(catalog, "relay-coder-v2")).toBeNull();
  });
});

describe("resolveEffectiveModel", () => {
  const base = { protocol: "anthropic-messages" as const, catalog, catalogProvider: "anthropic" };

  it("takes every field from the catalog and scales the reference price", () => {
    const model = resolveEffectiveModel({ ...base, apiModel: "claude-sonnet-5", multiplier: 0.5 });
    expect(model).toMatchObject({ label: "Claude Sonnet 5", contextWindow: 200_000, input: ["text", "image"], ratesScaled: true, catalog: { exact: true } });
    expect(model.rates).toEqual({ input: 1.5, output: 7.5, cacheRead: 0.15, cacheWrite: 1.875 });
    expect(new Set(Object.values(model.sources))).toEqual(new Set(["catalog"]));
    expect(model.thinking?.levels.length).toBeGreaterThan(1);
  });

  it("lets provider /models facts beat the catalog and user overrides beat both", () => {
    const model = resolveEffectiveModel({
      ...base, apiModel: "claude-sonnet-5", multiplier: 0.5,
      providerFacts: { contextWindow: 1_000_000, rates: { input: 2, output: 10, cacheRead: null, cacheWrite: null } },
      overrides: { contextWindow: 500_000 },
    });
    expect(model.contextWindow).toBe(500_000);
    expect(model.sources).toMatchObject({ contextWindow: "user", rates: "provider", maxOutput: "catalog" });
    expect(model.rates).toEqual({ input: 1, output: 5, cacheRead: null, cacheWrite: null });
  });

  it("never multiplies a hand-entered price", () => {
    const model = resolveEffectiveModel({ ...base, apiModel: "claude-sonnet-5", multiplier: 0.3, overrides: { rates: { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 } } });
    expect(model).toMatchObject({ ratesScaled: false, rates: { input: 4, output: 20 } });
  });

  it("leaves unknown models unknown but keeps the dated-variant suggestion", () => {
    const model = resolveEffectiveModel({ ...base, apiModel: "claude-sonnet-5-20261001" });
    expect(model).toMatchObject({ label: "claude-sonnet-5-20261001", contextWindow: null, thinking: null, rates: null, catalog: { apiModel: "claude-sonnet-5", exact: false } });
    expect(model.sources.thinking).toBe("unknown");
  });

  it("uses the aliased catalog model when the user picks one", () => {
    const model = resolveEffectiveModel({ ...base, apiModel: "relay-coder-v2", overrides: { canonical: "claude-sonnet-5" } });
    expect(model).toMatchObject({ aliased: true, contextWindow: 200_000, label: "Claude Sonnet 5" });
  });

  it("marks a catalog model without reasoning as not thinking rather than unknown", () => {
    expect(resolveEffectiveModel({ ...base, protocol: "openai-responses", apiModel: "gpt-4.1" }).thinking).toEqual({ levels: [] });
  });
});

describe("thinking levels ↔ capabilities", () => {
  it.each([
    [null, { reasoning: false, thinkingToggle: false }, false],
    [{ levels: [] }, { reasoning: false, thinkingToggle: false }, false],
    [{ levels: ["off", "high"], default: "off" }, { reasoning: true, thinkingToggle: true, reasoningMandatory: false }, false],
    [{ levels: ["off", "low", "high", "max"], default: "high" }, { reasoning: true, thinkingToggle: true, reasoningEfforts: ["low", "high", "max"], reasoningDefaultEffort: "high" }, true],
    [{ levels: ["off", "low", "medium", "high"], default: "off" }, { thinkingToggle: true, reasoningEfforts: ["low", "medium", "high"], reasoningDefaultEffort: "medium" }, false],
    [{ levels: ["high"] }, { reasoning: true, thinkingToggle: false, reasoningMandatory: true }, true],
    [{ levels: ["low", "medium", "high"], default: "low" }, { thinkingToggle: false, reasoningMandatory: true, reasoningEfforts: ["low", "medium", "high"], reasoningDefaultEffort: "low" }, true],
  ] as const)("maps %j", (thinking, capabilities, thinkingDefault) => {
    const mapped = thinkingToCapabilities(thinking as never);
    expect(mapped.capabilities).toMatchObject(capabilities);
    expect(mapped.thinkingDefault).toBe(thinkingDefault);
    if (!thinking || thinking.levels.length < 3) expect(mapped.capabilities.reasoningEfforts).toBeUndefined();
  });

  it("round-trips the built-in DeepSeek capabilities", () => {
    const thinking = capabilitiesToThinking({ input: ["text"], toolUse: "verified", reasoning: true, thinkingToggle: true, reasoningEfforts: ["low", "high", "max"], reasoningDefaultEffort: "high" }, true);
    expect(thinking).toEqual({ levels: ["off", "low", "high", "max"], default: "high" });
  });

  it("fills a missing default with high, then the middle level", () => {
    expect(normalizeThinking({ levels: ["off", "low", "high"] }).default).toBe("high");
    expect(normalizeThinking({ levels: ["low", "medium"] }).default).toBe("medium");
  });

  it("knows the common model families and falls back by protocol", () => {
    expect(thinkingProfileFor("claude-opus-5", "anthropic-messages").levels).toContain("xhigh");
    expect(thinkingProfileFor("anthropic/claude-opus-4.5", "openai-completions").levels).not.toContain("xhigh");
    expect(thinkingProfileFor("gpt-5.5", "openai-responses").levels).not.toContain("off");
    expect(thinkingProfileFor("MiniMax-M3", "openai-completions")).toEqual({ levels: ["high"], default: "high" });
    expect(thinkingProfileFor("mystery-reasoner", "openai-responses")).toEqual({ levels: ["low", "medium", "high"], default: "medium" });
  });
});

describe("provider /models facts", () => {
  it("reads OpenRouter-style rows", () => {
    const facts = normalizeProviderModelFacts({
      id: "anthropic/claude-sonnet-5", name: "Anthropic: Claude Sonnet 5", context_length: 1_000_000,
      top_provider: { max_completion_tokens: 64_000 }, architecture: { input_modalities: ["text", "image"] },
      supported_parameters: ["tools", "reasoning"], pricing: { prompt: "0.000003", completion: "0.000015", input_cache_read: "0.0000003" },
    }, "openai-completions");
    expect(facts).toMatchObject({ label: "Anthropic: Claude Sonnet 5", contextWindow: 1_000_000, maxOutput: 64_000, input: ["text", "image"], rates: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: null }, ratesUnsupported: false });
    expect(facts.thinking?.levels.length).toBeGreaterThan(1);
  });

  it("keeps nothing it cannot read", () => {
    expect(normalizeProviderModelFacts({ id: "relay-coder-v2", object: "model" }, "openai-completions")).toEqual({});
  });
});

describe("pricing conversion and templates", () => {
  it("converts CNY prices to USD", () => {
    expect(pricingToRates({ currency: "CNY", inputCacheMissPerMillion: 7.2, outputPerMillion: 14.4, inputCacheHitPerMillion: 0.72 })).toEqual({ input: 1, output: 2, cacheRead: 0.1, cacheWrite: null });
  });

  it("maps legacy connections to templates", () => {
    expect(templateForConnection({ connectionId: "deepseek:default", providerId: "deepseek" }).id).toBe("deepseek");
    expect(templateForConnection({ connectionId: "custom-1", providerId: "openrouter", catalogId: "anthropic-compatible" }).hidden).toBe(true);
    expect(templateForConnection({ connectionId: "custom-1", providerId: "openrouter" }).id).toBe("custom");
  });
});
