import { describe, it, expect } from "vitest";
import {
  buildAssistantMessage,
  convertMessages,
  createAccumulator,
  mapSdkError,
  mapStopReason,
  parseToolCall,
  toRequestTools,
} from "../convert";
import type { Context, AssistantMessage, ToolResultMessage } from "../../messages";
import { createEmptyUsage } from "../../messages";
import { LLMServiceError } from "../types";
import OpenAI from "openai";

describe("convertMessages", () => {
  it("converts system prompt", () => {
    const ctx: Context = { systemPrompt: "You are helpful.", messages: [] };
    const result = convertMessages(ctx);
    expect(result[0]).toEqual({ role: "system", content: "You are helpful." });
  });

  it("converts user message (string)", () => {
    const ctx: Context = {
      messages: [{ role: "user", content: "hello", timestamp: Date.now() }],
    };
    const result = convertMessages(ctx);
    expect(result[0]).toEqual({ role: "user", content: "hello" });
  });

  it("converts user message (text-only array) to joined string", () => {
    const ctx: Context = {
      messages: [{
        role: "user",
        content: [{ type: "text", text: "a" }, { type: "text", text: "b" }],
        timestamp: Date.now(),
      }],
    };
    const result = convertMessages(ctx);
    expect(result[0]).toEqual({ role: "user", content: "ab" });
  });

  it("converts image content to OpenAI content parts", () => {
    const ctx: Context = {
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "what?" },
          { type: "image", data: "abc", mimeType: "image/png" },
        ],
        timestamp: Date.now(),
      }],
    };
    const result = convertMessages(ctx);
    expect(result[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "what?" },
        { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
      ],
    });
  });

  it("converts assistant message with tool calls", () => {
    const ctx: Context = {
      messages: [{
        role: "assistant",
        content: [
          { type: "text", text: "checking" },
          { type: "toolCall", id: "tc1", name: "read_file", arguments: { path: "x" } },
        ],
        model: "m", provider: "p",
        usage: createEmptyUsage(), stopReason: "toolUse", timestamp: Date.now(),
      } as AssistantMessage,
      {
        role: "toolResult", toolCallId: "tc1", toolName: "read_file",
        content: [{ type: "text", text: "content" }], isError: false, timestamp: Date.now(),
      } as ToolResultMessage],
    };
    const result = convertMessages(ctx);
    expect(result[0]).toMatchObject({ role: "assistant", content: "checking" });
    expect((result[0] as any).tool_calls).toHaveLength(1);
    expect(result[1]).toEqual({ role: "tool", tool_call_id: "tc1", content: "content" });
  });

  it("converts tool image content into a follow-up user image observation", () => {
    const ctx: Context = {
      messages: [{
        role: "assistant",
        content: [
          { type: "toolCall", id: "tc1", name: "read_file", arguments: { path: "image.png" } },
        ],
        model: "m", provider: "p",
        usage: createEmptyUsage(), stopReason: "toolUse", timestamp: Date.now(),
      } as AssistantMessage,
      {
        role: "toolResult",
        toolCallId: "tc1",
        toolName: "read_file",
        content: [
          { type: "text", text: "Read image file: image.png" },
          { type: "image", data: "abc", mimeType: "image/png" },
        ],
        isError: false,
        timestamp: Date.now(),
      } as ToolResultMessage],
    };

    const result = convertMessages(ctx);

    expect(result[1]).toEqual({
      role: "tool",
      tool_call_id: "tc1",
      content: "Read image file: image.png",
    });
    expect(result[2]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "Tool read_file returned 1 image for visual analysis." },
        { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
      ],
    });
  });

  it("delays tool image observations until all consecutive tool results are emitted", () => {
    const ctx: Context = {
      messages: [{
        role: "assistant",
        content: [
          { type: "toolCall", id: "tc_image", name: "read_file", arguments: { path: "image.png" } },
          { type: "toolCall", id: "tc_text", name: "bash", arguments: { command: "echo ok" } },
        ],
        model: "m", provider: "p",
        usage: createEmptyUsage(), stopReason: "toolUse", timestamp: Date.now(),
      } as AssistantMessage,
      {
        role: "toolResult",
        toolCallId: "tc_image",
        toolName: "read_file",
        content: [
          { type: "text", text: "Read image file: image.png" },
          { type: "image", data: "abc", mimeType: "image/png" },
        ],
        isError: false,
        timestamp: Date.now(),
      } as ToolResultMessage,
      {
        role: "toolResult",
        toolCallId: "tc_text",
        toolName: "bash",
        content: [{ type: "text", text: "ok" }],
        isError: false,
        timestamp: Date.now(),
      } as ToolResultMessage],
    };

    const result = convertMessages(ctx);

    expect(result.map((message) => message.role)).toEqual(["assistant", "tool", "tool", "user"]);
    expect(result[1]).toEqual({ role: "tool", tool_call_id: "tc_image", content: "Read image file: image.png" });
    expect(result[2]).toEqual({ role: "tool", tool_call_id: "tc_text", content: "ok" });
    expect(result[3]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "Tool read_file returned 1 image for visual analysis." },
        { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
      ],
    });
  });

  it("skips assistant messages with stopReason error", () => {
    const ctx: Context = {
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "partial" }],
          model: "m", provider: "p",
          usage: createEmptyUsage(), stopReason: "error",
          errorMessage: "something failed",
          timestamp: Date.now(),
        } as AssistantMessage,
        { role: "user", content: "retry", timestamp: Date.now() },
      ],
    };
    const result = convertMessages(ctx);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: "user", content: "retry" });
  });

  it("skips assistant messages with stopReason aborted", () => {
    const ctx: Context = {
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "partial" }],
          model: "m", provider: "p",
          usage: createEmptyUsage(), stopReason: "aborted",
          timestamp: Date.now(),
        } as AssistantMessage,
      ],
    };
    const result = convertMessages(ctx);
    expect(result).toHaveLength(0);
  });

  it("inserts synthetic toolResult for orphaned tool calls", () => {
    const ctx: Context = {
      messages: [
        {
          role: "assistant",
          content: [
            { type: "toolCall", id: "tc1", name: "read_file", arguments: { path: "x" } },
            { type: "toolCall", id: "tc2", name: "grep", arguments: { pattern: "y" } },
          ],
          model: "m", provider: "p",
          usage: createEmptyUsage(), stopReason: "toolUse", timestamp: Date.now(),
        } as AssistantMessage,
        {
          role: "toolResult", toolCallId: "tc1", toolName: "read_file",
          content: [{ type: "text", text: "result" }], isError: false, timestamp: Date.now(),
        } as ToolResultMessage,
        { role: "user", content: "continue", timestamp: Date.now() },
      ],
    };
    const result = convertMessages(ctx);

    const toolMessages = result.filter((m) => m.role === "tool");
    expect(toolMessages).toHaveLength(2);
    expect((toolMessages[1] as any).tool_call_id).toBe("tc2");
    expect((toolMessages[1] as any).content).toBe("No result provided");
  });
});

describe("toRequestTools", () => {
  it("converts Tool array to APIRequestTool array", () => {
    const tools = [{ name: "fn", description: "desc", parameters: { type: "object" as const } }];
    const result = toRequestTools(tools);
    expect(result).toEqual([{
      type: "function",
      function: { name: "fn", description: "desc", parameters: { type: "object" } },
    }]);
  });
});

describe("parseToolCall", () => {
  it("parses valid JSON arguments", () => {
    const tc = parseToolCall({ id: "1", name: "fn", argumentsText: '{"a":1}' });
    expect(tc).toEqual({ type: "toolCall", id: "1", name: "fn", arguments: { a: 1 } });
  });

  it("wraps invalid JSON in input field", () => {
    const tc = parseToolCall({ id: "1", name: "fn", argumentsText: "bad" });
    expect(tc.arguments).toEqual({ input: "bad" });
  });

  it("handles empty arguments", () => {
    const tc = parseToolCall({ id: "1", name: "fn", argumentsText: "" });
    expect(tc.arguments).toEqual({});
  });
});

describe("mapStopReason", () => {
  it("maps standard reasons", () => {
    expect(mapStopReason("stop")).toBe("stop");
    expect(mapStopReason("tool_calls")).toBe("toolUse");
    expect(mapStopReason("length")).toBe("length");
    expect(mapStopReason("content_filter")).toBe("error");
  });

  it("defaults unknown reasons to stop", () => {
    expect(mapStopReason("something_else")).toBe("stop");
  });
});

describe("buildAssistantMessage", () => {
  it("preserves raw length stop reason when tool calls force toolUse", () => {
    const acc = createAccumulator();
    acc.rawStopReason = "length";
    acc.stopReason = "length";
    acc.toolCalls.set(0, {
      id: "tc1",
      name: "write_file",
      argumentsText: '{"path":"a.md","content":"partial"}',
    });

    const message = buildAssistantMessage(
      acc,
      { provider: "kimi", apiKey: "sk", model: "kimi-k2.6" },
      "kimi",
    );

    expect(message.stopReason).toBe("toolUse");
    expect(message.diagnostics).toEqual([{ rawStopReason: "length" }]);
  });
});

function fakeHeaders(): any {
  return { get: () => null };
}

describe("mapSdkError", () => {
  it("maps 401 to auth error", () => {
    const apiError = new OpenAI.APIError(401, { message: "Unauthorized" }, "Unauthorized", fakeHeaders());
    const err = mapSdkError(apiError, "TestProvider");
    expect(err).toBeInstanceOf(LLMServiceError);
    expect(err.kind).toBe("auth");
    expect(err.retryable).toBe(false);
  });

  it("maps 402 to insufficient balance", () => {
    const apiError = new OpenAI.APIError(402, { message: "Payment Required" }, "Payment Required", fakeHeaders());
    const err = mapSdkError(apiError, "TestProvider");
    expect(err.kind).toBe("insufficient_balance");
    expect(err.retryable).toBe(false);
  });

  it("maps 404 model errors to invalid_request", () => {
    const apiError = new OpenAI.APIError(404, { message: "Model not found" }, "Model not found", fakeHeaders());
    const err = mapSdkError(apiError, "TestProvider");
    expect(err.kind).toBe("invalid_request");
    expect(err.retryable).toBe(false);
  });

  it("maps 429 to rate_limit error", () => {
    const apiError = new OpenAI.APIError(429, { message: "Too Many Requests" }, "Rate limited", fakeHeaders());
    const err = mapSdkError(apiError, "TestProvider");
    expect(err.kind).toBe("rate_limit");
    expect(err.retryable).toBe(true);
  });

  it("maps 500 to server_error", () => {
    const apiError = new OpenAI.APIError(500, { message: "Internal Server Error" }, "Server error", fakeHeaders());
    const err = mapSdkError(apiError, "TestProvider");
    expect(err.kind).toBe("server_error");
    expect(err.retryable).toBe(true);
  });

  it("maps AbortError to network", () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    const err = mapSdkError(abortErr, "TestProvider");
    expect(err.kind).toBe("network");
    expect(err.retryable).toBe(false);
  });

  it("maps unknown error to network with retryable", () => {
    const err = mapSdkError(new Error("connection reset"), "TestProvider");
    expect(err.kind).toBe("network");
    expect(err.retryable).toBe(true);
  });
});
