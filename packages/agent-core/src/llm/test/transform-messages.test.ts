import { describe, expect, it } from "vitest";
import { createEmptyUsage, type AssistantMessage, type Message } from "../../messages";
import { transformMessages } from "../transform-messages";

const now = 1780331571000;

function assistant(overrides: Partial<AssistantMessage>): AssistantMessage {
  return {
    role: "assistant",
    api: "anthropic-messages",
    provider: "deepseek",
    model: "deepseek-v4-pro",
    content: [],
    usage: createEmptyUsage(),
    stopReason: "stop",
    timestamp: now,
    ...overrides,
  };
}

describe("transformMessages", () => {
  it("downgrades thinking blocks when replaying across APIs", () => {
    const messages: Message[] = [
      assistant({
        content: [
          { type: "thinking", thinking: "private reasoning", signature: "sig" },
          { type: "text", text: "answer", textSignature: "text-sig" },
        ],
      }),
    ];

    const result = transformMessages(messages, {
      api: "openai-completions",
      provider: "kimi",
      apiKey: "sk",
      model: "kimi-k2.6",
    });

    expect(result[0]).toMatchObject({
      role: "assistant",
      content: [
        { type: "text", text: "private reasoning" },
        { type: "text", text: "answer" },
      ],
    });
    expect((result[0] as AssistantMessage).content[1]).not.toHaveProperty("textSignature");
  });

  it("does not replay opaque reasoning state to a different API on the same provider model", () => {
    const result = transformMessages([
      assistant({
        api: "openai-responses",
        provider: "duckcoding",
        model: "gpt-5.6-sol",
        content: [{
          type: "thinking",
          thinking: "",
          signature: "openai-responses-reasoning:{\"id\":\"rs_1\",\"type\":\"reasoning\"}",
        }],
      }),
    ], {
      api: "openai-completions",
      provider: "duckcoding",
      apiKey: "sk",
      model: "gpt-5.6-sol",
    });

    expect(result).toEqual([]);
  });

  it("replaces images when target model does not support image input", () => {
    const result = transformMessages([
      {
        role: "user",
        content: [
          { type: "text", text: "look" },
          { type: "image", data: "abc", mimeType: "image/png" },
          { type: "image", data: "def", mimeType: "image/png" },
        ],
        timestamp: now,
      },
    ], {
      api: "openai-completions",
      provider: "deepseek",
      apiKey: "sk",
      model: "text-only",
      input: ["text"],
    });

    expect(result[0]).toMatchObject({
      role: "user",
      content: [
        { type: "text", text: "look" },
        { type: "text", text: "(image omitted: model does not support images)" },
      ],
    });
  });

  it("normalizes tool call ids and synchronized tool results", () => {
    const result = transformMessages([
      assistant({
        provider: "openai",
        api: "openai-completions",
        model: "other",
        content: [
          { type: "toolCall", id: "call|unsafe value", name: "read_file", arguments: { path: "x" } },
        ],
        stopReason: "toolUse",
      }),
      {
        role: "toolResult",
        toolCallId: "call|unsafe value",
        toolName: "read_file",
        content: [{ type: "text", text: "ok" }],
        isError: false,
        timestamp: now,
      },
    ], {
      api: "anthropic-messages",
      provider: "deepseek",
      apiKey: "sk",
      model: "deepseek-v4-pro",
    }, {
      normalizeToolCallId: (id) => id.replace(/[^a-zA-Z0-9_-]/g, "_"),
    });

    expect((result[0] as AssistantMessage).content[0]).toMatchObject({
      type: "toolCall",
      id: "call_unsafe_value",
    });
    expect(result[1]).toMatchObject({
      role: "toolResult",
      toolCallId: "call_unsafe_value",
    });
  });
});
