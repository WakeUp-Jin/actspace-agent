import { afterEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../../messages";
import { OpenAIResponsesService } from "../services/openai-responses";

const context: Context = {
  systemPrompt: "Stable instructions",
  messages: [{ role: "user", content: "Reply with CONNECTED.", timestamp: 1 }],
  tools: [{ name: "read_file", description: "Read a file", parameters: { type: "object" } }],
};

function createMockStream(events: Record<string, unknown>[]) {
  async function* generate() {
    for (const event of events) yield event;
  }
  return generate();
}

function completedResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "resp_123",
    model: "gpt-5.6-sol",
    status: "completed",
    usage: {
      input_tokens: 3610,
      input_tokens_details: { cached_tokens: 2560, cache_write_tokens: 128 },
      output_tokens: 5,
      output_tokens_details: { reasoning_tokens: 2 },
      total_tokens: 3615,
    },
    ...overrides,
  };
}

describe("OpenAIResponsesService", () => {
  afterEach(() => vi.restoreAllMocks());

  it("streams text and normalizes OpenAI Responses cache usage", async () => {
    const service = new OpenAIResponsesService({
      provider: "openrouter",
      api: "openai-responses",
      apiKey: "test-key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.6-sol",
      promptCacheKey: "actspace:cache-key",
    });
    const createSpy = vi.spyOn(service["client"].responses, "create").mockResolvedValue(createMockStream([
      { type: "response.output_text.delta", delta: "CON" },
      { type: "response.output_text.delta", delta: "NECTED" },
      { type: "response.completed", response: completedResponse() },
    ]) as any);

    const result = await service.complete(context);

    expect(result.content).toEqual([{ type: "text", text: "CONNECTED" }]);
    expect(result.api).toBe("openai-responses");
    expect(result.responseId).toBe("resp_123");
    expect(result.usage).toMatchObject({
      input: 3610,
      output: 5,
      cacheRead: 2560,
      cacheWrite: 128,
      cacheHit: 2560,
      cacheMiss: 1050,
      reasoning: 2,
      totalTokens: 3615,
    });
    expect(createSpy.mock.calls[0][0]).toMatchObject({
      model: "gpt-5.6-sol",
      instructions: "Stable instructions",
      stream: true,
      store: false,
      prompt_cache_key: "actspace:cache-key",
      include: ["reasoning.encrypted_content"],
      tools: [{ type: "function", name: "read_file", strict: false }],
    });
    expect(createSpy.mock.calls[0][0]).not.toHaveProperty("previous_response_id");
    expect(createSpy.mock.calls[0][0]).not.toHaveProperty("reasoning");
  });

  it("preserves encrypted reasoning state for the following tool-result request", async () => {
    const service = new OpenAIResponsesService({
      provider: "openrouter",
      api: "openai-responses",
      apiKey: "test-key",
      model: "gpt-5.6-sol",
    });
    vi.spyOn(service["client"].responses, "create").mockResolvedValue(createMockStream([
      {
        type: "response.output_item.done",
        output_index: 0,
        item: {
          id: "rs_123",
          type: "reasoning",
          summary: [],
          encrypted_content: "encrypted-state",
          status: "completed",
        },
      },
      {
        type: "response.output_item.done",
        output_index: 1,
        item: { type: "function_call", call_id: "call_read", name: "read_file", arguments: "{\"path\":\"README.md\"}" },
      },
      { type: "response.completed", response: completedResponse() },
    ]) as any);

    const result = await service.complete(context);
    expect(result.content).toContainEqual(expect.objectContaining({
      type: "thinking",
      thinking: "",
      signature: expect.stringContaining("openai-responses-reasoning:"),
    }));
    expect(result.content).toContainEqual(expect.objectContaining({
      type: "toolCall",
      id: "call_read",
    }));
  });

  it("streams function calls with call_id as the Agent tool call id", async () => {
    const service = new OpenAIResponsesService({
      provider: "openrouter",
      api: "openai-responses",
      apiKey: "test-key",
      model: "gpt-5.6-sol-high",
    });
    vi.spyOn(service["client"].responses, "create").mockResolvedValue(createMockStream([
      {
        type: "response.output_item.added",
        output_index: 0,
        item: { type: "function_call", call_id: "call_read", name: "read_file", arguments: "" },
      },
      { type: "response.function_call_arguments.delta", output_index: 0, item_id: "item_1", delta: "{\"path\":" },
      { type: "response.function_call_arguments.delta", output_index: 0, item_id: "item_1", delta: "\"README.md\"}" },
      { type: "response.completed", response: completedResponse({ model: "gpt-5.6-sol-high" }) },
    ]) as any);

    const result = await service.complete({ messages: context.messages, tools: context.tools });

    expect(result.stopReason).toBe("toolUse");
    expect(result.content).toContainEqual({
      type: "toolCall",
      id: "call_read",
      name: "read_file",
      arguments: { path: "README.md" },
    });
  });

  it("maps max-output incomplete responses to length", async () => {
    const service = new OpenAIResponsesService({
      provider: "openrouter",
      api: "openai-responses",
      apiKey: "test-key",
      model: "gpt-5.6-sol",
    });
    vi.spyOn(service["client"].responses, "create").mockResolvedValue(createMockStream([
      { type: "response.output_text.delta", delta: "partial" },
      {
        type: "response.incomplete",
        response: completedResponse({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }),
      },
    ]) as any);

    const result = await service.complete(context);
    expect(result.stopReason).toBe("length");
    expect(result.content).toEqual([{ type: "text", text: "partial" }]);
  });

  it("returns an auth error without calling the SDK when the key is missing", async () => {
    const service = new OpenAIResponsesService({
      provider: "openrouter",
      api: "openai-responses",
      apiKey: "",
      model: "gpt-5.6-sol",
    });
    const createSpy = vi.spyOn(service["client"].responses, "create");

    const result = await service.complete(context);

    expect(createSpy).not.toHaveBeenCalled();
    expect(result.stopReason).toBe("error");
    expect(result.errorKind).toBe("auth");
  });
});
