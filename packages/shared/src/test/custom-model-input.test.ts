import { describe, expect, it } from "vitest";
import { buildCustomModelDefinition, customConnectionModelKey, normalizeCustomModelPricing } from "../custom-model-input";

describe("custom model input", () => {
  it("builds a connection-scoped Anthropic model with four manual rates", () => {
    const definition = buildCustomModelDefinition({
      apiModel: "claude-opus-alias",
      label: "Opus Relay",
      enabled: true,
      contextWindow: 1_000_000,
      maxTokens: 128_000,
      input: ["text", "image"],
      reasoningConfig: { mode: "manual", support: "supported", efforts: ["low", "medium", "high", "xhigh", "max"], defaultEffort: "medium", allowOff: true },
      pricing: { currency: "USD", inputCacheMissPerMillion: 5, outputPerMillion: 25, inputCacheHitPerMillion: 0.5, inputCacheWritePerMillion: 6.25 },
    }, { providerId: "openrouter", protocol: "anthropic-messages", connectionId: "cheap-router" });

    expect(definition).toMatchObject({
      key: customConnectionModelKey("openrouter", "cheap-router", "claude-opus-alias"),
      api: "anthropic-messages",
      apiModel: "claude-opus-alias",
      label: "Opus Relay",
      contextWindow: 1_000_000,
      maxTokens: 128_000,
      capabilities: { input: ["text", "image"], reasoning: true, reasoningDefaultEffort: "medium" },
      pricing: { currency: "USD", inputCacheMissPerMillion: 5, outputPerMillion: 25, inputCacheHitPerMillion: 0.5, inputCacheWritePerMillion: 6.25 },
    });
  });

  it("requires every enabled manual price and accepts zero", () => {
    expect(normalizeCustomModelPricing({ currency: "CNY", inputCacheMissPerMillion: 0, outputPerMillion: 0, inputCacheHitPerMillion: 0, inputCacheWritePerMillion: 0 })).toMatchObject({ inputCacheWritePerMillion: 0 });
    expect(() => normalizeCustomModelPricing({ currency: "USD", inputCacheMissPerMillion: 1, outputPerMillion: 2, inputCacheHitPerMillion: 0.1 })).toThrow("缓存写入");
    expect(() => normalizeCustomModelPricing({ currency: "USD", inputCacheMissPerMillion: -1, outputPerMillion: 2, inputCacheHitPerMillion: 0.1, inputCacheWritePerMillion: 1 })).toThrow("标准输入");
  });

  it("rejects malformed ids, limits and Anthropic-incompatible reasoning efforts", () => {
    const base = { apiModel: "model", enabled: true, contextWindow: null, maxTokens: null, input: ["text"] as const, reasoningConfig: { mode: "auto" as const }, pricing: null };
    expect(() => buildCustomModelDefinition({ ...base, apiModel: "" }, { providerId: "openrouter", protocol: "anthropic-messages", connectionId: "relay" })).toThrow("API 模型 ID");
    expect(() => buildCustomModelDefinition({ ...base, contextWindow: -1 }, { providerId: "openrouter", protocol: "openai-completions", connectionId: "relay" })).toThrow("上下文窗口");
    expect(() => buildCustomModelDefinition({ ...base, reasoningConfig: { mode: "manual", support: "supported", efforts: ["ultra"], defaultEffort: "ultra", allowOff: true } }, { providerId: "openrouter", protocol: "anthropic-messages", connectionId: "relay" })).toThrow("Anthropic 协议");
  });
});
