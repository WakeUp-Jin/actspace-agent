import { describe, expect, it } from "vitest";
import type { AppSettings, UsableModelView } from "@actspace/shared";
import { resolvePreferredChatModel } from "../model-selection";

const usableModels: UsableModelView[] = [
  {
    key: "deepseek:deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    provider: "deepseek",
    apiModel: "deepseek-v4-flash",
    contextWindow: 1_000_000,
    thinkingDefault: false,
    capabilities: { input: ["text"], toolUse: "verified", reasoning: false, thinkingToggle: false },
  },
  {
    key: "deepseek:deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    provider: "deepseek",
    apiModel: "deepseek-v4-pro",
    contextWindow: 1_000_000,
    thinkingDefault: true,
    capabilities: { input: ["text"], toolUse: "verified", reasoning: true, thinkingToggle: true },
  },
];

function settings(overrides: Partial<AppSettings> = {}): Pick<AppSettings, "taskModels" | "defaultModelId"> {
  return {
    defaultModelId: null,
    ...overrides,
  };
}

describe("resolvePreferredChatModel", () => {
  it("normalizes a legacy configured id to its provider-qualified model key", () => {
    expect(resolvePreferredChatModel(settings({ defaultModelId: "deepseek-v4-pro" }), usableModels)).toBe(
      "deepseek:deepseek-v4-pro",
    );
  });

  it("preserves the previous effective DeepSeek default when v2 has no explicit default", () => {
    expect(resolvePreferredChatModel(settings({ taskModels: { defaultChatModel: null, utilityModel: null, exploreModel: null } }), usableModels)).toBe(
      "deepseek:deepseek-v4-pro",
    );
  });
});
