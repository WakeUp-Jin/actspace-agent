import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepSeekAnthropicService } from "../services/deepseek-anthropic";
import { detectLeakedDsmlToolCalls } from "../anthropic-convert";
import type { Context } from "../../messages";

const LEAKED_DSML = [
  "｜｜DSML｜｜tool_calls",
  '｜｜DSML｜｜invoke name="web_search"',
  '｜｜DSML｜｜parameter name="query" string="true">core schedule</｜｜DSML｜｜parameter>',
  "</｜｜DSML｜｜invoke>",
  "</｜｜DSML｜｜tool_calls>",
].join("\n");

const context: Context = {
  systemPrompt: "You are helpful.",
  messages: [{ role: "user", content: "core 时间格式", timestamp: Date.now() }],
  tools: [],
};

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

describe("detectLeakedDsmlToolCalls", () => {
  it("flags leaked DeepSeek DSML tool-call markup", () => {
    expect(detectLeakedDsmlToolCalls(LEAKED_DSML)).toBe(true);
    expect(detectLeakedDsmlToolCalls("｜｜DSML｜｜tool_calls")).toBe(true);
    expect(detectLeakedDsmlToolCalls('｜｜DSML｜｜invoke name="x">')).toBe(true);
  });

  it("does not flag ordinary prose containing the word DSML", () => {
    expect(detectLeakedDsmlToolCalls("")).toBe(false);
    expect(detectLeakedDsmlToolCalls("We use a DSML to model the domain.")).toBe(false);
    expect(detectLeakedDsmlToolCalls("invoke name= without DSML markers")).toBe(false);
  });
});

describe("AnthropicMessagesService DSML leak guard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("turns a leaked DSML text response into a retryable server_error", async () => {
    const llm = new DeepSeekAnthropicService({
      provider: "deepseek",
      apiFormat: "anthropic",
      apiKey: "test-key",
      model: "deepseek-v4-pro",
    });
    vi.spyOn(llm["client"].messages, "stream").mockReturnValue(
      streamOf([
        messageStart({ input_tokens: 10, cache_read_input_tokens: 2 }),
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: LEAKED_DSML } },
        { type: "content_block_stop", index: 0 },
        messageDelta("end_turn", {
          output_tokens: 5,
          server_tool_use: { web_search_requests: 2, web_fetch_requests: 0 },
        }),
        { type: "message_stop" },
      ]) as never,
    );

    const result = await llm.complete(context);

    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toContain("DSML leak");
    // 错误消息不得把裸 DSML 标记带出去。
    expect(JSON.stringify(result.content)).not.toContain("DSML");
    // usage 仍保留（含计费输入），便于统计。
    expect(result.usage.totalTokens).toBeGreaterThan(0);
    expect(result.usage.serverToolUse).toEqual({ webSearchRequests: 2, webFetchRequests: 0 });
  });

  it("leaves a normal text response untouched", async () => {
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
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Here is a plain answer." } },
        { type: "content_block_stop", index: 0 },
        messageDelta("end_turn", { output_tokens: 4 }),
        { type: "message_stop" },
      ]) as never,
    );

    const result = await llm.complete(context);

    expect(result.stopReason).toBe("stop");
    expect(result.content).toEqual([{ type: "text", text: "Here is a plain answer." }]);
  });
});
