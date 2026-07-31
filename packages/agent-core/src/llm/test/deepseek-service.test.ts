import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepSeekService } from "../services/deepseek";
import type { Context } from "../../messages";

const context: Context = {
  messages: [{ role: "user", content: "Reply with CONNECTED.", timestamp: Date.now() }],
};

function createMockStream(chunks: Record<string, unknown>[]) {
  async function* gen() {
    for (const chunk of chunks) {
      yield chunk;
    }
  }
  return gen();
}

describe("DeepSeekService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("streams text and captures token usage from chat completions", async () => {
    const llm = new DeepSeekService({ provider: "deepseek", apiKey: "test-key", model: "deepseek-chat" });
    const mockStream = createMockStream([
      { choices: [{ delta: { content: "CON" }, finish_reason: null }] },
      { choices: [{ delta: { content: "NECTED" }, finish_reason: "stop" }] },
      {
        choices: [],
        usage: {
          prompt_tokens: 3,
          completion_tokens: 2,
          total_tokens: 5,
          prompt_cache_hit_tokens: 1,
          prompt_cache_miss_tokens: 2,
          completion_tokens_details: { reasoning_tokens: 1 },
        },
      },
    ]);

    const createSpy = vi.spyOn(llm["client"].chat.completions, "create").mockResolvedValue(mockStream as any);

    const result = await llm.complete(context);

    expect(result.content).toEqual([{ type: "text", text: "CONNECTED" }]);
    expect(result.provider).toBe("deepseek");
    expect(result.usage.totalTokens).toBe(5);
    expect(result.usage.cacheHit).toBe(1);
    expect(result.usage.cacheMiss).toBe(2);
    expect(result.usage.reasoning).toBe(1);
    expect(createSpy.mock.calls[0][0]).toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "max",
    });
  });

  it("keeps DeepSeek request model controlled by the injected config", async () => {
    const llm = new DeepSeekService({ provider: "deepseek", apiKey: "test-key", model: "deepseek-reasoner" });
    const mockStream = createMockStream([
      { choices: [{ delta: { content: "reasoned" }, finish_reason: "stop" }] },
    ]);

    const createSpy = vi.spyOn(llm["client"].chat.completions, "create").mockResolvedValue(mockStream as any);

    await llm.complete(context, { thinkingEnabled: true });

    const params = createSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(params.model).toBe("deepseek-reasoner");
    expect(params.thinking).toEqual({ type: "enabled" });
    expect(params.reasoning_effort).toBe("max");
  });

  it("maps explicit DeepSeek effort and thinking-off requests", async () => {
    const llm = new DeepSeekService({ provider: "deepseek", apiKey: "test-key", model: "deepseek-chat" });
    const createSpy = vi.spyOn(llm["client"].chat.completions, "create")
      .mockResolvedValueOnce(createMockStream([{ choices: [{ delta: { content: "high" }, finish_reason: "stop" }] }]) as any)
      .mockResolvedValueOnce(createMockStream([{ choices: [{ delta: { content: "off" }, finish_reason: "stop" }] }]) as any);

    await llm.complete(context, { thinkingEnabled: true, reasoningEffort: "high" });
    await llm.complete(context, { thinkingEnabled: false });

    expect(createSpy.mock.calls[0][0]).toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "high",
    });
    expect(createSpy.mock.calls[1][0]).toMatchObject({ thinking: { type: "disabled" } });
    expect(createSpy.mock.calls[1][0]).not.toHaveProperty("reasoning_effort");
  });

  it("reassembles streamed tool calls for the execution engine", async () => {
    const llm = new DeepSeekService({ provider: "deepseek", apiKey: "test-key", model: "deepseek-chat" });
    const mockStream = createMockStream([
      {
        choices: [{
          delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "read_file", arguments: "{\"path\":" } }] },
          finish_reason: null,
        }],
      },
      {
        choices: [{
          delta: { tool_calls: [{ index: 0, function: { arguments: "\"README.md\"}" } }] },
          finish_reason: "tool_calls",
        }],
      },
    ]);

    vi.spyOn(llm["client"].chat.completions, "create").mockResolvedValue(mockStream as any);

    const result = await llm.complete(context);

    expect(result.stopReason).toBe("toolUse");
    expect(result.content).toContainEqual({
      type: "toolCall",
      id: "call_1",
      name: "read_file",
      arguments: { path: "README.md" },
    });
  });

  it("returns an error AssistantMessage with auth info when API key is missing", async () => {
    const llm = new DeepSeekService({ provider: "deepseek", apiKey: "", model: "deepseek-chat" });

    const result = await llm.complete(context);
    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toContain("API key not configured");
  });
});
