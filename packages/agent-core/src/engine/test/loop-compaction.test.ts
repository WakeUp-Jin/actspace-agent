import { describe, expect, it } from "vitest";
import { Agent } from "../agent";
import { MockLLMService, mockText } from "../../llm/services/mock";
import { ToolManager } from "../../tools/manager";
import { ContextManager } from "../../context/manager";
import { ConversationContext } from "../../context/modules/conversation";
import { SystemPromptContext } from "../../context/modules/system-prompt";
import type { Summarizer } from "../../context/compression/summarizer";
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

const summarizer: Summarizer = {
  async summarizeToolOutput() {
    return "tool-summary";
  },
  async summarizeHistory() {
    return "结构化历史摘要";
  },
};

function buildHeavyHistory(): Message[] {
  const messages: Message[] = [];
  const big = "x".repeat(4000);
  for (let i = 0; i < 8; i++) {
    messages.push(user(`q${i} ${big}`));
    messages.push(assistantToolCall(`tc${i}`));
    messages.push(toolResult(`tc${i}`, big));
    messages.push(assistantText(`a${i} ${big}`));
  }
  return messages;
}

describe("Agent loop mid-loop compaction", () => {
  it("compacts oversized history before the model call and still completes the turn", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "t", model: "deepseek-mock" });
    llm.setResponses([mockText("final reply after compaction")]);

    const conversation = new ConversationContext(buildHeavyHistory());
    const contextManager = new ContextManager({
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

    const toolManager = new ToolManager({ workspaceRoot: "/tmp/test" });

    const agent = new Agent({ llm, contextManager, toolManager, summarizer });

    expect(contextManager.needsCompression()).toBe(true);
    const result = await agent.run("new question");

    expect(result.message.stopReason).toBe("stop");
    // 压缩在模型调用前触发
    expect(contextManager.getCompressionCount()).toBe(1);
    // 压缩后会话第一条是合成摘要，且其后接 assistant，保证交替
    const messages = contextManager.getMessages();
    expect(messages[0].source).toBe("compaction");
  });

  it("does not compact when history is small", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "t", model: "deepseek-mock" });
    llm.setResponses([mockText("hi there")]);

    const contextManager = new ContextManager({
      systemPromptModule: new SystemPromptContext("sys"),
      conversation: new ConversationContext([user("hello"), assistantText("hi")]),
      config: { contextWindow: 200_000, compactMinIntervalCalls: 1 },
    });
    const toolManager = new ToolManager({ workspaceRoot: "/tmp/test" });
    const agent = new Agent({ llm, contextManager, toolManager, summarizer });

    await agent.run("hello again");
    expect(contextManager.getCompressionCount()).toBe(0);
  });
});
