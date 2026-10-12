import { describe, expect, it } from "vitest";
import type { InstalledModelView } from "@actspace/shared";
import { buildModelSelectorGroups, formatContextWindow, splitVendorLabel, summarizeEnabledModels } from "../components/settings/model-selector-groups";

function model(label: string, enabled: boolean, extra: { apiModel?: string; customLabel?: string; contextWindow?: number | null } = {}): InstalledModelView {
  const apiModel = extra.apiModel ?? label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    definition: { key: `openrouter:${apiModel}`, provider: "openrouter", api: "openai-completions", apiModel, label, source: "provider-catalog", contextWindow: extra.contextWindow ?? null, capabilities: { input: ["text"], toolUse: "declared", reasoning: false, thinkingToggle: false } },
    settings: { enabled, customLabel: extra.customLabel },
    unavailableReasons: {},
  } as unknown as InstalledModelView;
}

describe("splitVendorLabel", () => {
  it("splits an OpenRouter-style vendor prefix", () => {
    expect(splitVendorLabel("Anthropic: Claude Opus 5.5")).toEqual({ vendor: "Anthropic", name: "Claude Opus 5.5" });
    expect(splitVendorLabel("通义：Qwen 4")).toEqual({ vendor: "通义", name: "Qwen 4" });
  });

  it("leaves labels without a prefix alone", () => {
    expect(splitVendorLabel("DeepSeek V4 Pro")).toEqual({ vendor: null, name: "DeepSeek V4 Pro" });
  });
});

describe("buildModelSelectorGroups", () => {
  const models = [
    model("OpenAI: GPT-6.1 Sol", false),
    model("Anthropic: Claude Haiku 5.5", false),
    model("OpenAI: GPT-5.6 Luna", true),
    model("Anthropic: Claude Opus 5.5", true),
    model("Google: Gemini 4 Pro", false),
  ];

  it("groups by vendor, putting groups and models that are enabled first", () => {
    const groups = buildModelSelectorGroups(models);
    expect(groups.map((group) => [group.vendor, group.enabledCount])).toEqual([["Anthropic", 1], ["OpenAI", 1], ["Google", 0]]);
    expect(groups[0].entries.map((entry) => entry.name)).toEqual(["Claude Opus 5.5", "Claude Haiku 5.5"]);
  });

  it("does not group when there is only one vendor", () => {
    const groups = buildModelSelectorGroups([model("Anthropic: Claude Opus 5.5", true), model("Anthropic: Claude Haiku 5.5", false)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].vendor).toBeNull();
    expect(groups[0].entries.map((entry) => entry.name)).toEqual(["Claude Opus 5.5", "Claude Haiku 5.5"]);
  });

  it("filters by query across the full label and api model, and by enabled state", () => {
    expect(buildModelSelectorGroups(models, { query: "openai" }).flatMap((group) => group.entries.map((entry) => entry.name))).toEqual(["GPT-5.6 Luna", "GPT-6.1 Sol"]);
    expect(buildModelSelectorGroups(models, { query: "gemini-4" }).flatMap((group) => group.entries.map((entry) => entry.name))).toEqual(["Gemini 4 Pro"]);
    expect(buildModelSelectorGroups(models, { onlyEnabled: true }).flatMap((group) => group.entries.map((entry) => entry.name))).toEqual(["Claude Opus 5.5", "GPT-5.6 Luna"]);
  });

  it("keeps a user's custom label verbatim", () => {
    const [group] = buildModelSelectorGroups([model("Anthropic: Claude Opus 5.5", true, { customLabel: "主力: Opus" })]);
    expect(group.entries[0].name).toBe("主力: Opus");
  });
});

describe("summarizeEnabledModels", () => {
  it("lists the first enabled short names and counts the rest", () => {
    const summary = summarizeEnabledModels([
      model("Anthropic: Claude Opus 5.5", true),
      model("Anthropic: Claude Haiku 5.5", true),
      model("OpenAI: GPT-5.6 Luna", true),
      model("OpenAI: GPT-6.1 Sol", false),
    ]);
    expect(summary).toEqual({ enabled: 3, total: 4, names: ["Claude Haiku 5.5", "Claude Opus 5.5"], rest: 1 });
  });
});

describe("formatContextWindow", () => {
  it("formats token counts compactly", () => {
    expect(formatContextWindow(200_000)).toBe("200K");
    expect(formatContextWindow(1_000_000)).toBe("1M");
    expect(formatContextWindow(1_048_576)).toBe("1M");
    expect(formatContextWindow(null)).toBeNull();
  });
});
