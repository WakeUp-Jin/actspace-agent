import { describe, expect, it } from "vitest";
import {
  anthropicUsageToUsage,
  convertContextToAnthropic,
  convertMessagesToAnthropic,
  createAnthropicWebSearchTool,
  messageToAssistantMessage,
  toAnthropicClientTools,
} from "../anthropic-convert";
import type { AssistantMessage, Context, ToolResultMessage } from "../../messages";
import { createEmptyUsage } from "../../messages";

describe("anthropic-convert", () => {
  it("converts system prompt and user messages for Anthropic Messages API", () => {
    const ctx: Context = {
      systemPrompt: "You are helpful.",
      messages: [{ role: "user", content: "hello", timestamp: Date.now() }],
    };

    const result = convertContextToAnthropic(ctx);

    expect(result.system).toBe("You are helpful.");
    expect(result.messages).toEqual([{ role: "user", content: "hello" }]);
  });

  it("converts text/image user content to Anthropic content blocks", () => {
    const result = convertMessagesToAnthropic([
      {
        role: "user",
        content: [
          { type: "text", text: "what is this?" },
          { type: "image", data: "abc", mimeType: "image/png" },
        ],
        timestamp: Date.now(),
      },
    ]);

    expect(result[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "what is this?" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
      ],
    });
  });

  it("converts local tool history to Anthropic tool_use and tool_result blocks", () => {
    const assistant: AssistantMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "checking" },
        { type: "toolCall", id: "tc_1", name: "read_file", arguments: { path: "README.md" } },
      ],
      model: "m",
      provider: "deepseek",
      usage: createEmptyUsage(),
      stopReason: "toolUse",
      timestamp: Date.now(),
    };
    const toolResult: ToolResultMessage = {
      role: "toolResult",
      toolCallId: "tc_1",
      toolName: "read_file",
      content: [{ type: "text", text: "file content" }],
      isError: false,
      timestamp: Date.now(),
    };

    const result = convertMessagesToAnthropic([assistant, toolResult]);

    expect(result).toEqual([
      {
        role: "assistant",
        content: [
          { type: "text", text: "checking" },
          { type: "tool_use", id: "tc_1", name: "read_file", input: { path: "README.md" } },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tc_1",
            content: "file content",
          },
        ],
      },
    ]);
  });

  it("inserts synthetic Anthropic tool_result for orphaned tool calls", () => {
    const assistant: AssistantMessage = {
      role: "assistant",
      content: [
        { type: "toolCall", id: "tc_1", name: "read_file", arguments: { path: "README.md" } },
      ],
      model: "m",
      provider: "deepseek",
      usage: createEmptyUsage(),
      stopReason: "toolUse",
      timestamp: Date.now(),
    };

    const result = convertMessagesToAnthropic([assistant]);

    expect(result).toEqual([
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "tc_1", name: "read_file", input: { path: "README.md" } },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tc_1",
            content: "No result provided",
            is_error: true,
          },
        ],
      },
    ]);
  });

  it("converts adjacent tool results into one Anthropic user message", () => {
    const assistant: AssistantMessage = {
      role: "assistant",
      content: [
        { type: "toolCall", id: "tc_1", name: "read_file", arguments: { path: "README.md" } },
        { type: "toolCall", id: "tc_2", name: "grep", arguments: { pattern: "DeepSeek" } },
      ],
      model: "m",
      provider: "deepseek",
      usage: createEmptyUsage(),
      stopReason: "toolUse",
      timestamp: Date.now(),
    };
    const firstResult: ToolResultMessage = {
      role: "toolResult",
      toolCallId: "tc_1",
      toolName: "read_file",
      content: [{ type: "text", text: "read result" }],
      isError: false,
      timestamp: Date.now(),
    };
    const secondResult: ToolResultMessage = {
      role: "toolResult",
      toolCallId: "tc_2",
      toolName: "grep",
      content: [{ type: "text", text: "grep result" }],
      isError: false,
      timestamp: Date.now(),
    };

    const result = convertMessagesToAnthropic([assistant, firstResult, secondResult]);

    expect(result[1]).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "tc_1", content: "read result" },
        { type: "tool_result", tool_use_id: "tc_2", content: "grep result" },
      ],
    });
  });

  it("converts provider-neutral tools to Anthropic client tools", () => {
    const result = toAnthropicClientTools([
      {
        name: "read_file",
        description: "Read a file",
        parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      },
    ]);

    expect(result).toEqual([
      {
        name: "read_file",
        description: "Read a file",
        input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      },
    ]);
  });

  it("creates Anthropic web search server tool", () => {
    expect(createAnthropicWebSearchTool(2)).toEqual({
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 2,
    });
  });

  it("maps Anthropic message content and usage to AssistantMessage", () => {
    const message = {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "deepseek-v4-pro",
      stop_reason: "end_turn",
      stop_sequence: null,
      content: [
        { type: "thinking", thinking: "checking", signature: "sig" },
        { type: "server_tool_use", id: "srv_1", name: "web_search", input: {}, caller: { type: "direct" } },
        { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "README.md" }, caller: { type: "direct" } },
        { type: "text", text: "CONNECTED", citations: null },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 3,
        cache_creation_input_tokens: 2,
        cache_creation: null,
        output_tokens_details: { thinking_tokens: 1 },
        server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 },
        service_tier: "standard",
        inference_geo: null,
      },
    };

    const result = messageToAssistantMessage(
      message as any,
      { provider: "deepseek", apiFormat: "anthropic", apiKey: "sk", model: "deepseek-v4-pro" },
      "deepseek",
    );

    expect(result.content).toEqual([
      { type: "thinking", thinking: "checking", signature: "sig" },
      { type: "toolCall", id: "toolu_1", name: "read_file", arguments: { path: "README.md" } },
      { type: "text", text: "CONNECTED" },
    ]);
    expect(result.stopReason).toBe("toolUse");
    // Anthropic input_tokens(10) 只是未命中新输入；完整 prompt = 10 + cacheRead(3) + cacheWrite(2) = 15。
    expect(result.usage).toMatchObject({
      input: 15,
      output: 5,
      cacheRead: 3,
      cacheWrite: 2,
      cacheHit: 3,
      cacheMiss: 12,
      reasoning: 1,
      totalTokens: 20,
      serverToolUse: {
        webSearchRequests: 1,
        webFetchRequests: 0,
      },
    });
    // 不变量：命中 + 未命中 = 输入，总计 = 输入 + 输出，缓存命中 ≤ 总计。
    expect(result.usage.cacheHit + result.usage.cacheMiss).toBe(result.usage.input);
    expect(result.usage.totalTokens).toBe(result.usage.input + result.usage.output);
    expect(result.usage.cacheHit).toBeLessThanOrEqual(result.usage.totalTokens);
  });

  it("wraps non-object Anthropic tool input for internal tool calls", () => {
    const message = {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "deepseek-v4-pro",
      stop_reason: "tool_use",
      stop_sequence: null,
      content: [
        { type: "tool_use", id: "toolu_1", name: "read_file", input: "README.md", caller: { type: "direct" } },
      ],
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_creation: null,
        output_tokens_details: null,
        server_tool_use: null,
        service_tier: null,
        inference_geo: null,
      },
    };

    const result = messageToAssistantMessage(
      message as any,
      { provider: "deepseek", apiFormat: "anthropic", apiKey: "sk", model: "deepseek-v4-pro" },
      "deepseek",
    );

    expect(result.content).toEqual([
      { type: "toolCall", id: "toolu_1", name: "read_file", arguments: { input: "README.md" } },
    ]);
    expect(result.stopReason).toBe("toolUse");
  });

  it("maps Anthropic usage without optional fields", () => {
    const usage = anthropicUsageToUsage({
      input_tokens: 4,
      output_tokens: 6,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
      cache_creation: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
      inference_geo: null,
    });

    expect(usage.totalTokens).toBe(10);
    expect(usage.cacheHit).toBe(0);
    expect(usage.cacheMiss).toBe(4);
  });

  it("keeps cache <= total for the reported high-cache scenario", () => {
    // 复刻用户上报：以前 input_tokens 被当成完整输入，导致缓存(7936) > 总计(6877)。
    const usage = anthropicUsageToUsage({
      input_tokens: 6729,
      output_tokens: 148,
      cache_read_input_tokens: 7936,
      cache_creation_input_tokens: 0,
      cache_creation: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
      inference_geo: null,
    });

    expect(usage.input).toBe(6729 + 7936);
    expect(usage.cacheHit).toBe(7936);
    expect(usage.cacheMiss).toBe(6729);
    expect(usage.totalTokens).toBe(6729 + 7936 + 148);
    expect(usage.cacheHit).toBeLessThanOrEqual(usage.totalTokens);
    expect(usage.cacheHit + usage.cacheMiss).toBe(usage.input);
  });
});
