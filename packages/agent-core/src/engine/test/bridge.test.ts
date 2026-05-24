import { describe, expect, it } from "vitest";
import { ContextManager } from "../../context/manager";
import { SystemPromptContext } from "../../context/modules/system-prompt";
import type { InternalTool, ToolResult } from "../../internal-tools";
import { MockLLMService } from "../../llm/services/mock";
import { ToolManager } from "../../tools/manager";
import { runTurnWithAgent } from "../bridge";

function createTestTool(name: string): InternalTool {
  return {
    name,
    description: `Test ${name}`,
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        query: { type: "string" },
      },
    },
    isReadOnly: true,
    handler: async (): Promise<ToolResult> => ({ success: true, data: `ok from ${name}` }),
  };
}

function createDeps() {
  const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "deepseek-mock" });
  const toolManager = new ToolManager({ workspaceRoot: "/tmp" });
  toolManager.register(createTestTool("read_file"));
  toolManager.register(createTestTool("search_files"));
  const contextManager = new ContextManager({
    systemPromptModule: new SystemPromptContext("You are a test assistant."),
  });
  return { llm, toolManager, contextManager };
}

describe("runTurnWithAgent bridge", () => {
  it("persists the user message before assistant and tool events", async () => {
    const result = await runTurnWithAgent(
      {
        sessionId: "session-test",
        turnId: "turn-test",
        userInput: "Please inspect the README.",
      },
      createDeps(),
    );

    expect(result.events[0]).toMatchObject({
      sessionId: "session-test",
      turnId: "turn-test",
      type: "user_message",
      payload: { content: "Please inspect the README." },
    });
    expect(result.events.map((event) => event.type)).toEqual([
      "user_message",
      "thinking",
      "tool_call",
      "tool_call",
      "tool_result",
      "tool_result",
      "thinking",
      "assistant_message",
      "context_snapshot",
    ]);
    expect(result.events.every((event) => event.turnId === "turn-test")).toBe(true);
  });
});
