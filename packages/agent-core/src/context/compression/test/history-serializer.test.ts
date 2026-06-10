import { describe, expect, it } from "vitest";
import { serializeMessagesForSummary } from "../history-serializer";
import type { AssistantMessage, ToolResultMessage, UserMessage } from "../../../messages";
import { createEmptyUsage } from "../../../messages";

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
