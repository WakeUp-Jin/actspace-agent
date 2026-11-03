import { describe, expect, it, vi } from "vitest";
import type { ModelKey, UsableModelView } from "@actspace/shared";
import { createDesktopModelsHostPort } from "../runtime-v2/model-port";

const view = (key: ModelKey, extra: Partial<UsableModelView> = {}): UsableModelView => ({
  key, label: key.toUpperCase(), provider: "openrouter", apiModel: key, contextWindow: 200_000, thinkingDefault: false,
  capabilities: { input: ["text"], toolUse: "declared", reasoning: true, thinkingToggle: true, reasoningEfforts: ["low", "high"], reasoningDefaultEffort: "low" },
  ...extra,
});

describe("Desktop models host port", () => {
  it("lists the chat-usable models from the model store and has no subagent default yet", () => {
    const listUsableModels = vi.fn(() => [view("openrouter:openai/gpt-5.5", { connectionId: "c1", connectionLabel: "Relay" }), view("deepseek:v4", { thinkingDefault: true })]);
    const port = createDesktopModelsHostPort({ listUsableModels });
    expect(port.listUsableModels()).toEqual([
      { key: "openrouter:openai/gpt-5.5", label: "OPENROUTER:OPENAI/GPT-5.5", connectionLabel: "Relay", reasoningEfforts: ["low", "high"], defaultEffort: "low", thinkingDefault: false },
      { key: "deepseek:v4", label: "DEEPSEEK:V4", reasoningEfforts: ["low", "high"], defaultEffort: "low", thinkingDefault: true },
    ]);
    expect(listUsableModels).toHaveBeenCalledWith("chat");
    expect(port.subagentDefaultModel()).toBeNull();
  });

  it("reads the store on every call, so settings changes show without a restart", () => {
    let models = [view("deepseek:a")];
    const port = createDesktopModelsHostPort({ listUsableModels: () => models });
    expect(port.listUsableModels().map(model => model.key)).toEqual(["deepseek:a"]);
    models = [view("deepseek:a"), view("deepseek:b")];
    expect(port.listUsableModels().map(model => model.key)).toEqual(["deepseek:a", "deepseek:b"]);
  });

  it("returns an empty list for a model port without a list", () => {
    expect(createDesktopModelsHostPort({}).listUsableModels()).toEqual([]);
  });
});
