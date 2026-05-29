import { describe, expect, it } from "vitest";
import { ConversationContext } from "../modules/conversation";
import type { AssistantMessage, Message, ToolResultMessage, UserMessage } from "../../messages";
import { createEmptyUsage } from "../../messages";

function user(text: string): UserMessage {
  return { role: "user", content: text, timestamp: Date.now(), source: "user" };
}

function assistantText(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    model: "m",
    provider: "mock",
    usage: createEmptyUsage(),
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function assistantToolCall(id: string, name: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id, name, arguments: {} }],
    model: "m",
    provider: "mock",
    usage: createEmptyUsage(),
    stopReason: "toolUse",
    timestamp: Date.now(),
  };
}

function toolResult(id: string, name: string): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: id,
    toolName: name,
    content: [{ type: "text", text: "result" }],
    isError: false,
    timestamp: Date.now(),
  };
}

function summary(): UserMessage {
  return { role: "user", content: "[摘要]", timestamp: Date.now(), source: "compaction" };
}

describe("ConversationContext.planCompaction", () => {
  it("returns null for empty history", () => {
    const ctx = new ConversationContext();
    expect(ctx.planCompaction(0.3)).toBeNull();
  });

  it("returns null when keepRatio keeps everything", () => {
    const ctx = new ConversationContext([user("a"), assistantText("b")]);
    expect(ctx.planCompaction(1)).toBeNull();
  });

  it("splits at an assistant boundary and never starts the kept region with an orphan toolResult", () => {
    const messages: Message[] = [];
    for (let i = 0; i < 10; i++) {
      messages.push(user(`q${i}`));
      messages.push(assistantToolCall(`tc${i}`, "bash"));
      messages.push(toolResult(`tc${i}`, "bash"));
      messages.push(assistantText(`a${i}`));
    }
    const ctx = new ConversationContext(messages);
    const plan = ctx.planCompaction(0.3);
    expect(plan).not.toBeNull();
    const kept = ctx.getMessages().slice(plan!.split);
    expect(kept[0]?.role).toBe("assistant");
    // 不动区不能以 toolResult 开头（会变孤儿）
    expect(kept[0]?.role).not.toBe("toolResult");
  });
});

describe("ConversationContext.applyCompaction", () => {
  it("replaces the leading region with the summary and keeps the recent tail", () => {
    const messages: Message[] = [
      user("old-1"),
      assistantText("old-2"),
      user("recent-1"),
      assistantText("recent-2"),
    ];
    const ctx = new ConversationContext(messages);
    const removed = ctx.applyCompaction(summary(), 2);

    expect(removed).toHaveLength(2);
    const after = ctx.getMessages();
    expect(after).toHaveLength(3);
    expect(after[0].source).toBe("compaction");
    expect(after[1]).toMatchObject({ content: "recent-1" });
    expect(after[2]).toMatchObject({ content: [{ type: "text", text: "recent-2" }] });
  });

  it("no-ops on out-of-range split", () => {
    const ctx = new ConversationContext([user("a")]);
    expect(ctx.applyCompaction(summary(), 0)).toEqual([]);
    expect(ctx.applyCompaction(summary(), 99)).toEqual([]);
    expect(ctx.getMessageCount()).toBe(1);
  });
});
