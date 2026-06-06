import { describe, expect, it } from "vitest";
import { createToolManager } from "../index";
import { createExploreLLMService, type AgentEnvConfig } from "../../engine/create-agent-deps";
import type { LLMService } from "../../llm/types";

const stubLlm = {} as LLMService;

function baseEnv(overrides: Partial<AgentEnvConfig> = {}): AgentEnvConfig {
  return {
    deepseekApiKey: "sk-deepseek",
    deepseekApiFormat: "openai",
    kimiApiKey: "",
    disabledTools: [],
    ...overrides,
  };
}

describe("explore tool registration", () => {
  it("registers both agent and explore when an llm is available", () => {
    const manager = createToolManager({ workspaceRoot: "/tmp", llm: stubLlm });
    expect(manager.has("agent")).toBe(true);
    expect(manager.has("explore")).toBe(true);
  });

  it("falls back explore to the main llm when no dedicated exploreLlm is given", () => {
    const manager = createToolManager({ workspaceRoot: "/tmp", llm: stubLlm });
    expect(manager.has("explore")).toBe(true);
  });

  it("does not register explore when disabled", () => {
    const manager = createToolManager({ workspaceRoot: "/tmp", llm: stubLlm, disabledTools: ["explore"] });
    expect(manager.has("explore")).toBe(false);
    expect(manager.has("agent")).toBe(true);
  });

  it("registers explore from a dedicated exploreLlm even without a main llm", () => {
    const manager = createToolManager({ workspaceRoot: "/tmp", exploreLlm: stubLlm });
    expect(manager.has("agent")).toBe(false);
    expect(manager.has("explore")).toBe(true);
  });
});

describe("createExploreLLMService", () => {
  it("returns a service when the DeepSeek key is present (default flash)", () => {
    expect(createExploreLLMService(null, baseEnv())).toBeDefined();
  });

  it("returns undefined and falls back to main when no DeepSeek key", () => {
    expect(createExploreLLMService(null, baseEnv({ deepseekApiKey: "" }))).toBeUndefined();
  });
});
