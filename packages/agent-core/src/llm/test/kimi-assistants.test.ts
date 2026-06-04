import { afterEach, describe, expect, it, vi } from "vitest";
import { searchWithKimi } from "../kimi-assistants";
import { KimiService } from "../services/kimi";
import { createEmptyUsage } from "../../messages";
import type { AssistantMessage } from "../../messages";
import { AssistantMessageEventStream } from "../types";

function makeAssistantMessage(overrides: Partial<AssistantMessage>): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    model: "kimi-k2.6",
    provider: "kimi",
    usage: createEmptyUsage(),
    stopReason: "stop",
    timestamp: Date.now(),
    source: "llm",
    ...overrides,
  };
}

function mockStream(msg: AssistantMessage): AssistantMessageEventStream {
  async function* gen() {
    yield { type: "done" as const, message: msg };
  }
  return new AssistantMessageEventStream(gen());
}

describe("Kimi assistants", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns text directly if first response has text content", async () => {
    const response = makeAssistantMessage({
      content: [{ type: "text", text: "Moonshot AI is a company that develops Kimi." }],
      stopReason: "stop",
    });

    const streamSpy = vi.spyOn(KimiService.prototype, "streamWithBuiltinWebSearch")
      .mockReturnValueOnce(mockStream(response));

    const result = await searchWithKimi("Moonshot AI", {
      apiKey: "test-key",
      baseUrl: "https://api.moonshot.cn/v1",
      model: "kimi-k2.6",
    });

    expect(result.answer).toBe("Moonshot AI is a company that develops Kimi.");
    expect(streamSpy).toHaveBeenCalledTimes(1);
  });

  it("acknowledges tool_calls and gets final answer on second round", async () => {
    const toolCallResponse = makeAssistantMessage({
      content: [
        {
          type: "toolCall",
          id: "call_search",
          name: "$web_search",
          arguments: { query: "Moonshot AI" },
        },
      ],
      stopReason: "toolUse",
    });

    const finalResponse = makeAssistantMessage({
      content: [{ type: "text", text: "Moonshot AI result" }],
      stopReason: "stop",
    });

    const streamSpy = vi.spyOn(KimiService.prototype, "streamWithBuiltinWebSearch")
      .mockReturnValueOnce(mockStream(toolCallResponse))
      .mockReturnValueOnce(mockStream(finalResponse));

    const result = await searchWithKimi("Moonshot AI", {
      apiKey: "test-key",
      baseUrl: "https://api.moonshot.cn/v1",
      model: "kimi-k2.6",
    });

    expect(result.answer).toBe("Moonshot AI result");
    expect(streamSpy).toHaveBeenCalledTimes(2);

    // Verify tool result sends back arguments as-is (per Kimi docs)
    const secondCallMessages = streamSpy.mock.calls[1][0];
    expect(secondCallMessages).toContainEqual(
      expect.objectContaining({
        role: "tool",
        tool_call_id: "call_search",
        content: JSON.stringify({ query: "Moonshot AI" }),
      }),
    );
  });

  it("returns empty answer when API returns error", async () => {
    const errorResponse = makeAssistantMessage({
      content: [],
      stopReason: "error",
    });

    vi.spyOn(KimiService.prototype, "streamWithBuiltinWebSearch")
      .mockReturnValueOnce(mockStream(errorResponse));

    const result = await searchWithKimi("test query", {
      apiKey: "test-key",
      baseUrl: "https://api.moonshot.cn/v1",
      model: "kimi-k2.6",
    });

    expect(result.answer).toBe("");
  });

  it("returns fallback message when no text and no tool_calls", async () => {
    const emptyResponse = makeAssistantMessage({
      content: [],
      stopReason: "stop",
    });

    vi.spyOn(KimiService.prototype, "streamWithBuiltinWebSearch")
      .mockReturnValueOnce(mockStream(emptyResponse));

    const result = await searchWithKimi("nonexistent query xyz", {
      apiKey: "test-key",
      baseUrl: "https://api.moonshot.cn/v1",
      model: "kimi-k2.6",
    });

    expect(result.answer).toContain("No search results found");
  });
});
