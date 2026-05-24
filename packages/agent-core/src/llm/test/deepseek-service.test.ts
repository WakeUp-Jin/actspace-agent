import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepSeekService } from "../services/deepseek";
import type { Context } from "../../messages";

const context: Context = {
  messages: [{ role: "user", content: "Reply with CONNECTED.", timestamp: Date.now() }],
};

function streamResponse(frames: string[]): Response {
  const body = frames.map((frame) => `data: ${frame}\n\n`).join("");
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("DeepSeekService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams text and captures token usage from chat completions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        JSON.stringify({ choices: [{ delta: { content: "CON" }, finish_reason: null }] }),
        JSON.stringify({ choices: [{ delta: { content: "NECTED" }, finish_reason: "stop" }] }),
        JSON.stringify({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }),
        "[DONE]",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const llm = new DeepSeekService({ provider: "deepseek", apiKey: "test-key", model: "deepseek-chat" });

    const result = await llm.complete(context);

    expect(result.content).toEqual([{ type: "text", text: "CONNECTED" }]);
    expect(result.provider).toBe("deepseek");
    expect(result.usage.totalTokens).toBe(5);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      }),
    );
  });

  it("keeps DeepSeek request model controlled by the injected config", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        JSON.stringify({ choices: [{ delta: { content: "reasoned" }, finish_reason: "stop" }] }),
        "[DONE]",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const llm = new DeepSeekService({ provider: "deepseek", apiKey: "test-key", model: "deepseek-reasoner" });

    await llm.complete(context, { thinkingEnabled: true });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.model).toBe("deepseek-reasoner");
  });

  it("reassembles streamed tool calls for the execution engine", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      streamResponse([
        JSON.stringify({
          choices: [{
            delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "read_file", arguments: "{\"path\":" } }] },
            finish_reason: null,
          }],
        }),
        JSON.stringify({
          choices: [{
            delta: { tool_calls: [{ index: 0, function: { arguments: "\"README.md\"}" } }] },
            finish_reason: "tool_calls",
          }],
        }),
        "[DONE]",
      ]),
    ));
    const llm = new DeepSeekService({ provider: "deepseek", apiKey: "test-key", model: "deepseek-chat" });

    const result = await llm.complete(context);

    expect(result.stopReason).toBe("toolUse");
    expect(result.content).toContainEqual({
      type: "toolCall",
      id: "call_1",
      name: "read_file",
      arguments: { path: "README.md" },
    });
  });

  it("returns a categorized authentication error without an API key", async () => {
    const llm = new DeepSeekService({ provider: "deepseek", apiKey: "", model: "deepseek-chat" });

    await expect(llm.complete(context)).rejects.toMatchObject({ kind: "auth" });
  });
});
