import { afterEach, describe, expect, it, vi } from "vitest";
import { searchWithKimi } from "../kimi-assistants/client";

function streamResponse(frames: string[]): Response {
  const body = frames.map((frame) => `data: ${frame}\n\n`).join("");
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("Kimi assistants", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips Kimi builtin web search tool calls before returning text", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        streamResponse([
          JSON.stringify({
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  id: "call_search",
                  function: { name: "$web_search", arguments: "{\"query\":\"Moonshot AI\"}" },
                }],
              },
              finish_reason: "tool_calls",
            }],
          }),
          "[DONE]",
        ]),
      )
      .mockResolvedValueOnce(
        streamResponse([
          JSON.stringify({ choices: [{ delta: { content: "Moonshot AI result" }, finish_reason: "stop" }] }),
          "[DONE]",
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchWithKimi("Moonshot AI", {
      apiKey: "test-key",
      baseUrl: "https://api.moonshot.ai/v1",
      model: "kimi-k2.6",
    });

    expect(result.answer).toBe("Moonshot AI result");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(secondBody.messages).toContainEqual({
      role: "tool",
      tool_call_id: "call_search",
      name: "$web_search",
      content: "{\"query\":\"Moonshot AI\"}",
    });
  });
});
