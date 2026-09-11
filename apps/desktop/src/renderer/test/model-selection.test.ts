import { describe, expect, it } from "vitest";
import type { AppSettings, UsableModelView } from "@actspace/shared";
import { resolvePreferredChatModel } from "../model-selection";

const usableModels: UsableModelView[] = [
  {
    key: "deepseek:deepseek-flash",
    label: "deepseek-flash",
    provider: "deepseek",
    apiModel: "deepseek-v4-flash",
    contextWindow: 1_000_000,
    thinkingDefault: false,
    capabilities: { input: ["text"], toolUse: "verified", reasoning: false, thinkingToggle: false },
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
      "deepseek:deepseek-flash",
    );
  });

  it("uses the current DeepSeek Flash default when v2 has no explicit default", () => {
    expect(resolvePreferredChatModel(settings({ taskModels: { defaultChatModel: null, utilityModel: null, exploreModel: null } }), usableModels)).toBe(
      "deepseek:deepseek-flash",
    );
  });
});
