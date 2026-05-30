import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepSeekAnthropicService } from "../services/deepseek-anthropic";
import type { AssistantMessageEvent } from "../types";
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

/** 把一组 Anthropic raw stream events 包装成 client.messages.stream 返回的 async iterable。 */
function streamOf(events: unknown[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
  };
}

function messageStart(usage: Record<string, unknown>) {
  return {
    type: "message_start",
    message: {
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        ...usage,
      },
    },
  };
}

function messageDelta(stopReason: string, usage: Record<string, unknown>) {
  return {
    type: "message_delta",
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: 0, ...usage },
  };
}

async function collect(stream: AsyncIterable<AssistantMessageEvent>): Promise<AssistantMessageEvent[]> {
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe("DeepSeekAnthropicService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("declares Anthropic server web search plus local client tools and maps the streamed response", async () => {
    const llm = new DeepSeekAnthropicService({
      provider: "deepseek",
      apiFormat: "anthropic",
      apiKey: "test-key",
      baseUrl: "https://api.deepseek.com/anthropic",
      model: "deepseek-v4-pro",
    });
    const streamSpy = vi.spyOn(llm["client"].messages, "stream").mockReturnValue(
      streamOf([
        messageStart({ input_tokens: 20, cache_read_input_tokens: 4 }),
        { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "I should search." } },
        { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig" } },
        { type: "content_block_stop", index: 0 },
        { type: "content_block_start", index: 1, content_block: { type: "server_tool_use", id: "srv_1", name: "web_search", input: {} } },
        { type: "content_block_stop", index: 1 },
        { type: "content_block_start", index: 2, content_block: { type: "web_search_tool_result", tool_use_id: "srv_1", content: [] } },
        { type: "content_block_stop", index: 2 },
        { type: "content_block_start", index: 3, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 3, delta: { type: "text_delta", text: "CONNECTED" } },
        { type: "content_block_stop", index: 3 },
        messageDelta("end_turn", {
          output_tokens: 10,
          output_tokens_details: { thinking_tokens: 3 },
          server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 },
        }),
        { type: "message_stop" },
      ]) as never,
    );

    const result = await llm.complete(context, { thinkingEnabled: true });

    expect(result.provider).toBe("deepseek");
    expect(result.content).toEqual([
      { type: "thinking", thinking: "I should search.", signature: "sig" },
      { type: "text", text: "CONNECTED" },
    ]);
    // prompt = input_tokens(20) + cache_read(4) + cache_creation(0) = 24；total = 24 + output(10) = 34。
    expect(result.usage.totalTokens).toBe(34);
    expect(result.usage.reasoning).toBe(3);
    expect(result.usage.serverToolUse).toEqual({ webSearchRequests: 1, webFetchRequests: 0 });

    const params = streamSpy.mock.calls[0][0] as Record<string, unknown>;
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
    expect((params.tools as { name: string }[]).filter((tool) => tool.name === "web_search")).toHaveLength(1);
    expect(params.thinking).toBeUndefined();
  });

  it("emits text deltas incrementally as the stream arrives", async () => {
    const llm = new DeepSeekAnthropicService({
      provider: "deepseek",
      apiFormat: "anthropic",
      apiKey: "test-key",
      model: "deepseek-v4-pro",
    });
    vi.spyOn(llm["client"].messages, "stream").mockReturnValue(
      streamOf([
        messageStart({ input_tokens: 3 }),
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " world" } },
        { type: "content_block_stop", index: 0 },
        messageDelta("end_turn", { output_tokens: 4 }),
        { type: "message_stop" },
      ]) as never,
    );

    const events = await collect(llm.stream(context));

    const textDeltas = events.filter((e) => e.type === "text_delta").map((e) => (e as { delta: string }).delta);
    expect(textDeltas).toEqual(["Hel", "lo", " world"]);

    const done = events.at(-1);
    expect(done?.type).toBe("done");
    expect((done as { message: { content: unknown } }).message.content).toEqual([
      { type: "text", text: "Hello world" },
    ]);
  });

  it("maps a streamed Anthropic client tool_use into an internal tool call", async () => {
    const llm = new DeepSeekAnthropicService({
      provider: "deepseek",
      apiFormat: "anthropic",
      apiKey: "test-key",
      model: "deepseek-v4-pro",
    });
    vi.spyOn(llm["client"].messages, "stream").mockReturnValue(
      streamOf([
        messageStart({ input_tokens: 5 }),
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "read_file", input: {} } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"path":' } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '"README.md"}' } },
        { type: "content_block_stop", index: 0 },
        messageDelta("tool_use", { output_tokens: 3 }),
        { type: "message_stop" },
      ]) as never,
    );

    const events = await collect(llm.stream(context));

    // 首个 chunk 即带出 id/name（delta 为空），随后逐段拼接 partial_json
    expect(events).toContainEqual({
      type: "tool_call_delta",
      index: 0,
      toolCallId: "toolu_1",
      toolName: "read_file",
      delta: "",
    });
    expect(events).toContainEqual({
      type: "tool_call_delta",
      index: 0,
      toolCallId: "toolu_1",
      toolName: "read_file",
      delta: '{"path":',
    });

    const done = events.find((event) => event.type === "done") as { message: { stopReason: string; content: unknown } };
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
    const streamSpy = vi.spyOn(llm["client"].messages, "stream").mockReturnValue(
      streamOf([
        messageStart({ input_tokens: 1 }),
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "plain" } },
        { type: "content_block_stop", index: 0 },
        messageDelta("end_turn", { output_tokens: 2 }),
        { type: "message_stop" },
      ]) as never,
    );

    await llm.complete(context, { thinkingEnabled: false });

    const params = streamSpy.mock.calls[0][0] as Record<string, unknown>;
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

  it("preserves partial streamed content when the stream errors mid-flight", async () => {
    const llm = new DeepSeekAnthropicService({
      provider: "deepseek",
      apiFormat: "anthropic",
      apiKey: "test-key",
      model: "deepseek-v4-pro",
    });
    vi.spyOn(llm["client"].messages, "stream").mockReturnValue(
      {
        async *[Symbol.asyncIterator]() {
          yield messageStart({ input_tokens: 2 });
          yield { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } };
          yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "partial" } };
          throw new Error("connection dropped");
        },
      } as never,
    );

    const result = await llm.complete(context);

    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toContain("connection dropped");
    expect(result.content).toEqual([{ type: "text", text: "partial" }]);
  });
});
