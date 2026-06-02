import { describe, expect, it } from "vitest";
import { createLLMService } from "../factory";
import { AnthropicMessagesService } from "../services/anthropic-messages";
import { OpenAICompletionsService } from "../services/openai-completions";

describe("createLLMService", () => {
  it("creates OpenAI-compatible DeepSeek service when apiFormat is omitted", () => {
    const service = createLLMService({
      provider: "deepseek",
      apiKey: "sk",
      model: "deepseek-v4-flash",
    });

    expect(service).toBeInstanceOf(OpenAICompletionsService);
  });

  it("creates Anthropic-compatible DeepSeek service when apiFormat is anthropic", () => {
    const service = createLLMService({
      provider: "deepseek",
      apiFormat: "anthropic",
      apiKey: "sk",
      model: "deepseek-v4-pro",
    });

    expect(service).toBeInstanceOf(AnthropicMessagesService);
  });

  it("prefers api over legacy apiFormat", () => {
    const service = createLLMService({
      provider: "deepseek",
      api: "openai-completions",
      apiFormat: "anthropic",
      apiKey: "sk",
      model: "deepseek-v4-pro",
    });

    expect(service).toBeInstanceOf(OpenAICompletionsService);
  });
});
