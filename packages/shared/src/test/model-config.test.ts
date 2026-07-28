import { describe, expect, it } from "vitest";
import {
  ALL_MODEL_LIST,
  BUILTIN_MODEL_LIST,
  BUILTIN_MODEL_REGISTRY,
  DEFAULT_MODEL_ID,
  DEFAULT_MODEL_KEY,
  LEGACY_MODEL_KEY_MAP,
  MODEL_LIST,
  MODEL_REGISTRY,
  isPublicModelId,
  legacyModelIdFromKey,
  normalizeModelKey,
  resolveModelDefinition,
  resolveModelDefinitionByApiModel,
  resolveModelSpec,
  resolveModelSpecByApiModel,
} from "../model-config";
import { DUCKCODING_MODEL_CATALOG } from "../duckcoding-model-catalog";
import { PROVIDER_IDS, PROVIDER_REGISTRY, isProviderId } from "../provider-config";

describe("model config", () => {
  it("exposes Kimi as a public model alongside DeepSeek", () => {
    expect(MODEL_LIST.map((model) => model.id)).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
      "kimi-k2.6",
      "kimi-k2.7-code",
    ]);
    expect(ALL_MODEL_LIST.map((model) => model.id)).toContain("kimi-k2.6");
    expect(MODEL_REGISTRY["kimi-k2.6"].visibility).toBe("public");
    expect(MODEL_REGISTRY["kimi-k2.6"].pricing?.currency).toBe("CNY");
    expect(MODEL_REGISTRY["kimi-k2.7-code"]).toMatchObject({
      visibility: "public",
      input: ["text", "image"],
      contextWindow: 1_000_000,
      maxTokens: 262_144,
      pricing: {
        currency: "CNY",
        inputCacheHitPerMillion: 1.3,
        inputCacheMissPerMillion: 6.5,
        outputPerMillion: 27,
      },
    });
  });

  it("declares api separately from provider", () => {
    expect(MODEL_REGISTRY["deepseek-v4-pro"]).toMatchObject({
      api: "anthropic-messages",
      provider: "deepseek",
    });
    expect(MODEL_REGISTRY["kimi-k2.6"]).toMatchObject({
      api: "openai-completions",
      provider: "kimi",
      defaultBaseUrl: "https://api.moonshot.cn/v1",
    });
    expect(MODEL_REGISTRY["kimi-k2.7-code"]).toMatchObject({
      api: "openai-completions",
      provider: "kimi",
      defaultBaseUrl: "https://api.moonshot.cn/v1",
    });
  });

  it("treats Kimi as a public, selectable model", () => {
    expect(resolveModelSpec("kimi-k2.6").id).toBe("kimi-k2.6");
    expect(isPublicModelId("kimi-k2.6")).toBe(true);
    expect(isPublicModelId("kimi-k2.7-code")).toBe(true);
    expect(isPublicModelId(DEFAULT_MODEL_ID)).toBe(true);
  });

  it("finds models by provider api model", () => {
    expect(resolveModelSpecByApiModel("kimi-k2.6", "kimi")?.id).toBe("kimi-k2.6");
    expect(resolveModelSpecByApiModel("kimi-k2.7-code", "kimi")?.id).toBe("kimi-k2.7-code");
  });

  it("registers supported providers without storing user credentials", () => {
    expect(PROVIDER_IDS).toEqual(["deepseek", "kimi", "openrouter", "duckcoding"]);
    expect(PROVIDER_REGISTRY.openrouter).toMatchObject({
      defaultBaseUrl: "https://openrouter.ai/api/v1",
      supportedApis: ["openai-completions"],
      supportsRemoteModelCatalog: true,
      supportsProxy: true,
    });
    expect(JSON.stringify(PROVIDER_REGISTRY)).not.toMatch(/apiKey|authorization/i);
    expect(PROVIDER_REGISTRY.duckcoding).toMatchObject({
      defaultBaseUrl: "https://api.duckcoding.ai/v1",
      supportedApis: ["openai-completions", "openai-responses"],
      supportsRemoteModelCatalog: false,
    });
    expect(isProviderId("openrouter")).toBe(true);
    expect(isProviderId("other")).toBe(false);
  });

  it("keeps DuckCoding request names provider-local and maps Codex effort through model variants", () => {
    const codex = DUCKCODING_MODEL_CATALOG.filter((model) => model.family === "codex");
    const grok = DUCKCODING_MODEL_CATALOG.find((model) => model.family === "grok");

    expect(codex.map((model) => model.apiModel)).toEqual([
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
    ]);
    for (const model of codex) {
      expect(model).toMatchObject({
        provider: "duckcoding",
        api: "openai-responses",
        contextWindow: 255_000,
        capabilities: {
          reasoningEfforts: ["low", "medium", "high", "xhigh", "ultra"],
          reasoningDefaultEffort: "medium",
        },
        requestModelByReasoningEffort: {
          low: `${model.apiModel}-low`,
          medium: model.apiModel,
          high: `${model.apiModel}-high`,
          xhigh: `${model.apiModel}-xhigh`,
          ultra: `${model.apiModel}-ultra`,
        },
      });
    }
    expect(codex.map((model) => model.pricing)).toEqual([
      { currency: "USD", inputCacheHitPerMillion: 0.5, inputCacheMissPerMillion: 5, inputCacheWritePerMillion: 6.25, outputPerMillion: 30 },
      { currency: "USD", inputCacheHitPerMillion: 0.25, inputCacheMissPerMillion: 2.5, inputCacheWritePerMillion: 3.125, outputPerMillion: 15 },
      { currency: "USD", inputCacheHitPerMillion: 0.1, inputCacheMissPerMillion: 1, inputCacheWritePerMillion: 1.25, outputPerMillion: 6 },
    ]);
    expect(grok).toMatchObject({
      provider: "duckcoding",
      api: "openai-completions",
      apiModel: "grok-4.5",
      family: "grok",
    });
    expect(DUCKCODING_MODEL_CATALOG.map((model) => model.apiModel)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^(openai|azure|xai)\//)]),
    );
  });

  it("maps every legacy model to a provider-qualified builtin definition", () => {
    expect(LEGACY_MODEL_KEY_MAP).toEqual({
      "deepseek-v4-flash": "deepseek:deepseek-v4-flash",
      "deepseek-v4-pro": "deepseek:deepseek-v4-pro",
      "kimi-k2.6": "kimi:kimi-k2.6",
      "kimi-k2.7-code": "kimi:kimi-k2.7-code",
    });
    expect(DEFAULT_MODEL_KEY).toBe("deepseek:deepseek-v4-pro");
    expect(BUILTIN_MODEL_LIST).toHaveLength(4);
    expect(BUILTIN_MODEL_REGISTRY["kimi:kimi-k2.7-code"]).toMatchObject({
      provider: "kimi",
      apiModel: "kimi-k2.7-code",
      source: "builtin",
      capabilities: {
        input: ["text", "image"],
        toolUse: "verified",
        reasoning: false,
        thinkingToggle: true,
      },
    });
  });

  it("normalizes known legacy ids without defaulting unknown values", () => {
    expect(normalizeModelKey("deepseek-v4-pro")).toBe("deepseek:deepseek-v4-pro");
    expect(normalizeModelKey("openrouter:anthropic/claude-example")).toBe(
      "openrouter:anthropic/claude-example",
    );
    expect(normalizeModelKey("duckcoding:grok-4.5")).toBe("duckcoding:grok-4.5");
    expect(normalizeModelKey("unknown-model")).toBeUndefined();
    expect(normalizeModelKey("other:model")).toBeUndefined();
    expect(legacyModelIdFromKey("kimi:kimi-k2.6")).toBe("kimi-k2.6");
    expect(legacyModelIdFromKey("openrouter:moonshotai/kimi")).toBeUndefined();
  });

  it("resolves new definitions by selection or provider api model", () => {
    expect(resolveModelDefinition("deepseek-v4-flash")?.key).toBe("deepseek:deepseek-v4-flash");
    expect(resolveModelDefinition("kimi:kimi-k2.6")?.label).toBe("Kimi K2.6");
    expect(resolveModelDefinition("openrouter:anthropic/claude-example")).toBeUndefined();
    expect(resolveModelDefinitionByApiModel("kimi-k2.6", "kimi")?.key).toBe("kimi:kimi-k2.6");
    expect(resolveModelDefinitionByApiModel("kimi-k2.6", "openrouter")).toBeUndefined();
  });
});
