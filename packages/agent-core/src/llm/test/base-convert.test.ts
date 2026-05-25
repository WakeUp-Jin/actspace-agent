import { describe, it, expect, vi, afterEach } from "vitest";
import { DeepSeekService } from "../services/deepseek";
import type { Context, AssistantMessage } from "../../messages";
import { createEmptyUsage } from "../../messages";

/**
 * 消息格式转换测试
 *
 * convertMessages 现在是 DeepSeekService 的内部函数。
 * 通过捕获 SDK create() 调用的参数来验证转换逻辑。
 */

function createMockStream(chunks: Record<string, unknown>[]) {
  async function* gen() {
    for (const chunk of chunks) {
      yield chunk;
    }
  }
  return gen();
}

const EMPTY_RESPONSE = createMockStream([
  { choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] },
]);

describe("Message conversion (via DeepSeekService)", () => {
  const service = new DeepSeekService({ provider: "deepseek", apiKey: "test", model: "test" });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should convert system prompt", async () => {
    const ctx: Context = { systemPrompt: "You are helpful.", messages: [] };
    const spy = vi.spyOn(service["client"].chat.completions, "create")
      .mockResolvedValue(EMPTY_RESPONSE as any);

    await service.complete(ctx);

    const params = spy.mock.calls[0][0] as Record<string, unknown>;
    const messages = params.messages as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({ role: "system", content: "You are helpful." });
  });

  it("should convert user message (string)", async () => {
    const ctx: Context = {
      messages: [{ role: "user", content: "hello", timestamp: Date.now() }],
    };
    const spy = vi.spyOn(service["client"].chat.completions, "create")
      .mockResolvedValue(createMockStream([
        { choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] },
      ]) as any);

    await service.complete(ctx);

    const params = spy.mock.calls[0][0] as Record<string, unknown>;
    const messages = params.messages as Array<{ role: string; content: unknown }>;
    expect(messages[0]).toEqual({ role: "user", content: "hello" });
  });

  it("should convert user message (text-only content array) to joined string", async () => {
    const ctx: Context = {
      messages: [{
        role: "user",
        content: [{ type: "text", text: "part1" }, { type: "text", text: "part2" }],
        timestamp: Date.now(),
      }],
    };
    const spy = vi.spyOn(service["client"].chat.completions, "create")
      .mockResolvedValue(createMockStream([
        { choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] },
      ]) as any);

    await service.complete(ctx);

    const params = spy.mock.calls[0][0] as Record<string, unknown>;
    const messages = params.messages as Array<{ role: string; content: unknown }>;
    expect(messages[0]).toEqual({ role: "user", content: "part1part2" });
  });

  it("should convert image content to OpenAI-compatible content parts", async () => {
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
    const spy = vi.spyOn(service["client"].chat.completions, "create")
      .mockResolvedValue(createMockStream([
        { choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] },
      ]) as any);

    await service.complete(ctx);

    const params = spy.mock.calls[0][0] as Record<string, unknown>;
    const messages = params.messages as Array<{ role: string; content: unknown }>;
    expect(messages[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "what is this?" },
        { type: "image_url", image_url: { url: "data:image/png;base64,abc123" } },
      ],
    });
  });

  it("should convert assistant message with tool calls", async () => {
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
    const spy = vi.spyOn(service["client"].chat.completions, "create")
      .mockResolvedValue(createMockStream([
        { choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] },
      ]) as any);

    await service.complete(ctx);

    const params = spy.mock.calls[0][0] as Record<string, unknown>;
    const messages = params.messages as Array<Record<string, unknown>>;
    expect(messages[0].role).toBe("assistant");
    expect(messages[0].content).toBe("Let me check");
    expect(messages[0].tool_calls).toBeDefined();
    expect((messages[0].tool_calls as unknown[]).length).toBe(1);
  });

  it("should convert tool result message", async () => {
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
    const spy = vi.spyOn(service["client"].chat.completions, "create")
      .mockResolvedValue(createMockStream([
        { choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] },
      ]) as any);

    await service.complete(ctx);

    const params = spy.mock.calls[0][0] as Record<string, unknown>;
    const messages = params.messages as Array<Record<string, unknown>>;
    expect(messages[0]).toEqual({ role: "tool", tool_call_id: "tc1", content: "file content" });
  });

  it("should handle full conversation with all message types", async () => {
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
    const spy = vi.spyOn(service["client"].chat.completions, "create")
      .mockResolvedValue(createMockStream([
        { choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] },
      ]) as any);

    await service.complete(ctx);

    const params = spy.mock.calls[0][0] as Record<string, unknown>;
    const messages = params.messages as Array<Record<string, unknown>>;
    expect(messages.length).toBe(3);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[2].role).toBe("assistant");
  });
});
