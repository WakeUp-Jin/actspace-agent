import { describe, it, expect } from "vitest";
import {
  messageToEvents,
  sessionEventsToMessages,
  toAssistantReply,
  userMessageToEvents,
  assistantMessageToEvents,
  toolResultMessageToEvents,
} from "../adapters";
import type { UserMessage, AssistantMessage, ToolResultMessage } from "../messages";
import { createEmptyUsage } from "../messages";
import {
  createMockUserMessage,
  createMockAssistantWithToolCalls,
  createMockReadFileResult,
  createMockFinalReply,
  createMockFullTurnMessages,
} from "../fixtures";

const SESSION_ID = "test-session";
const TURN_ID = "turn-1";

describe("Adapters: Message -> SessionEvent", () => {
  it("should convert user message to event", () => {
    const msg = createMockUserMessage("Hello");
    const events = userMessageToEvents(msg, SESSION_ID, TURN_ID);

    expect(events.length).toBe(1);
    expect(events[0].type).toBe("user_message");
    expect(events[0].sessionId).toBe(SESSION_ID);
  });

  it("should convert assistant with tool calls to events", () => {
    const msg = createMockAssistantWithToolCalls();
    const events = assistantMessageToEvents(msg, SESSION_ID, TURN_ID);

    const types = events.map((e) => e.type);
    expect(types).toContain("thinking");
    expect(types).toContain("tool_call");
    // Should have an assistant_message event too (even with empty text, since toolCalls.length > 0 the text event may be skipped)
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it("should convert tool result to event", () => {
    const msg = createMockReadFileResult();
    const events = toolResultMessageToEvents(msg, SESSION_ID, TURN_ID);

    expect(events.length).toBe(1);
    expect(events[0].type).toBe("tool_result");
  });

  it("should convert final reply to events with text", () => {
    const msg = createMockFinalReply();
    const events = assistantMessageToEvents(msg, SESSION_ID, TURN_ID);

    const types = events.map((e) => e.type);
    expect(types).toContain("thinking");
    expect(types).toContain("assistant_message");
  });

  it("messageToEvents should dispatch by role", () => {
    const user = createMockUserMessage();
    const assistant = createMockFinalReply();
    const toolResult = createMockReadFileResult();

    expect(messageToEvents(user, SESSION_ID, TURN_ID)[0].type).toBe("user_message");
    expect(messageToEvents(assistant, SESSION_ID, TURN_ID).some((e) => e.type === "assistant_message")).toBe(true);
    expect(messageToEvents(toolResult, SESSION_ID, TURN_ID)[0].type).toBe("tool_result");
  });
});

describe("Adapters: SessionEvent -> Message (recovery)", () => {
  it("should recover user messages", () => {
    const user = createMockUserMessage("test");
    const events = userMessageToEvents(user, SESSION_ID, TURN_ID);

    const { messages, errors } = sessionEventsToMessages(events);
    expect(errors.length).toBe(0);
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe("user");
  });

  it("should recover assistant messages with usage", () => {
    const assistant = createMockFinalReply();
    const events = assistantMessageToEvents(assistant, SESSION_ID, TURN_ID);

    const { messages } = sessionEventsToMessages(events);
    const recovered = messages.find((m) => m.role === "assistant");
    expect(recovered).toBeDefined();
    if (recovered?.role === "assistant") {
      expect(recovered.usage).toBeDefined();
    }
  });

  it("should handle full turn round-trip", () => {
    const allMessages = createMockFullTurnMessages();
    const allEvents = allMessages.flatMap((msg) =>
      messageToEvents(msg, SESSION_ID, TURN_ID),
    );

    const { messages, errors } = sessionEventsToMessages(allEvents);
    expect(errors.length).toBe(0);
    expect(messages.length).toBeGreaterThanOrEqual(3);

    const roles = messages.map((m) => m.role);
    expect(roles).toContain("user");
    expect(roles).toContain("assistant");
    expect(roles).toContain("toolResult");
  });
});

describe("Adapters: toAssistantReply", () => {
  it("should extract text, model, provider, usage", () => {
    const msg = createMockFinalReply();
    const reply = toAssistantReply(msg);

    expect(reply.content).toBeTruthy();
    expect(reply.model).toBe("deepseek-mock");
    expect(reply.provider).toBe("deepseek");
    expect(reply.stopReason).toBe("stop");
    expect(reply.usage).toBeDefined();
    expect(reply.usage!.totalTokens).toBeGreaterThan(0);
  });
});
