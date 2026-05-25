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

  it("declares builtin web search and disables thinking for search subcalls", async () => {
    const llm = new KimiService({ provider: "kimi", apiKey: "test-key", model: "kimi-k2.6" });
    const mockStream = createMockStream([
      { choices: [{ delta: { content: "searched" }, finish_reason: "stop" }] },
    ]);

    const createSpy = vi.spyOn(llm["client"].chat.completions, "create").mockResolvedValue(mockStream as any);

    await llm.streamWithBuiltinWebSearch([{ role: "user", content: "latest news" }]).result();

    const params = createSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(params.tools).toEqual([
      { type: "builtin_function", function: { name: "$web_search" } },
    ]);
    expect(params.thinking).toEqual({ type: "disabled" });
  });

  it("can disable thinking for ordinary Kimi requests", async () => {
    const llm = new KimiService({ provider: "kimi", apiKey: "test-key", model: "kimi-k2.6" });
    const mockStream = createMockStream([
      { choices: [{ delta: { content: "plain" }, finish_reason: "stop" }] },
    ]);

    const createSpy = vi.spyOn(llm["client"].chat.completions, "create").mockResolvedValue(mockStream as any);

    await llm.complete(context, { thinkingEnabled: false });

    const params = createSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(params.thinking).toEqual({ type: "disabled" });
  });

  it("returns an error AssistantMessage with auth info when API key is missing", async () => {
    const llm = new KimiService({ provider: "kimi", apiKey: "", model: "kimi-k2.6" });

    const result = await llm.complete(context);
    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toContain("API key not configured");
  });
});
