import { describe, it, expect } from "vitest";
import {
  formatUserMessageForModel,
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

  it("persists user message attachments and image analyses in the payload", () => {
    const msg = createMockUserMessage("Please inspect this screenshot.");
    const attachments = [
      {
        id: "att-image-1",
        kind: "image" as const,
        name: "screenshot.png",
        path: "/Users/test/screenshot.png",
        mimeType: "image/png",
      },
    ];
    const attachmentAnalyses = [
      {
        attachmentId: "att-image-1",
        toolName: "analyze_media" as const,
        status: "completed" as const,
        summary: "The screenshot shows a chat input with an attached image.",
        analyzedAt: "2026-06-02T00:00:00.000Z",
      },
    ];

    const events = userMessageToEvents(msg, SESSION_ID, TURN_ID, {
      attachments,
      attachmentAnalyses,
    });

    expect(events[0]).toMatchObject({
      type: "user_message",
      payload: {
        content: "Please inspect this screenshot.",
        attachments,
        attachmentAnalyses,
      },
    });
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

  it("recovers user messages with attachment metadata and analysis text injected for the model", () => {
    const user = createMockUserMessage("What does this show?");
    const events = userMessageToEvents(user, SESSION_ID, TURN_ID, {
      attachments: [
        {
          id: "att-image-1",
          kind: "image",
          name: "screenshot.png",
          path: "/Users/test/screenshot.png",
          mimeType: "image/png",
        },
        {
          id: "att-file-1",
          kind: "file",
          name: "notes.md",
          path: "/Users/test/notes.md",
          mimeType: "text/markdown",
        },
      ],
      attachmentAnalyses: [
        {
          attachmentId: "att-image-1",
          toolName: "analyze_media",
          status: "completed",
          summary: "The screenshot shows the Attach files menu.",
        },
      ],
    });

    const { messages, errors } = sessionEventsToMessages(events);

    expect(errors).toHaveLength(0);
    expect(messages[0]).toMatchObject({ role: "user" });
    expect(messages[0].content).toContain("Attached files:");
    expect(messages[0].content).toContain("[image] screenshot.png path=/Users/test/screenshot.png mime=image/png");
    expect(messages[0].content).toContain("[file] notes.md path=/Users/test/notes.md mime=text/markdown");
    expect(messages[0].content).toContain("Image analysis results:");
    expect(messages[0].content).toContain("The screenshot shows the Attach files menu.");
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

  it("preserves provider-native server tool usage on assistant replies", () => {
    const msg = createMockFinalReply();
    msg.usage.serverToolUse = { webSearchRequests: 1, webFetchRequests: 0 };

    const reply = toAssistantReply(msg);

    expect(reply.usage?.serverToolUse).toEqual({ webSearchRequests: 1, webFetchRequests: 0 });
  });
});

describe("Adapters: attachment formatting", () => {
  it("adds file metadata and image analyses to the model input without changing original content", () => {
    const formatted = formatUserMessageForModel(
      "Summarize the attachment.",
      [
        {
          id: "att-file-1",
          kind: "file",
          name: "notes.md",
          path: "/Users/test/notes.md",
          mimeType: "text/markdown",
        },
      ],
      [
        {
          attachmentId: "att-image-1",
          toolName: "analyze_media",
          status: "failed",
          errorMessage: "图片分析失败，模型只能看到附件路径和文件名。",
        },
      ],
    );

    expect(formatted).toContain("Summarize the attachment.");
    expect(formatted).toContain("Attached files:");
    expect(formatted).toContain("[file] notes.md path=/Users/test/notes.md mime=text/markdown");
    expect(formatted).toContain("use read_file with the provided path");
    expect(formatted).toContain("Image analysis results:");
    expect(formatted).toContain("analysis failed");
    expect(formatted).toContain("图片分析失败，模型只能看到附件路径和文件名。");
  });
});
