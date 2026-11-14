import { describe, expect, it } from "vitest";
import { currentModelHostPort, EMPTY_MODELS_HOST_PORT, MODEL_REASONING_EFFORTS, usableModelSummary } from "../index";

const capabilities = { input: ["text" as const], toolUse: "declared" as const, reasoning: true, thinkingToggle: true };

describe("models host port", () => {
  it("summarizes a usable model with its efforts, default effort and connection", () => {
    expect(
      usableModelSummary({
        key: "openrouter:openai/gpt-5.5",
        label: "GPT-5.5",
        connectionLabel: "Work relay",
        thinkingDefault: true,
        capabilities: { ...capabilities, reasoningEfforts: ["low", "high"], reasoningDefaultEffort: "high" },
      }),
    ).toEqual({
      key: "openrouter:openai/gpt-5.5",
      label: "GPT-5.5",
      connectionLabel: "Work relay",
      reasoningEfforts: ["low", "high"],
      defaultEffort: "high",
      thinkingDefault: true,
    });
  });

  it("expands an open effort list and leaves models without effort control empty", () => {
    expect(
      usableModelSummary({
        key: "deepseek:a",
        label: "A",
        thinkingDefault: false,
        capabilities: { ...capabilities, reasoningEfforts: null },
      }).reasoningEfforts,
    ).toEqual([...MODEL_REASONING_EFFORTS]);
    const none = usableModelSummary({ key: "deepseek:b", label: "B", thinkingDefault: false, capabilities });
    expect(none.reasoningEfforts).toEqual([]);
    expect(none).not.toHaveProperty("defaultEffort");
    expect(none).not.toHaveProperty("connectionLabel");
  });

  it("publishes an empty port for hosts without models", () => {
    expect(EMPTY_MODELS_HOST_PORT.listUsableModels()).toEqual([]);
    expect(EMPTY_MODELS_HOST_PORT.subagentDefaultModel()).toBeNull();
  });

  it("gives CLI hosts a list of just the configured model", () => {
    const port = currentModelHostPort("deepseek/deepseek-chat");
    expect(port.listUsableModels()).toEqual([
      { key: "deepseek/deepseek-chat", label: "deepseek/deepseek-chat", reasoningEfforts: [], thinkingDefault: false },
    ]);
    expect(port.subagentDefaultModel()).toBeNull();
    expect(currentModelHostPort(undefined).listUsableModels()).toEqual([]);
  });
});
