import { describe, expect, it } from "vitest";
import {
  applyOpenAIProviderRequestParams,
  providerDefaultHeaders,
  providerDisplayName,
} from "../provider-adapter";

describe("provider adapter", () => {
  it("adds only the non-secret OpenRouter title header", () => {
    expect(providerDefaultHeaders("openrouter")).toEqual({
      "X-OpenRouter-Title": "Actspace",
    });
    expect(JSON.stringify(providerDefaultHeaders("openrouter"))).not.toMatch(/authorization|api.?key/i);
    expect(providerDefaultHeaders("deepseek")).toEqual({});
  });

  it("enables Kimi thinking only when explicitly requested", () => {
    const base = { model: "kimi-k2.6" };
    expect(applyOpenAIProviderRequestParams("kimi", base, { thinkingEnabled: true })).toEqual({
      model: "kimi-k2.6",
      thinking: { type: "enabled" },
    });
    expect(applyOpenAIProviderRequestParams("kimi", base, { thinkingEnabled: false })).toEqual(base);
    expect(applyOpenAIProviderRequestParams("openrouter", base, { thinkingEnabled: true })).toEqual(base);
  });

  it("returns stable provider display names", () => {
    expect(providerDisplayName("deepseek")).toBe("DeepSeek");
    expect(providerDisplayName("kimi")).toBe("Kimi");
    expect(providerDisplayName("openrouter")).toBe("OpenRouter");
  });
});
