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

  it("declares builtin $web_search for the main-model stream entry", async () => {
    const llm = new KimiService({ provider: "kimi", apiKey: "test-key", model: "kimi-k2.6" });
    const createSpy = vi.spyOn(llm["client"].chat.completions, "create").mockResolvedValue(
      createMockStream([{ choices: [{ delta: { content: "hi" }, finish_reason: "stop" }] }]) as any,
    );

    await llm.complete(context);

    const params = createSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(params.tools).toContainEqual({ type: "builtin_function", function: { name: "$web_search" } });
    expect(params.thinking).toEqual({ type: "disabled" });
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

  it("enables thinking and drops $web_search when thinking is turned on (mutually exclusive)", async () => {
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
    // 开 thinking 时不挂 builtin $web_search。
    expect(params.tools).toBeUndefined();
    expect(result.content).toContainEqual({ type: "thinking", thinking: "let me think" });
    expect(result.content).toContainEqual({ type: "text", text: "answer" });
  });

  it("handles the $web_search echo-back loop internally without leaking it to the agent loop", async () => {
    const llm = new KimiService({ provider: "kimi", apiKey: "test-key", model: "kimi-k2.6" });
    const createSpy = vi.spyOn(llm["client"].chat.completions, "create")
      // 第一轮：Kimi 触发 builtin $web_search。
      .mockResolvedValueOnce(
        createMockStream([
          {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  id: "ws_1",
                  function: { name: "$web_search", arguments: '{"query":"core schedule"}' },
                }],
              },
              finish_reason: "tool_calls",
            }],
            usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
          },
        ]) as any,
      )
      // 第二轮：Kimi 基于搜索结果给出最终回答。
      .mockResolvedValueOnce(
        createMockStream([
          { choices: [{ delta: { content: "Final answer." }, finish_reason: "stop" }],
            usage: { prompt_tokens: 13000, completion_tokens: 20, total_tokens: 13020 } },
        ]) as any,
      );

    const events: { type: string; toolName?: string }[] = [];
    let final;
    for await (const event of llm.stream(context)) {
      events.push(event as never);
      if (event.type === "done") final = event.message;
    }

    // 内部回填发生了两次请求；第二次的 messages 含原样回填的 role:tool。
    expect(createSpy).toHaveBeenCalledTimes(2);
    const secondMessages = (createSpy.mock.calls[1][0] as { messages: unknown[] }).messages;
    expect(secondMessages).toContainEqual({
      role: "tool",
      tool_call_id: "ws_1",
      content: '{"query":"core schedule"}',
    });

    // 不向 agent loop 暴露 $web_search 的 tool_call 事件。
    expect(events.some((e) => e.type === "tool_call_delta")).toBe(false);

    // 最终消息只含文本，usage 跨轮累加，搜索次数记入 serverToolUse。
    expect(final?.content).toEqual([{ type: "text", text: "Final answer." }]);
    expect(final?.stopReason).toBe("stop");
    expect(final?.usage.totalTokens).toBe(110 + 13020);
    expect(final?.usage.serverToolUse).toEqual({ webSearchRequests: 1, webFetchRequests: 0 });
  });
});
