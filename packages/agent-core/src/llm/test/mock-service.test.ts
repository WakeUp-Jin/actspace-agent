import { describe, it, expect } from "vitest";
import { MockLLMService, mockText, mockToolCall, mockError } from "../services/mock";
import type { Context } from "../../messages";
import { createEmptyUsage } from "../../messages";
import type { AssistantMessageEvent } from "../types";

function createMockContext(hasToolResults = false): Context {
  const messages: Context["messages"] = [
    { role: "user", content: "test query", timestamp: Date.now() },
  ];

  if (hasToolResults) {
    messages.push({
      role: "assistant",
      content: [{ type: "toolCall", id: "tc_1", name: "read_file", arguments: { path: "test" } }],
      model: "mock-model",
      provider: "mock",
      usage: createEmptyUsage(),
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
  it("should produce tool calls on first call (no tool results) — default mode", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "mock-model" });
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

  it("should produce final text on subsequent call (has tool results) — default mode", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "mock-model" });
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
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "mock-model" });
    const ctx = createMockContext(false);

    const msg = await llm.complete(ctx);
    expect(msg.role).toBe("assistant");
    expect(msg.stopReason).toBe("toolUse");
    expect(msg.model).toBe("mock-model");
    expect(msg.provider).toBe("mock");
  });

  // ─── Response queue 模式测试 ───

  it("should consume responses from queue in order", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "mock-model" });
    const ctx = createMockContext(false);

    llm.setResponses([
      mockText("first response"),
      mockText("second response"),
    ]);

    const msg1 = await llm.complete(ctx);
    expect(msg1.content).toContainEqual({ type: "text", text: "first response" });

    const msg2 = await llm.complete(ctx);
    expect(msg2.content).toContainEqual({ type: "text", text: "second response" });

    expect(llm.getPendingCount()).toBe(0);
  });

  it("should support mockToolCall factory", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "mock-model" });
    const ctx = createMockContext(false);

    llm.setResponses([
      mockToolCall("read_file", { path: "test.ts" }),
    ]);

    const msg = await llm.complete(ctx);
    expect(msg.stopReason).toBe("toolUse");
    expect(msg.content.some((c) => c.type === "toolCall" && c.name === "read_file")).toBe(true);
  });

  it("should support mockError factory and emit error event", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "mock-model" });
    const ctx = createMockContext(false);

    llm.setResponses([mockError("something went wrong")]);

    const msg = await llm.complete(ctx);
    expect(msg.stopReason).toBe("error");
    expect(msg.errorMessage).toBe("something went wrong");
  });

  it("should support ResponseFactory for dynamic responses", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "mock-model" });
    const ctx = createMockContext(false);

    llm.setResponses([
      (_ctx, _opts, state) => mockText(`call #${state.callCount}`),
    ]);

    const msg = await llm.complete(ctx);
    expect(msg.content).toContainEqual({ type: "text", text: "call #1" });
  });

  it("should fall back to default behavior when queue is empty", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "mock-model" });
    const ctx = createMockContext(false);

    llm.setResponses([mockText("from queue")]);
    await llm.complete(ctx);

    const msg = await llm.complete(ctx);
    expect(msg.stopReason).toBe("toolUse");
  });

  it("appendResponses should add to existing queue", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "mock-model" });

    llm.setResponses([mockText("a")]);
    llm.appendResponses([mockText("b")]);

    expect(llm.getPendingCount()).toBe(2);
  });

  it("should track callCount across invocations", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "mock-model" });
    const ctx = createMockContext(false);

    llm.setResponses([mockText("a"), mockText("b")]);
    await llm.complete(ctx);
    await llm.complete(ctx);

    expect(llm.state.callCount).toBe(2);
  });
});
