import { describe, it, expect } from "vitest";
import { MockLLMService } from "../services/mock";
import type { Context } from "../../messages";
import type { AssistantMessageEvent } from "../types";

function createMockContext(hasToolResults = false): Context {
  const messages: Context["messages"] = [
    { role: "user", content: "test query", timestamp: Date.now() },
  ];

  if (hasToolResults) {
    messages.push({
      role: "assistant",
      content: [{ type: "toolCall", id: "tc_1", name: "read_file", arguments: { path: "test" } }],
      model: "deepseek-mock",
      provider: "deepseek-mock",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "toolUse",
      timestamp: Date.now(),
    });
    messages.push({
      role: "toolResult",
      toolCallId: "tc_1",
      toolName: "read_file",
      content: [{ type: "text", text: "file content" }],
      isError: false,
      timestamp: Date.now(),
    });
  }

  return { systemPrompt: "Test", messages };
}

describe("MockLLMService", () => {
  it("should produce tool calls on first call (no tool results)", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "deepseek-mock" });
    const ctx = createMockContext(false);
    const events: AssistantMessageEvent[] = [];

    for await (const event of llm.stream(ctx)) {
      events.push(event);
    }

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    if (doneEvent?.type === "done") {
      expect(doneEvent.message.stopReason).toBe("toolUse");
      expect(doneEvent.message.content.some((c) => c.type === "toolCall")).toBe(true);
    }

    expect(events.some((e) => e.type === "thinking_delta")).toBe(true);
  });

  it("should produce final text on subsequent call (has tool results)", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "deepseek-mock" });
    const ctx = createMockContext(true);
    const events: AssistantMessageEvent[] = [];

    for await (const event of llm.stream(ctx)) {
      events.push(event);
    }

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    if (doneEvent?.type === "done") {
      expect(doneEvent.message.stopReason).toBe("stop");
      expect(doneEvent.message.content.some((c) => c.type === "text")).toBe(true);
    }

    expect(events.some((e) => e.type === "text_delta")).toBe(true);
  });

  it("stream().result() should aggregate to AssistantMessage", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "deepseek-mock" });
    const ctx = createMockContext(false);

    const msg = await llm.complete(ctx);
    expect(msg.role).toBe("assistant");
    expect(msg.stopReason).toBe("toolUse");
    expect(msg.model).toBe("deepseek-mock");
    expect(msg.provider).toBe("deepseek-mock");
  });
});
