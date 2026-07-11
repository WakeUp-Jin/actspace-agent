import { afterEach, describe, expect, it, vi } from "vitest";
import { KimiService } from "../services/kimi";
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

describe("KimiService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("streams text from Kimi chat completions", async () => {
    const llm = new KimiService({ provider: "kimi", apiKey: "test-key", model: "kimi-k2.6" });
    const mockStream = createMockStream([
      { choices: [{ delta: { content: "CON" }, finish_reason: null }] },
      { choices: [{ delta: { content: "NECTED" }, finish_reason: "stop" }] },
    ]);

    vi.spyOn(llm["client"].chat.completions, "create").mockResolvedValue(mockStream as any);

    const result = await llm.complete(context);

    expect(result.content).toEqual([{ type: "text", text: "CONNECTED" }]);
    expect(result.provider).toBe("kimi");
  });

  it("does not send a disabled thinking parameter for ordinary Kimi requests", async () => {
    const llm = new KimiService({ provider: "kimi", apiKey: "test-key", model: "kimi-k2.6" });
    const mockStream = createMockStream([
      { choices: [{ delta: { content: "plain" }, finish_reason: "stop" }] },
    ]);

    const createSpy = vi.spyOn(llm["client"].chat.completions, "create").mockResolvedValue(mockStream as any);

    await llm.complete(context, { thinkingEnabled: false });

    const params = createSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(params.thinking).toBeUndefined();
  });

  it("returns an error AssistantMessage with auth info when API key is missing", async () => {
    const llm = new KimiService({ provider: "kimi", apiKey: "", model: "kimi-k2.6" });

    const result = await llm.complete(context);
    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toContain("API key not configured");
  });

  it("does not declare provider-native $web_search for the main-model stream entry", async () => {
    const llm = new KimiService({ provider: "kimi", apiKey: "test-key", model: "kimi-k2.6" });
    const createSpy = vi.spyOn(llm["client"].chat.completions, "create").mockResolvedValue(
      createMockStream([{ choices: [{ delta: { content: "hi" }, finish_reason: "stop" }] }]) as any,
    );

    await llm.complete(context);

    const params = createSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(params.tools).toBeUndefined();
    expect(params.thinking).toBeUndefined();
  });

  it("parses Kimi automatic prefix cache hits from prompt_tokens_details.cached_tokens", async () => {
    const llm = new KimiService({ provider: "kimi", apiKey: "test-key", model: "kimi-k2.6" });
    vi.spyOn(llm["client"].chat.completions, "create").mockResolvedValue(
      createMockStream([
        { choices: [{ delta: { content: "hi" }, finish_reason: "stop" }] },
        {
          choices: [],
          usage: {
            prompt_tokens: 3337,
            completion_tokens: 388,
            total_tokens: 3725,
            cached_tokens: 1024,
            prompt_tokens_details: { cached_tokens: 1024 },
          },
        },
      ]) as any,
    );

    const result = await llm.complete(context);

    expect(result.usage.cacheRead).toBe(1024);
    expect(result.usage.cacheHit).toBe(1024);
    // miss = prompt_tokens - cached = 3337 - 1024
    expect(result.usage.cacheMiss).toBe(2313);
  });

  it("enables thinking when thinking is turned on", async () => {
    const llm = new KimiService({ provider: "kimi", apiKey: "test-key", model: "kimi-k2.6" });
    const createSpy = vi.spyOn(llm["client"].chat.completions, "create").mockResolvedValue(
      createMockStream([
        { choices: [{ delta: { reasoning_content: "let me think" }, finish_reason: null }] },
        { choices: [{ delta: { content: "answer" }, finish_reason: "stop" }] },
      ]) as any,
    );

    const result = await llm.complete(context, { thinkingEnabled: true });

    const params = createSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(params.thinking).toEqual({ type: "enabled" });
    expect(params.tools).toBeUndefined();
    expect(result.content).toContainEqual({ type: "thinking", thinking: "let me think" });
    expect(result.content).toContainEqual({ type: "text", text: "answer" });
  });
});
