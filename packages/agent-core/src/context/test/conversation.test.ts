import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SessionEvent } from "@actspace/shared";
import { ConversationContext } from "../modules/conversation";
import { appendEvents } from "../../persistence/jsonl";
import {
  MessagePriority,
  type AssistantMessage,
  type Message,
  type ToolResultMessage,
  type UserMessage,
} from "../../messages";

let testDir: string;

beforeEach(async () => {
  testDir = join(
    tmpdir(),
    `actspace-test-conversation-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

function createEvent(type: string, payload: unknown, idx: number): SessionEvent {
  return {
    id: `evt_${idx}`,
    sessionId: "test-session",
    turnId: "turn-1",
    type: type as SessionEvent["type"],
    timestamp: new Date().toISOString(),
    schemaVersion: 1,
    payload,
  };
}

describe("ConversationContext", () => {
  describe("constructor + initialMessages", () => {
    it("starts empty when no initial messages are provided", () => {
      const ctx = new ConversationContext();
      expect(ctx.getMessageCount()).toBe(0);
      expect(ctx.getMessages()).toEqual([]);
    });

    it("seeds messages and preserves their order", () => {
      const messages: Message[] = [
        { role: "user", content: "hi", timestamp: 1 } as UserMessage,
        {
          role: "assistant",
          content: [{ type: "text", text: "hello" }],
          model: "test",
          provider: "test",
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            reasoning: 0,
            cacheHit: 0,
            cacheMiss: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "stop",
          timestamp: 2,
        } as AssistantMessage,
      ];

      const ctx = new ConversationContext(messages);
      expect(ctx.getMessageCount()).toBe(2);
      const out = ctx.getMessages();
      expect(out[0].role).toBe("user");
      expect(out[1].role).toBe("assistant");
    });

    it("applies the same priority defaults as appendMessage for tool-bearing messages", () => {
      const assistantWithTool: AssistantMessage = {
        role: "assistant",
        content: [
          { type: "toolCall", id: "tc1", name: "read_file", arguments: { path: "a.ts" } },
        ],
        model: "test",
        provider: "test",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          reasoning: 0,
          cacheHit: 0,
          cacheMiss: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "toolUse",
        timestamp: 1,
      };
      const toolResult: ToolResultMessage = {
        role: "toolResult",
        toolCallId: "tc1",
        toolName: "read_file",
        content: [{ type: "text", text: "content" }],
        isError: false,
        timestamp: 2,
      };

      const ctx = new ConversationContext([assistantWithTool, toolResult]);
      const out = ctx.getMessages();
      const assistant = out[0] as AssistantMessage;
      const result = out[1] as ToolResultMessage;
      expect(assistant.priority).toBe(MessagePriority.HIGH);
      expect(result.priority).toBe(MessagePriority.HIGH);
    });
  });

  describe("createFromSession", () => {
    it("returns an empty context when session.jsonl does not exist", async () => {
      const missingPath = join(testDir, "nonexistent.jsonl");
      const ctx = await ConversationContext.createFromSession(missingPath);
      expect(ctx.getMessageCount()).toBe(0);
    });

    it("rebuilds messages from a user/assistant event stream", async () => {
      const sessionPath = join(testDir, "session.jsonl");
      const events: SessionEvent[] = [
        createEvent("user_message", { content: "ping" }, 1),
        createEvent(
          "assistant_message",
          {
            content: "pong",
            stopReason: "stop",
            model: "test",
            provider: "test",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          },
          2,
        ),
      ];
      await appendEvents(sessionPath, events);

      const ctx = await ConversationContext.createFromSession(sessionPath);
      const messages = ctx.getMessages();
      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe("user");
      expect(messages[1].role).toBe("assistant");
    });

    it("rebuilds messages from a tool-call/result event stream", async () => {
      const sessionPath = join(testDir, "session.jsonl");
      const events: SessionEvent[] = [
        createEvent("user_message", { content: "read a file" }, 1),
        createEvent(
          "tool_call",
          { id: "tc1", name: "read_file", arguments: { path: "a.ts" } },
          2,
        ),
        createEvent(
          "assistant_message",
          {
            content: "",
            stopReason: "toolUse",
            model: "test",
            provider: "test",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          },
          3,
        ),
        createEvent(
          "tool_result",
          {
            toolName: "read_file",
            toolCallId: "tc1",
            ok: true,
            summary: "Read file",
            modelOutput: "file content",
            truncatedOutput: "file content",
            rawOutput: "file content",
            uiPreview: {
              kind: "read",
              filePath: "a.ts",
              displayText: "Read a.ts",
            },
          },
          4,
        ),
      ];
      await appendEvents(sessionPath, events);

      const ctx = await ConversationContext.createFromSession(sessionPath);
      const roles = ctx.getMessages().map((m) => m.role);
      expect(roles).toContain("user");
      expect(roles).toContain("assistant");
      expect(roles).toContain("toolResult");
    });
  });
});
