import { afterEach, describe, expect, it, vi } from "vitest";
import { KimiService } from "../services/kimi";
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

describe("KimiService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams text from Kimi chat completions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        JSON.stringify({ choices: [{ delta: { content: "CON" }, finish_reason: null }] }),
        JSON.stringify({ choices: [{ delta: { content: "NECTED" }, finish_reason: "stop" }] }),
        "[DONE]",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const llm = new KimiService({ provider: "kimi", apiKey: "test-key", model: "kimi-k2.6" });

    const result = await llm.complete(context);

    expect(result.content).toEqual([{ type: "text", text: "CONNECTED" }]);
    expect(result.provider).toBe("kimi");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.moonshot.ai/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      }),
    );
  });

  it("declares builtin web search and disables thinking for search subcalls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        JSON.stringify({ choices: [{ delta: { content: "searched" }, finish_reason: "stop" }] }),
        "[DONE]",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const llm = new KimiService({ provider: "kimi", apiKey: "test-key", model: "kimi-k2.6" });

    await llm.streamWithBuiltinWebSearch([{ role: "user", content: "latest news" }]).result();

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.tools).toEqual([
      {
        type: "builtin_function",
        function: { name: "$web_search" },
      },
    ]);
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("can disable thinking for ordinary Kimi requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        JSON.stringify({ choices: [{ delta: { content: "plain" }, finish_reason: "stop" }] }),
        "[DONE]",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const llm = new KimiService({ provider: "kimi", apiKey: "test-key", model: "kimi-k2.6" });

    await llm.complete(context, { thinkingEnabled: false });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("returns a categorized authentication error without an API key", async () => {
    const llm = new KimiService({ provider: "kimi", apiKey: "", model: "kimi-k2.6" });

    await expect(llm.complete(context)).rejects.toMatchObject({ kind: "auth" });
  });
});
