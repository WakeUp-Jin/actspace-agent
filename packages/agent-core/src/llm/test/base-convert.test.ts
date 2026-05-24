import { describe, it, expect } from "vitest";
import { MockLLMService } from "../services/mock";
import type { Context, AssistantMessage } from "../../messages";
import { createEmptyUsage } from "../../messages";
import type { APIMessage } from "../types";

// MockLLMService 继承 BaseLLMService，convertMessages 是 protected。
// 通过 stream 间接测试：构造各种 context，验证不会抛异常且结果合理。
// 也可以用一个暴露 convertMessages 的子类做直接测试。
class TestableService extends MockLLMService {
  public testConvertMessages(context: Context): APIMessage[] {
    return this.convertMessages(context);
  }
}

describe("BaseLLMService.convertMessages", () => {
  const service = new TestableService({ provider: "mock", apiKey: "test", model: "test" });

  it("should convert system prompt", () => {
    const ctx: Context = { systemPrompt: "You are helpful.", messages: [] };
    const result = service.testConvertMessages(ctx);

    expect(result.length).toBe(1);
    expect(result[0]).toEqual({ role: "system", content: "You are helpful." });
  });

  it("should convert user message (string)", () => {
    const ctx: Context = {
      messages: [{ role: "user", content: "hello", timestamp: Date.now() }],
    };
    const result = service.testConvertMessages(ctx);

    expect(result.length).toBe(1);
    expect(result[0]).toEqual({ role: "user", content: "hello" });
  });

  it("should convert user message (content array)", () => {
    const ctx: Context = {
      messages: [{
        role: "user",
        content: [{ type: "text", text: "part1" }, { type: "text", text: "part2" }],
        timestamp: Date.now(),
      }],
    };
    const result = service.testConvertMessages(ctx);

    expect(result[0]).toEqual({ role: "user", content: "part1part2" });
  });

  it("should convert image content to OpenAI-compatible content parts", () => {
    const ctx: Context = {
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "what is this?" },
          { type: "image", data: "abc123", mimeType: "image/png" },
        ],
        timestamp: Date.now(),
      }],
    };
    const result = service.testConvertMessages(ctx);

    expect(result[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "what is this?" },
        { type: "image_url", image_url: { url: "data:image/png;base64,abc123" } },
      ],
    });
  });

  it("should convert assistant message with tool calls", () => {
    const assistant: AssistantMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "Let me check" },
        { type: "toolCall", id: "tc1", name: "read_file", arguments: { path: "test.ts" } },
      ],
      model: "test",
      provider: "test",
      usage: createEmptyUsage(),
      stopReason: "toolUse",
      timestamp: Date.now(),
    };

    const ctx: Context = { messages: [assistant] };
    const result = service.testConvertMessages(ctx);

    expect(result.length).toBe(1);
    const msg = result[0] as { role: "assistant"; content: string | null; tool_calls?: unknown[] };
    expect(msg.role).toBe("assistant");
    expect(msg.content).toBe("Let me check");
    expect(msg.tool_calls).toBeDefined();
    expect(msg.tool_calls!.length).toBe(1);
  });

  it("should convert tool result message", () => {
    const ctx: Context = {
      messages: [{
        role: "toolResult",
        toolCallId: "tc1",
        toolName: "read_file",
        content: [{ type: "text", text: "file content" }],
        isError: false,
        timestamp: Date.now(),
      }],
    };
    const result = service.testConvertMessages(ctx);

    expect(result.length).toBe(1);
    expect(result[0]).toEqual({ role: "tool", tool_call_id: "tc1", content: "file content" });
  });

  it("should handle full conversation with all message types", () => {
    const ctx: Context = {
      systemPrompt: "System",
      messages: [
        { role: "user", content: "hi", timestamp: Date.now() },
        {
          role: "assistant",
          content: [{ type: "text", text: "hello" }],
          model: "test", provider: "test",
          usage: createEmptyUsage(), stopReason: "stop", timestamp: Date.now(),
        },
      ],
    };
    const result = service.testConvertMessages(ctx);

    expect(result.length).toBe(3);
    expect(result[0].role).toBe("system");
    expect(result[1].role).toBe("user");
    expect(result[2].role).toBe("assistant");
  });
});
