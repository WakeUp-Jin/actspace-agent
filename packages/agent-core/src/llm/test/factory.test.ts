import { describe, expect, it, vi } from "vitest";
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

  it("routes OpenRouter through the existing OpenAI-compatible service", () => {
    const service = createLLMService({
      provider: "openrouter",
      api: "openai-completions",
      apiKey: "sk-or-test",
      model: "anthropic/claude-sonnet-4",
    });

    expect(service).toBeInstanceOf(OpenAICompletionsService);
    expect((service as any).client._options.defaultHeaders).toMatchObject({
      "X-OpenRouter-Title": "Actspace",
    });
  });

  it("injects the configured fetch into both protocol SDK clients", () => {
    const customFetch = vi.fn() as any;
    const openai = createLLMService({
      provider: "openrouter",
      api: "openai-completions",
      apiKey: "sk-or-test",
      model: "anthropic/claude-sonnet-4",
      transport: { fetch: customFetch },
    });
    const anthropic = createLLMService({
      provider: "deepseek",
      api: "anthropic-messages",
      apiKey: "sk-ds-test",
      model: "deepseek-v4-pro",
      transport: { fetch: customFetch },
    });

    expect((openai as any).client._options.fetch).toBe(customFetch);
    expect((anthropic as any).client._options.fetch).toBe(customFetch);
  });
});
