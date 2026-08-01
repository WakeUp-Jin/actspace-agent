import { describe, it, expect } from "vitest";
import { MODEL_REGISTRY, type SessionEvent } from "@actspace/shared";
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
import { convertContextToResponses } from "../llm/responses-convert";
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

  it("persists user message attachments in the payload", () => {
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

    const events = userMessageToEvents(msg, SESSION_ID, TURN_ID, {
      attachments,
    });

    expect(events[0]).toMatchObject({
      type: "user_message",
      payload: {
        content: "Please inspect this screenshot.",
        attachments,
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

  it("recovers user messages with attachment metadata injected for the model", () => {
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
    });

    const { messages, errors } = sessionEventsToMessages(events);

    expect(errors).toHaveLength(0);
    expect(messages[0]).toMatchObject({ role: "user" });
    expect(messages[0].content).toContain("Attached files:");
    expect(messages[0].content).toContain("[image] screenshot.png path=/Users/test/screenshot.png mime=image/png");
    expect(messages[0].content).toContain("[file] notes.md path=/Users/test/notes.md mime=text/markdown");
    expect(messages[0].content).toContain("<runtime_model>");
    expect(messages[0].content).toContain("input: text");
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

  it("recovers assistant blocks in original order: thinking, text, then toolCalls last", () => {
    // 回归：tool_use 必须是 assistant 消息末尾块，text 排在 tool_use 后会被
    // DeepSeek Anthropic 兼容端 400 拒绝（tool_use 后必须紧跟 tool_result）。
    const assistant: AssistantMessage = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Let me run a command." },
        { type: "text", text: "好的，我来执行命令。" },
        { type: "toolCall", id: "tc_bash_1", name: "bash", arguments: { command: "echo hi" } },
      ],
      model: "deepseek-mock",
      provider: "deepseek",
      usage: createEmptyUsage(),
      stopReason: "toolUse",
      timestamp: Date.now(),
      source: "llm",
    };

    const events = assistantMessageToEvents(assistant, SESSION_ID, TURN_ID);
    const { messages, errors } = sessionEventsToMessages(events);

    expect(errors).toHaveLength(0);
    const recovered = messages.find((m) => m.role === "assistant");
    expect(recovered).toBeDefined();
    if (recovered?.role === "assistant") {
      expect(recovered.content.map((block) => block.type)).toEqual(["thinking", "text", "toolCall"]);
    }
  });

  it("preserves provider reasoning signatures through session persistence", () => {
    const signature = "openai-responses-reasoning:{\"id\":\"rs_1\",\"type\":\"reasoning\",\"summary\":[]}";
    const assistant: AssistantMessage = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "", signature },
        { type: "toolCall", id: "call_1", name: "read_file", arguments: { path: "README.md" } },
      ],
      api: "openai-responses",
      model: "gpt-5.6-sol",
      provider: "duckcoding",
      usage: createEmptyUsage(),
      stopReason: "toolUse",
      timestamp: Date.now(),
    };

    const events = assistantMessageToEvents(assistant, SESSION_ID, TURN_ID);
    expect(events.find((event) => event.type === "thinking")?.payload).toMatchObject({
      signature,
      api: "openai-responses",
      model: "gpt-5.6-sol",
      provider: "duckcoding",
    });
    expect(events.find((event) => event.type === "tool_call")?.payload).toMatchObject({
      api: "openai-responses",
      model: "gpt-5.6-sol",
      provider: "duckcoding",
    });

    const { messages, errors } = sessionEventsToMessages(events);
    expect(errors).toHaveLength(0);
    const recovered = messages.find((message) => message.role === "assistant");
    expect(recovered).toMatchObject({
      role: "assistant",
      api: "openai-responses",
      model: "gpt-5.6-sol",
      provider: "duckcoding",
    });
    expect(recovered?.content).toContainEqual({ type: "thinking", thinking: "", signature });

    const converted = convertContextToResponses({ messages, tools: [] }, {
      provider: "duckcoding",
      api: "openai-responses",
      apiKey: "test-key",
      baseUrl: "https://api.duckcoding.ai/v1",
      model: "gpt-5.6-sol",
      input: ["text"],
    });
    expect(converted.input[0]).toMatchObject({ id: "rs_1", type: "reasoning" });
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

  it("does not replay incomplete thinking after an aborted turn", () => {
    const events: SessionEvent[] = [
      ...userMessageToEvents(createMockUserMessage("stop this"), SESSION_ID, TURN_ID),
      {
        id: "evt-thinking-aborted",
        sessionId: SESSION_ID,
        agentRunId: TURN_ID,
        type: "thinking",
        timestamp: new Date().toISOString(),
        schemaVersion: 2,
        payload: { content: "partial private reasoning" },
      },
      {
        id: "evt-turn-aborted",
        sessionId: SESSION_ID,
        agentRunId: TURN_ID,
        type: "agent_run_aborted",
        timestamp: new Date().toISOString(),
        schemaVersion: 2,
        payload: { reason: "user" },
      },
    ];

    const { messages, errors } = sessionEventsToMessages(events);

    expect(errors).toEqual([]);
    expect(messages.map((message) => message.role)).toEqual(["user"]);
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
  it("adds file metadata and text-only visual limitation to the model input", () => {
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
      { modelId: "deepseek-v4-pro", input: ["text"] },
    );

    expect(formatted).toContain("Summarize the attachment.");
    expect(formatted).toContain("Attached files:");
    expect(formatted).toContain("[file] notes.md path=/Users/test/notes.md mime=text/markdown");
    expect(formatted).toContain("use read_file with the provided path");
    expect(formatted).toContain("model_id: deepseek-v4-pro");
    expect(formatted).toContain("input: text");
  });

  it("returns image content parts for image-capable models", () => {
    const formatted = formatUserMessageForModel(
      "What is on screen?",
      [
        {
          id: "att-image-1",
          kind: "image",
          name: "screenshot.png",
          path: "data:image/png;base64,abc",
          mimeType: "image/png",
        },
      ],
      { modelId: "kimi-k2.6", input: ["text", "image"] },
    );

    expect(Array.isArray(formatted)).toBe(true);
    expect(formatted).toEqual([
      expect.objectContaining({ type: "text", text: expect.stringContaining("model_id: kimi-k2.6") }),
      { type: "image", data: "data:image/png;base64,abc", mimeType: "image/png" },
    ]);
  });

  it("routes Kimi K2.7 Code image attachments as native image input", () => {
    const spec = MODEL_REGISTRY["kimi-k2.7-code"];
    const formatted = formatUserMessageForModel(
      "Look at this.",
      [
        {
          id: "att-image-1",
          kind: "image",
          name: "screen.png",
          path: "data:image/png;base64,k27",
          mimeType: "image/png",
        },
      ],
      { modelId: spec.id, input: spec.input },
    );

    expect(spec.input).toContain("image");
    expect(Array.isArray(formatted)).toBe(true);
    expect(formatted).toEqual([
      expect.objectContaining({ type: "text", text: expect.stringContaining("model_id: kimi-k2.7-code") }),
      { type: "image", data: "data:image/png;base64,k27", mimeType: "image/png" },
    ]);
  });
});
