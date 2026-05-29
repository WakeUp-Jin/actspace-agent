import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepSeekAnthropicService } from "../services/deepseek-anthropic";
import type { Context } from "../../messages";

const context: Context = {
  systemPrompt: "You are helpful.",
  messages: [{ role: "user", content: "Read https://example.com", timestamp: Date.now() }],
  tools: [
    {
      name: "web_search",
      description: "Kimi-backed local web search should not be sent as a client tool in Anthropic format",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
    {
      name: "read_file",
      description: "Read a file",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
  ],
};

function createAnthropicMessage(overrides?: Record<string, unknown>) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "deepseek-v4-pro",
    stop_reason: "end_turn",
    stop_sequence: null,
    content: [
      { type: "thinking", thinking: "I should search.", signature: "sig" },
      { type: "server_tool_use", id: "srv_1", name: "web_search", input: {}, caller: { type: "direct" } },
      { type: "web_search_tool_result", tool_use_id: "srv_1", content: [], caller: { type: "direct" } },
      { type: "text", text: "CONNECTED", citations: null },
    ],
    usage: {
      input_tokens: 20,
      output_tokens: 10,
      cache_read_input_tokens: 4,
      cache_creation_input_tokens: 0,
      cache_creation: null,
      output_tokens_details: { thinking_tokens: 3 },
      server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 },
      service_tier: "standard",
      inference_geo: null,
    },
    ...overrides,
  };
}

describe("DeepSeekAnthropicService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("declares Anthropic server web search plus local client tools and maps the response", async () => {
    const llm = new DeepSeekAnthropicService({
      provider: "deepseek",
      apiFormat: "anthropic",
      apiKey: "test-key",
      baseUrl: "https://api.deepseek.com/anthropic",
      model: "deepseek-v4-pro",
    });
    const createSpy = vi
      .spyOn(llm["client"].messages, "create")
      .mockResolvedValue(createAnthropicMessage() as any);

    const result = await llm.complete(context, { thinkingEnabled: true });

    expect(result.provider).toBe("deepseek");
    expect(result.content).toEqual([
      { type: "thinking", thinking: "I should search.", signature: "sig" },
      { type: "text", text: "CONNECTED" },
    ]);
    expect(result.usage.totalTokens).toBe(30);
    expect(result.usage.reasoning).toBe(3);
    expect(result.usage.serverToolUse).toEqual({ webSearchRequests: 1, webFetchRequests: 0 });

    const params = createSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(params).toMatchObject({
      model: "deepseek-v4-pro",
      system: "You are helpful.",
      messages: [{ role: "user", content: "Read https://example.com" }],
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 3 },
        {
          name: "read_file",
          description: "Read a file",
          input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
        },
      ],
    });
    expect((params.tools as any[]).filter((tool) => tool.name === "web_search")).toHaveLength(1);
    expect(params.thinking).toBeUndefined();
  });

  it("maps Anthropic client tool_use into an internal tool call", async () => {
    const llm = new DeepSeekAnthropicService({
      provider: "deepseek",
      apiFormat: "anthropic",
      apiKey: "test-key",
      model: "deepseek-v4-pro",
    });
    vi
      .spyOn(llm["client"].messages, "create")
      .mockResolvedValue(createAnthropicMessage({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "README.md" }, caller: { type: "direct" } },
        ],
      }) as any);

    const events = [];
    for await (const event of llm.stream(context)) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: "tool_call_delta",
      index: 0,
      toolCallId: "toolu_1",
      toolName: "read_file",
      delta: JSON.stringify({ path: "README.md" }),
    });
    const done = events.find((event) => event.type === "done") as any;
    expect(done.message.stopReason).toBe("toolUse");
    expect(done.message.content).toEqual([
      { type: "toolCall", id: "toolu_1", name: "read_file", arguments: { path: "README.md" } },
    ]);
  });

  it("can disable thinking for Anthropic requests", async () => {
    const llm = new DeepSeekAnthropicService({
      provider: "deepseek",
      apiFormat: "anthropic",
      apiKey: "test-key",
      model: "deepseek-v4-pro",
    });
    const createSpy = vi
      .spyOn(llm["client"].messages, "create")
      .mockResolvedValue(createAnthropicMessage({ content: [{ type: "text", text: "plain", citations: null }] }) as any);

    await llm.complete(context, { thinkingEnabled: false });

    const params = createSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(params.thinking).toEqual({ type: "disabled" });
  });

  it("returns an error AssistantMessage with auth info when API key is missing", async () => {
    const llm = new DeepSeekAnthropicService({
      provider: "deepseek",
      apiFormat: "anthropic",
      apiKey: "",
      model: "deepseek-v4-pro",
    });

    const result = await llm.complete(context);

    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toContain("API key not configured");
  });
});
