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

  it("round-trips Kimi builtin web search tool calls before returning text", async () => {
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
      baseUrl: "https://api.moonshot.ai/v1",
      model: "kimi-k2.6",
    });

    expect(result.answer).toBe("Moonshot AI result");
    expect(streamSpy).toHaveBeenCalledTimes(2);

    const secondCallMessages = streamSpy.mock.calls[1][0];
    expect(secondCallMessages).toContainEqual(
      expect.objectContaining({
        role: "tool",
        tool_call_id: "call_search",
      }),
    );
  });
});
