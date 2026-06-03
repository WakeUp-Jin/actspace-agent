import { describe, expect, it } from "vitest";
import type { RuntimeStreamEvent } from "@actspace/shared";
import { ContextManager } from "../../context/manager";
import type { Summarizer } from "../../context/compression/summarizer";
import { ConversationContext } from "../../context/modules/conversation";
import { SystemPromptContext } from "../../context/modules/system-prompt";
import { createEmptyUsage } from "../../messages";
import type { AssistantMessage, Message, ToolResultMessage, UserMessage } from "../../messages";
import { ToolManager } from "../../tools/manager";
import { compactContextWithAgent } from "../compact-context";

const summarizer: Summarizer = {
  async summarizeToolOutput() {
    return "tool-summary";
  },
  async summarizeHistory() {
    return "structured summary";
  },
};

function user(text: string): UserMessage {
  return { role: "user", content: text, timestamp: Date.now(), source: "user" };
}

function assistantText(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    model: "mock-model",
    provider: "mock",
    usage: createEmptyUsage(),
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function assistantToolCall(id: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id, name: "bash", arguments: {} }],
    model: "mock-model",
    provider: "mock",
    usage: createEmptyUsage(),
    stopReason: "toolUse",
    timestamp: Date.now(),
  };
}

function toolResult(id: string, text: string): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: id,
    toolName: "bash",
    content: [{ type: "text", text }],
    isError: false,
    timestamp: Date.now(),
  };
}

function makeContextManager(messages: Message[]): ContextManager {
  return new ContextManager({
    systemPromptModule: new SystemPromptContext("sys"),
    conversation: new ConversationContext(messages),
    sessionPath: "/data/sessions/s1/session.jsonl",
    config: {
      contextWindow: 200_000,
      compressionThreshold: 0.85,
      compressKeepRatio: 0.3,
      compactMinIntervalCalls: 99,
    },
  });
}

function heavyMessages(): Message[] {
  const messages: Message[] = [];
  const big = "x".repeat(4000);
  for (let i = 0; i < 8; i++) {
    messages.push(user(`question ${i} ${big}`));
    messages.push(assistantToolCall(`tc${i}`));
    messages.push(toolResult(`tc${i}`, big));
    messages.push(assistantText(`answer ${i} ${big}`));
  }
  return messages;
}

describe("compactContextWithAgent", () => {
  it("forces manual compaction and emits lifecycle stream events", async () => {
    const streamEvents: RuntimeStreamEvent[] = [];
    const result = await compactContextWithAgent(
      { sessionId: "session-1", turnId: "turn-compact" },
      {
        contextManager: makeContextManager(heavyMessages()),
        toolManager: new ToolManager({ workspaceRoot: "/tmp" }),
        summarizer,
      },
      {
        onStreamEvent: (event) => streamEvents.push(event),
      },
    );

    expect(result.status).toBe("compacted");
    expect(result.events.some((event) => event.type === "context_compaction")).toBe(true);
    expect(streamEvents.map((event) => event.type)).toEqual([
      "context_compaction_started",
      "context_compaction_progress",
      "context_compaction_progress",
      "context_compaction_finished",
    ]);
    const finished = streamEvents.find((event): event is Extract<RuntimeStreamEvent, { type: "context_compaction_finished" }> =>
      event.type === "context_compaction_finished"
    );
    expect(finished?.status).toBe("compacted");
    expect(finished?.payload.trigger).toBe("manual");
  });

  it("returns skipped when manual compaction has no safe region", async () => {
    const streamEvents: RuntimeStreamEvent[] = [];
    const result = await compactContextWithAgent(
      { sessionId: "session-1", turnId: "turn-skip" },
      {
        contextManager: makeContextManager([user("hi")]),
        toolManager: new ToolManager({ workspaceRoot: "/tmp" }),
        summarizer,
      },
      {
        onStreamEvent: (event) => streamEvents.push(event),
      },
    );

    expect(result.status).toBe("skipped");
    const compactionEvent = result.events.find((event) => event.type === "context_compaction");
    expect(compactionEvent?.payload).toMatchObject({
      trigger: "manual",
      status: "skipped",
      removedCount: 0,
    });
    expect(streamEvents.at(-1)).toMatchObject({
      type: "context_compaction_finished",
      status: "skipped",
      summary: "Nothing to compact",
    });
  });
});
