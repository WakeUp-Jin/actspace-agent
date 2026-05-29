import { describe, expect, it } from "vitest";
import { createLLMService } from "../factory";
import { DeepSeekService } from "../services/deepseek";
import { DeepSeekAnthropicService } from "../services/deepseek-anthropic";

describe("createLLMService", () => {
  it("creates OpenAI-compatible DeepSeek service when apiFormat is omitted", () => {
    const service = createLLMService({
      provider: "deepseek",
      apiKey: "sk",
      model: "deepseek-v4-flash",
    });

    expect(service).toBeInstanceOf(DeepSeekService);
  });

  it("creates Anthropic-compatible DeepSeek service when apiFormat is anthropic", () => {
    const service = createLLMService({
      provider: "deepseek",
      apiFormat: "anthropic",
      apiKey: "sk",
      model: "deepseek-v4-pro",
    });

    expect(service).toBeInstanceOf(DeepSeekAnthropicService);
  });
});
