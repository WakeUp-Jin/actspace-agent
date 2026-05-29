import { describe, expect, it } from "vitest";
import { ConversationContext } from "../../modules/conversation";
import { compactHistory, serializeMessagesForSummary } from "../history-compactor";
import type { Summarizer } from "../summarizer";
import type { AssistantMessage, Message, ToolResultMessage, UserMessage } from "../../../messages";
import { createEmptyUsage } from "../../../messages";

const SESSION_PATH = "/data/sessions/s1/session.jsonl";

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
function assistantToolCall(id: string, name: string, args: Record<string, unknown>): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id, name, arguments: args }],
    model: "m",
    provider: "mock",
    usage: createEmptyUsage(),
    stopReason: "toolUse",
    timestamp: Date.now(),
  };
}
function toolResult(id: string, name: string, text: string): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: id,
    toolName: name,
    content: [{ type: "text", text }],
    isError: false,
    timestamp: Date.now(),
  };
}

function buildHistory(): Message[] {
  const messages: Message[] = [];
  for (let i = 0; i < 8; i++) {
    messages.push(user(`question ${i}`));
    messages.push(assistantToolCall(`tc${i}`, "bash", { command: `echo ${i}` }));
    messages.push(toolResult(`tc${i}`, "bash", `output ${i}`));
    messages.push(assistantText(`answer ${i}`));
  }
  return messages;
}

const okSummarizer: Summarizer = {
  async summarizeToolOutput() {
    return "tool-summary";
  },
  async summarizeHistory() {
    return "1. 主请求...\n6. 所有用户消息...";
  },
};

const failingSummarizer: Summarizer = {
  async summarizeToolOutput() {
    throw new Error("flash down");
  },
  async summarizeHistory() {
    throw new Error("flash down");
  },
};

describe("serializeMessagesForSummary", () => {
  it("renders roles, tool calls and tool results into readable lines", () => {
    const text = serializeMessagesForSummary([
      user("hi"),
      assistantToolCall("tc1", "bash", { command: "ls" }),
      toolResult("tc1", "bash", "file.txt"),
      assistantText("done"),
    ]);
    expect(text).toContain("【用户】hi");
    expect(text).toContain("【工具调用】bash");
    expect(text).toContain("【工具结果】bash: file.txt");
    expect(text).toContain("【助手】done");
  });
});

describe("compactHistory", () => {
  it("replaces the older region with a summary that points to session.jsonl", async () => {
    const conversation = new ConversationContext(buildHistory());
    const before = conversation.getMessageCount();

    const result = await compactHistory({
      conversation,
      summarizer: okSummarizer,
      sessionJsonlPath: SESSION_PATH,
      keepRatio: 0.3,
    });

    expect(result.compacted).toBe(true);
    expect(result.reason).toBe("ok");
    expect(result.removedCount).toBeGreaterThan(0);
    expect(conversation.getMessageCount()).toBeLessThan(before);

    const messages = conversation.getMessages();
    const summaryMsg = messages[0];
    expect(summaryMsg.source).toBe("compaction");
    const body = typeof summaryMsg.content === "string" ? summaryMsg.content : "";
    expect(body).toContain(SESSION_PATH);
    expect(body).toContain("所有用户消息");
    // 不动区紧跟摘要的应是 assistant，保证 user→assistant 交替
    expect(messages[1]?.role).toBe("assistant");
  });

  it("falls back to dropping the oldest region when the summarizer fails", async () => {
    const conversation = new ConversationContext(buildHistory());
    const result = await compactHistory({
      conversation,
      summarizer: failingSummarizer,
      sessionJsonlPath: SESSION_PATH,
      keepRatio: 0.3,
    });

    expect(result.compacted).toBe(true);
    expect(result.reason).toBe("fallback-dropped");
    const body = typeof conversation.getMessages()[0].content === "string"
      ? (conversation.getMessages()[0].content as string)
      : "";
    expect(body).toContain("摘要模型不可用");
    expect(body).toContain(SESSION_PATH);
  });

  it("falls back when no summarizer is provided", async () => {
    const conversation = new ConversationContext(buildHistory());
    const result = await compactHistory({
      conversation,
      summarizer: undefined,
      sessionJsonlPath: SESSION_PATH,
      keepRatio: 0.3,
    });
    expect(result.compacted).toBe(true);
    expect(result.reason).toBe("fallback-dropped");
  });

  it("returns nothing-to-compact for short history", async () => {
    const conversation = new ConversationContext([user("a")]);
    const result = await compactHistory({
      conversation,
      summarizer: okSummarizer,
      sessionJsonlPath: SESSION_PATH,
      keepRatio: 0.3,
    });
    expect(result.compacted).toBe(false);
    expect(result.reason).toBe("nothing-to-compact");
  });
});
