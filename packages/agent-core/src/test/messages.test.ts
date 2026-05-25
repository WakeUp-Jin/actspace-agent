import { describe, it, expect } from "vitest";
import {
  getTextContent,
  getToolCalls,
  hasToolCalls,
  getThinkingContent,
  getMessageText,
  createEmptyUsage,
  accumulateUsage,
} from "../messages";
import type { AssistantMessage, UserMessage, ToolResultMessage, Usage } from "../messages";

const emptyUsage = createEmptyUsage();

function createAssistantMsg(content: AssistantMessage["content"]): AssistantMessage {
  return {
    role: "assistant",
    content,
    model: "test",
    provider: "test",
    usage: emptyUsage,
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

describe("Message utility functions", () => {
  describe("getTextContent", () => {
    it("should extract text from assistant message", () => {
      const msg = createAssistantMsg([
        { type: "thinking", thinking: "hmm" },
        { type: "text", text: "Hello " },
        { type: "text", text: "World" },
      ]);
      expect(getTextContent(msg)).toBe("Hello World");
    });

    it("should return empty string when no text content", () => {
      const msg = createAssistantMsg([{ type: "thinking", thinking: "hmm" }]);
      expect(getTextContent(msg)).toBe("");
    });
  });

  describe("getToolCalls", () => {
    it("should extract tool calls", () => {
      const msg = createAssistantMsg([
        { type: "text", text: "checking" },
        { type: "toolCall", id: "tc1", name: "read_file", arguments: { path: "a.ts" } },
        { type: "toolCall", id: "tc2", name: "search_files", arguments: { query: "test" } },
      ]);
      const calls = getToolCalls(msg);
      expect(calls.length).toBe(2);
      expect(calls[0].name).toBe("read_file");
      expect(calls[1].name).toBe("search_files");
    });

    it("should return empty array when no tool calls", () => {
      const msg = createAssistantMsg([{ type: "text", text: "no tools" }]);
      expect(getToolCalls(msg)).toEqual([]);
    });
  });

  describe("hasToolCalls", () => {
    it("should return true when tool calls exist", () => {
      const msg = createAssistantMsg([
        { type: "toolCall", id: "tc1", name: "read_file", arguments: {} },
      ]);
      expect(hasToolCalls(msg)).toBe(true);
    });

    it("should return false when no tool calls", () => {
      const msg = createAssistantMsg([{ type: "text", text: "hi" }]);
      expect(hasToolCalls(msg)).toBe(false);
    });
  });

  describe("getThinkingContent", () => {
    it("should extract thinking text", () => {
      const msg = createAssistantMsg([
        { type: "thinking", thinking: "Step 1. " },
        { type: "thinking", thinking: "Step 2." },
        { type: "text", text: "result" },
      ]);
      expect(getThinkingContent(msg)).toBe("Step 1. Step 2.");
    });
  });

  describe("getMessageText", () => {
    it("should work for user string content", () => {
      const msg: UserMessage = { role: "user", content: "hello", timestamp: Date.now() };
      expect(getMessageText(msg)).toBe("hello");
    });

    it("should work for user array content", () => {
      const msg: UserMessage = {
        role: "user",
        content: [{ type: "text", text: "a" }, { type: "text", text: "b" }],
        timestamp: Date.now(),
      };
      expect(getMessageText(msg)).toBe("ab");
    });

    it("should work for tool result", () => {
      const msg: ToolResultMessage = {
        role: "toolResult",
        toolCallId: "tc1",
        toolName: "test",
        content: [{ type: "text", text: "output" }],
        isError: false,
        timestamp: Date.now(),
      };
      expect(getMessageText(msg)).toBe("output");
    });
  });

  describe("Usage accumulation", () => {
    it("createEmptyUsage should return all zeros", () => {
      const u = createEmptyUsage();
      expect(u.input).toBe(0);
      expect(u.output).toBe(0);
      expect(u.totalTokens).toBe(0);
      expect(u.cost.total).toBe(0);
    });

    it("accumulateUsage should add values", () => {
      const total = createEmptyUsage();
      const delta: Usage = {
        input: 100, output: 50, cacheRead: 10, cacheWrite: 5,
        reasoning: 0, cacheHit: 10, cacheMiss: 90, totalTokens: 165,
        cost: { input: 0.01, output: 0.005, cacheRead: 0.001, cacheWrite: 0.0005, total: 0.0165 },
      };

      accumulateUsage(total, delta);
      expect(total.input).toBe(100);
      expect(total.output).toBe(50);
      expect(total.totalTokens).toBe(165);
      expect(total.cost.total).toBeCloseTo(0.0165);

      accumulateUsage(total, delta);
      expect(total.input).toBe(200);
      expect(total.totalTokens).toBe(330);
    });
  });
});
