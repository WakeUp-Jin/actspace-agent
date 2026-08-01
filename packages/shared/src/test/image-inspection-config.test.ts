import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_INSPECTION_MODEL_KEY,
  IMAGE_INSPECTION_MODEL_LIST,
  isImageInspectionModelKey,
  resolveImageInspectionModel,
} from "../image-inspection-config";

describe("image inspection model config", () => {
  it("keeps the curated provider-qualified candidates and defaults to OpenRouter Luna", () => {
    expect(IMAGE_INSPECTION_MODEL_LIST.map((model) => model.key)).toEqual([
      "openrouter:openai/gpt-5.6-luna",
      "kimi:kimi-k2.7-code",
    ]);
    expect(resolveImageInspectionModel(undefined)).toMatchObject({
      key: DEFAULT_IMAGE_INSPECTION_MODEL_KEY,
      provider: "openrouter",
      apiModel: "openai/gpt-5.6-luna",
      capabilities: { input: ["text", "image"] },
    });
  });

  it("rejects unknown and inherited object keys instead of resolving prototype values", () => {
    expect(isImageInspectionModelKey("unknown:model")).toBe(false);
    expect(isImageInspectionModelKey("toString")).toBe(false);
    expect(resolveImageInspectionModel("toString").key).toBe(DEFAULT_IMAGE_INSPECTION_MODEL_KEY);
  });
});
