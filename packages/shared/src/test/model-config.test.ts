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
  it("keeps public model list user-facing while retaining internal models", () => {
    expect(MODEL_LIST.map((model) => model.id)).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ]);
    expect(ALL_MODEL_LIST.map((model) => model.id)).toContain("kimi-k2.6");
    expect(MODEL_REGISTRY["kimi-k2.6"].visibility).toBe("internal");
  });

  it("declares api separately from provider", () => {
    expect(MODEL_REGISTRY["deepseek-v4-pro"]).toMatchObject({
      api: "anthropic-messages",
      provider: "deepseek",
    });
    expect(MODEL_REGISTRY["kimi-k2.6"]).toMatchObject({
      api: "openai-completions",
      provider: "kimi",
    });
  });

  it("resolves internal models without exposing them as public defaults", () => {
    expect(resolveModelSpec("kimi-k2.6").id).toBe("kimi-k2.6");
    expect(isPublicModelId("kimi-k2.6")).toBe(false);
    expect(isPublicModelId(DEFAULT_MODEL_ID)).toBe(true);
  });

  it("finds internal models by provider api model", () => {
    expect(resolveModelSpecByApiModel("kimi-k2.6", "kimi")?.id).toBe("kimi-k2.6");
  });
});
