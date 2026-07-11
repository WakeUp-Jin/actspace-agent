import { describe, expect, it } from "vitest";
import {
  ALL_MODEL_LIST,
  DEFAULT_MODEL_ID,
  MODEL_LIST,
  MODEL_REGISTRY,
  isPublicModelId,
  resolveModelSpec,
  resolveModelSpecByApiModel,
} from "../model-config";

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
});
