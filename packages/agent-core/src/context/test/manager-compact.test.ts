import { describe, expect, it } from "vitest";
import { ContextManager } from "../manager";
import { ConversationContext } from "../modules/conversation";
import { SystemPromptContext } from "../modules/system-prompt";
import type { Summarizer } from "../compression/summarizer";
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
function assistantToolCall(id: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id, name: "bash", arguments: {} }],
    model: "m",
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

const okSummarizer: Summarizer = {
  async summarizeToolOutput() {
    return "tool-summary";
  },
  async summarizeHistory() {
    return "结构化摘要";
  },
};

/** 构造一段足够长、token 估算可超阈值的历史 */
function buildHeavyHistory(): Message[] {
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

function makeManager(conversation: ConversationContext): ContextManager {
  return new ContextManager({
    systemPromptModule: new SystemPromptContext("sys"),
    conversation,
    sessionPath: "/data/sessions/s1/session.jsonl",
    config: {
      contextWindow: 2000,
      compressionThreshold: 0.85,
      compressKeepRatio: 0.3,
      compactMinIntervalCalls: 1,
    },
  });
}

describe("ContextManager.compactIfNeeded", () => {
  it("does not compact when under threshold", async () => {
    const manager = new ContextManager({
      systemPromptModule: new SystemPromptContext("sys"),
      conversation: new ConversationContext([user("hi"), assistantText("hello")]),
      config: { contextWindow: 200_000, compactMinIntervalCalls: 1 },
    });
    const result = await manager.compactIfNeeded(okSummarizer);
    expect(result).toBeNull();
    expect(manager.getCompressionCount()).toBe(0);
  });

  it("compacts when over threshold and reduces token estimate", async () => {
    const manager = makeManager(new ConversationContext(buildHeavyHistory()));
    const before = manager.estimateTotalTokens();
    expect(manager.needsCompression()).toBe(true);

    const result = await manager.compactIfNeeded(okSummarizer);
    expect(result?.compacted).toBe(true);
    expect(manager.estimateTotalTokens()).toBeLessThan(before);
    expect(manager.getCompressionCount()).toBe(1);
    expect(manager.getUsageSnapshot().compressionCount).toBe(1);
  });

  it("suppresses compaction until the min interval is reached", async () => {
    const manager = new ContextManager({
      systemPromptModule: new SystemPromptContext("sys"),
      conversation: new ConversationContext(buildHeavyHistory()),
      sessionPath: "/data/sessions/s1/session.jsonl",
      config: {
        contextWindow: 2000,
        compressionThreshold: 0.85,
        compressKeepRatio: 0.3,
        compactMinIntervalCalls: 3,
      },
    });

    // 第 1、2 次调用：间隔未到，不压缩
    expect(await manager.compactIfNeeded(okSummarizer)).toBeNull();
    expect(await manager.compactIfNeeded(okSummarizer)).toBeNull();
    // 第 3 次：间隔到达，压缩
    const third = await manager.compactIfNeeded(okSummarizer);
    expect(third?.compacted).toBe(true);
  });
});
